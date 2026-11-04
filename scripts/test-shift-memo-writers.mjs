// 実際の保存関数を抽出し、架空のシフトだけでメモ保持と失敗時の挙動を確認する。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

function loadWriter(file, name, bindings) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let declaration
  const find = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) declaration = node
    ts.forEachChild(node, find)
  }
  find(source)
  assert.ok(declaration?.initializer, `Missing real writer ${name}`)
  const initializer = ts.createPrinter().printNode(ts.EmitHint.Expression, declaration.initializer, source)
  const code = ts.transpileModule(`exports.writer = ${initializer}`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, console: { error() {} }, ...bindings }, { filename: file })
  return exports.writer
}

const clone = value => JSON.parse(JSON.stringify(value))
const keyOf = row => `${row.cast_id}:${row.shift_date}`
function database(initial = [], failure = false) {
  const rows = new Map(initial.map(row => [keyOf(row), clone(row)])), calls = []
  const client = { from(table) {
    assert.equal(table, 'cast_shifts')
    let values
    const response = () => {
      if (failure) return { data: null, error: { message: 'シフト.管理 がありません' } }
      const written = values.map(row => {
        const key = keyOf(row), merged = { memo: '', ...rows.get(key), ...clone(row) }
        rows.set(key, merged)
        return merged
      })
      return { data: written, error: null }
    }
    const query = {
      upsert(payload, options) {
        calls.push({ values: clone(payload), options: clone(options) })
        values = Array.isArray(payload) ? payload : [payload]
        return query
      },
      select() { return query },
      single() { const result = response(); return Promise.resolve({ ...result, data: result.data?.[0] ?? null }) },
      then(resolve, reject) { return Promise.resolve(response()).then(resolve, reject) },
    }
    return query
  } }
  return { client, rows, calls }
}

const date = '2026-11-05'
const original = { cast_id: 'cast-1', shift_date: date, status: '希望出勤', memo: '出勤時間: 20:30\n同伴の可能性あり' }
function hookWriter(env) {
  const invalidations = []
  const writer = loadWriter('hooks/useCasts.ts', 'upsertShift', {
    useCallback: callback => callback,
    supabase: env.client,
    extractMonth: value => value.slice(0, 7),
    invalidateCastPageMonth: (...args) => invalidations.push(['cast', ...args]),
    invalidateCastsKPI: (...args) => invalidations.push(['kpi', ...args]),
  })
  return { writer, invalidations }
}

test('個人シフトの確定は memo を送らず、最新の時間メモ・既存備考を保持する', async () => {
  const env = database([original]), { writer, invalidations } = hookWriter(env)
  // 他の画面で更新された最新メモを、古い画面のステータス確定で上書きしない。
  env.rows.get(keyOf(original)).memo = '出勤時間: 21:00\n直前に変更した備考'
  const result = await writer('cast-1', date, '出勤')
  assert.equal(result.status, '出勤')
  assert.equal(result.memo, '出勤時間: 21:00\n直前に変更した備考')
  assert.equal(Object.hasOwn(env.calls[0].values, 'memo'), false)
  assert.deepEqual(env.calls[0].options, { onConflict: 'cast_id,shift_date' })
  assert.deepEqual(invalidations, [['cast', 'cast-1', '2026-11'], ['kpi', '2026-11']])
})

test('個人シフトの明示的な memo 指定は変更・空文字で消去できる', async () => {
  const env = database([original]), { writer } = hookWriter(env)
  assert.equal((await writer('cast-1', date, '希望出勤', '出勤時間: 22:30')).memo, '出勤時間: 22:30')
  assert.equal((await writer('cast-1', date, '希望出勤', '')).memo, '')
  assert.equal(Object.hasOwn(env.calls[1].values, 'memo'), true)
})

test('新規の個人シフトは時間メモなしでも作成できる', async () => {
  const env = database(), { writer } = hookWriter(env)
  const result = await writer('cast-1', date, '希望出勤')
  assert.equal(result.status, '希望出勤')
  assert.equal(result.memo, '')
  assert.equal(Object.hasOwn(env.calls[0].values, 'memo'), false)
})

test('個人シフトの権限・通信エラーではメモとキャッシュを変更しない', async () => {
  const env = database([original], true), { writer, invalidations } = hookWriter(env)
  assert.equal(await writer('cast-1', date, '出勤'), null)
  assert.deepEqual(env.rows.get(keyOf(original)), original)
  assert.deepEqual(invalidations, [])
})

function attendanceWriter(env, initialShifts, casts, checked) {
  let state = new Map(initialShifts)
  const writer = loadWriter('app/admin/daily-sales/page.tsx', 'syncAttendanceToShifts', {
    casts: casts.map(id => ({ id })),
    attendanceChecked: new Set(checked),
    shifts: new Map(initialShifts), date, supabase: env.client,
    setShifts: update => { state = update(state) },
  })
  return { writer, getShifts: () => state }
}

test('日次売上の出勤確認は出勤・休みだけ更新し、時間メモと一般備考を残す', async () => {
  const second = { cast_id: 'cast-2', shift_date: date, status: '出勤', memo: '遅れる場合は連絡' }
  const unchanged = { cast_id: 'cast-3', shift_date: date, status: '休み', memo: '帰省中' }
  const env = database([original, second, unchanged])
  const { writer, getShifts } = attendanceWriter(env, [['cast-1', '希望出勤'], ['cast-2', '出勤'], ['cast-3', '休み']], ['cast-1', 'cast-2', 'cast-3', 'cast-4'], ['cast-1', 'cast-4'])
  await writer()
  assert.equal(env.rows.get(keyOf(original)).status, '出勤')
  assert.equal(env.rows.get(keyOf(original)).memo, original.memo)
  assert.equal(env.rows.get(keyOf(second)).status, '休み')
  assert.equal(env.rows.get(keyOf(second)).memo, second.memo)
  assert.deepEqual(env.rows.get(keyOf(unchanged)), unchanged)
  assert.equal(env.rows.get(`cast-4:${date}`).memo, '')
  assert.deepEqual(env.calls[0].values.map(row => row.cast_id), ['cast-1', 'cast-2', 'cast-4'])
  assert.ok(env.calls[0].values.every(row => !Object.hasOwn(row, 'memo')))
  assert.equal(getShifts().get('cast-1'), '出勤')
  assert.equal(getShifts().get('cast-2'), '休み')
})

test('日次売上の出勤確認が同じなら保存し直さずメモを維持する', async () => {
  const existing = { ...original, status: '出勤' }, env = database([existing])
  const { writer } = attendanceWriter(env, [['cast-1', '出勤']], ['cast-1'], ['cast-1'])
  await writer()
  assert.equal(env.calls.length, 0)
  assert.deepEqual(env.rows.get(keyOf(existing)), existing)
})

test('日次売上の出勤確認が失敗したら、成功扱いやローカルのステータス変更をしない', async () => {
  const env = database([original], true)
  const { writer, getShifts } = attendanceWriter(env, [['cast-1', '希望出勤']], ['cast-1'], ['cast-1'])
  await assert.rejects(writer, /出勤シフトの保存に失敗/)
  assert.deepEqual(env.rows.get(keyOf(original)), original)
  assert.equal(getShifts().get('cast-1'), '希望出勤')
})
