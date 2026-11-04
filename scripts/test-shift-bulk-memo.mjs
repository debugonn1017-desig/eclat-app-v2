// 一括管理の実保存関数を架空DBで実行。別画面の出勤確定・メモ変更と再送を検証する。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.createSourceFile('shifts.tsx', fs.readFileSync('app/admin/shifts/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let saveDeclaration
function find(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handleSave') saveDeclaration = node.initializer
  ts.forEachChild(node, find)
}
find(source)
assert.ok(saveDeclaration)
const code = ts.transpileModule('exports.save = ' + ts.createPrinter().printNode(ts.EmitHint.Expression, saveDeclaration, source), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const date = '2026-11-05', keyOf = row => `${row.cast_id}:${row.shift_date}`
const row = (id, status = '希望出勤', memo = '衣装確認') => ({ cast_id: id, shift_date: date, status, memo })
const withTime = memo => '希望出勤時間: 20:30' + (memo ? '\n' + memo : '')

function fixture({ initial, drafts, memoIds = [], stored = initial, failure = null, disabled = false }) {
  const database = new Map(stored.map(value => [keyOf(value), { ...value }])), calls = [], messages = []
  const shiftData = new Map(drafts.map(value => [keyOf(value), { status: value.status, memo: value.memo }]))
  const dirtyKeys = new Set(drafts.map(keyOf)), memoDirtyKeys = new Set(memoIds.map(id => `${id}:${date}`))
  const baselineRef = { current: new Map(initial.map(value => [keyOf(value), { status: value.status, memo: value.memo }])) }
  const state = { data: shiftData, dirty: dirtyKeys, memoDirty: memoDirtyKeys, saving: false, undo: ['before'], redo: ['after'] }, draftRef = { current: { data: shiftData, dirty: dirtyKeys, memoDirty: memoDirtyKeys } }
  const supabase = { from(table) {
    assert.equal(table, 'cast_shifts')
    let operation, values, filters = []
    const query = {
      update(value) { operation = 'update'; values = value; return query },
      upsert(value) { operation = 'upsert'; values = value; return query },
      insert(value) { operation = 'insert'; values = value; return query },
      delete() { operation = 'delete'; return query },
      eq(field, value) { filters.push([field, value]); return query },
      is(field, value) { filters.push([field, value]); return query },
      select() { return query },
      then(resolve, reject) {
        calls.push({ operation, values: structuredClone(values), filters })
        if (failure?.(operation, calls.length)) return Promise.resolve({ data: null, error: { message: '架空の保存失敗' } }).then(resolve, reject)
        if (operation === 'insert' && values.some(value => database.has(keyOf(value)))) return Promise.resolve({ data: null, error: { code: '23505', message: '架空の重複' } }).then(resolve, reject)
        let data = []
        if (operation === 'upsert' || operation === 'insert') for (const value of values) {
          const key = keyOf(value), updated = { memo: '', ...database.get(key), ...value }
          database.set(key, updated); data.push({ ...updated })
        }
        else for (const [key, value] of database) {
          if (!filters.every(([field, expected]) => value[field] === expected)) continue
          if (operation === 'delete') database.delete(key)
          else { const updated = { ...value, ...values }; database.set(key, updated); data.push({ ...updated }) }
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      },
    }
    return query
  } }
  const exports = {}
  vm.runInNewContext(code, {
    exports, console: { error() {} }, Error, gridDisabled: disabled, dirtyKeys, shiftData, memoDirtyKeys, baselineRef, draftRef, supabase,
    preActionSnapshot: { current: null }, isDragging: { current: false }, dragChanged: { current: false },
    setSaving: value => { state.saving = value }, setShiftData: value => { state.data = value }, setDirtyKeys: value => { state.dirty = value }, setMemoDirtyKeys: value => { state.memoDirty = value },
    setUndoStack: value => { state.undo = value }, setRedoStack: value => { state.redo = value }, toast: (...args) => messages.push(args),
  })
  return { save: exports.save, database, calls, messages, state, baselineRef }
}

test('時間だけ保存しても別画面の出勤確定を戻さず、最新の状態を画面へ戻す', async () => {
  const initial = [row('one')], env = fixture({ initial, drafts: [row('one', '希望出勤', withTime('衣装確認'))], memoIds: ['one'], stored: [row('one', '出勤')] })
  await env.save()
  assert.equal(env.calls[0].operation, 'update'); assert.deepEqual(env.calls[0].values, { memo: withTime('衣装確認') })
  assert.equal(env.database.get(`one:${date}`).status, '出勤')
  assert.equal(env.state.data.get(`one:${date}`).status, '出勤')
  assert.equal(env.state.dirty.size, 0); assert.equal(env.messages.at(-1)[1], 'success')
})

test('別画面で自由メモが変わったら競合を案内し、元のメモも下書きも消さない', async () => {
  const env = fixture({ initial: [row('one')], drafts: [row('one', '希望出勤', withTime('衣装確認'))], memoIds: ['one'], stored: [row('one', '希望出勤', '新しい備考')] })
  await env.save()
  assert.equal(env.database.get(`one:${date}`).memo, '新しい備考')
  assert.equal(env.state.data.get(`one:${date}`).memo, withTime('衣装確認'))
  assert.equal(env.state.dirty.size, 1); assert.match(env.messages.at(-1)[0], /メモが変更・削除/); assert.equal(env.messages.at(-1)[1], 'error')
})

test('既存NULLメモも保存でき、未取得・保存中等の禁止状態では書き込まない', async () => {
  const options = { initial: [row('one', '希望出勤', null)], drafts: [row('one', '希望出勤', withTime(''))], memoIds: ['one'] }
  const env = fixture(options); await env.save()
  assert.ok(env.calls[0].filters.some(([field, value]) => field === 'memo' && value === null))
  assert.equal(env.database.get(`one:${date}`).memo, withTime(''))
  const blocked = fixture({ ...options, disabled: true }); await blocked.save(); assert.equal(blocked.calls.length, 0)
})

test('状態だけの確定は最新メモを保持。新規状態＋時間は別のupsertで保存する', async () => {
  const env = fixture({ initial: [row('one')], stored: [row('one', '希望出勤', '最新の備考')], drafts: [row('one', '出勤'), row('two', '希望出勤', withTime('新規'))], memoIds: ['two'] })
  await env.save()
  assert.deepEqual(env.calls.map(call => call.operation), ['upsert', 'insert'])
  assert.equal(Object.hasOwn(env.calls[0].values[0], 'memo'), false)
  assert.equal(env.calls[1].values[0].memo, withTime('新規'))
  assert.equal(env.state.data.get(`one:${date}`).memo, '最新の備考')
  assert.equal(env.database.get(`two:${date}`).status, '希望出勤')
})

test('途中失敗後も時間の下書きを残し、更新済みの行を安全に再送できる', async () => {
  let failOnce = true
  const env = fixture({ initial: [row('one'), row('two')], drafts: [row('one', '希望出勤', withTime('衣装確認')), row('two', '出勤')], memoIds: ['one'], failure: operation => operation === 'upsert' && failOnce ? (failOnce = false, true) : false })
  await env.save()
  assert.equal(env.state.dirty.size, 2); assert.equal(env.state.saving, false); assert.equal(env.messages.at(-1)[1], 'error')
  assert.equal(env.state.undo.length, 0); assert.equal(env.state.redo.length, 0, 'DBに一部保存された後の古い履歴は復元させない')
  await env.save()
  assert.equal(env.state.dirty.size, 0); assert.equal(env.messages.at(-1)[1], 'success')
  assert.equal(env.database.get(`one:${date}`).memo, withTime('衣装確認'))
  assert.equal(env.database.get(`two:${date}`).status, '出勤')
})

test('時間と出勤状態を同時に変えても、別画面の最新メモを上書きしない', async () => {
  const env = fixture({ initial: [row('one')], drafts: [row('one', '出勤', withTime('衣装確認'))], memoIds: ['one'], stored: [row('one', '希望出勤', '別画面の新しい備考')] })
  await env.save()
  assert.equal(env.calls[0].operation, 'update')
  assert.equal(env.database.get(`one:${date}`).status, '希望出勤')
  assert.equal(env.database.get(`one:${date}`).memo, '別画面の新しい備考')
  assert.equal(env.state.dirty.size, 1); assert.equal(env.messages.at(-1)[1], 'error')
  assert.equal(env.state.undo.length, 1, 'まだ何も保存できていなければUndoを残す')
})

test('時間と状態の同時変更は競合がなければ一緒に保存し、一般メモを保持する', async () => {
  const env = fixture({ initial: [row('one')], drafts: [row('one', '出勤', withTime('衣装確認'))], memoIds: ['one'] })
  await env.save()
  assert.equal(env.calls[0].operation, 'update')
  assert.deepEqual(env.calls[0].values, { status: '出勤', memo: withTime('衣装確認') })
  assert.equal(env.database.get(`one:${date}`).status, '出勤'); assert.equal(env.state.dirty.size, 0)
})

test('読み込み後に別画面が作ったシフトの備考を、新規時間メモで置き換えない', async () => {
  const env = fixture({ initial: [], drafts: [row('one', '希望出勤', withTime(''))], memoIds: ['one'], stored: [row('one', '出勤', '他の画面で入力した備考')] })
  await env.save()
  assert.equal(env.calls[0].operation, 'insert')
  assert.equal(env.database.get(`one:${date}`).memo, '他の画面で入力した備考')
  assert.equal(env.database.get(`one:${date}`).status, '出勤')
  assert.equal(env.state.dirty.size, 1); assert.match(env.messages.at(-1)[0], /メモが変更・削除/)
})

test('新規時間メモを一部保存後に失敗しても、重複作成せず再送できる', async () => {
  let failOnce = true
  const drafts = Array.from({ length: 201 }, (_, index) => row('cast-' + index, '希望出勤', withTime('')))
  const env = fixture({ initial: [], drafts, memoIds: drafts.map(value => value.cast_id), failure: (operation, call) => operation === 'insert' && call === 2 && failOnce ? (failOnce = false, true) : false })
  await env.save(); assert.equal(env.database.size, 200); assert.equal(env.state.dirty.size, 201)
  await env.save(); assert.equal(env.database.size, 201); assert.equal(env.state.dirty.size, 0)
  assert.equal(env.messages.at(-1)[1], 'success')
})

test('大量の状態変更も200件ずつ保存し、行を取りこぼさない', async () => {
  const drafts = Array.from({ length: 201 }, (_, index) => row('cast-' + index, '出勤'))
  const env = fixture({ initial: [], drafts }); await env.save()
  assert.deepEqual(env.calls.map(call => call.values.length), [200, 1])
  assert.equal(env.database.size, 201); assert.equal(env.state.dirty.size, 0)
})

for (const direction of ['Undo', 'Redo']) test(`${direction}はReactの状態更新が遅れても復元前の時間を履歴へ保存する`, () => {
  let initializer
  const name = 'handle' + direction
  function lookup(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) initializer = node.initializer
    ts.forEachChild(node, lookup)
  }
  lookup(source); assert.ok(initializer)
  const handlerCode = ts.transpileModule('exports.run = ' + ts.createPrinter().printNode(ts.EmitHint.Expression, initializer, source), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const before = { data: new Map([['cell', { status: '希望出勤', memo: '' }]]), dirty: new Set(), memoDirty: new Set() }
  const after = { data: new Map([['cell', { status: '希望出勤', memo: withTime('') }]]), dirty: new Set(['cell']), memoDirty: new Set(['cell']) }
  const history = direction === 'Undo' ? { undo: [before], redo: [], current: after } : { undo: [], redo: [after], current: before }
  const queued = [], exports = {}
  vm.runInNewContext(handlerCode, {
    exports, useCallback: callback => callback, gridDisabled: false, undoStack: history.undo, redoStack: history.redo,
    currentSnapshot: () => history.current, restoreSnapshot: snapshot => { history.current = snapshot },
    setUndoStack: change => queued.push(() => { history.undo = typeof change === 'function' ? change(history.undo) : change }),
    setRedoStack: change => queued.push(() => { history.redo = typeof change === 'function' ? change(history.redo) : change }),
  })
  exports.run()
  queued.forEach(change => change())
  assert.equal(history.current.data.get('cell').memo, direction === 'Undo' ? '' : withTime(''))
  const saved = direction === 'Undo' ? history.redo : history.undo
  assert.equal(saved.at(-1).data.get('cell').memo, direction === 'Undo' ? withTime('') : '')
})
