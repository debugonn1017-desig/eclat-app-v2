import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { getCastTenure, formatCastTenure } from './castTenure'
import { toJSTDateString } from './dateUtils'

test('入店からの暦年・月・日を表示し、当日はすべて0', () => {
  assert.equal(formatCastTenure(getCastTenure({ joined_at: '2025-08-06' }, '2026-10-09')), '入店から1年2ヶ月3日経過中')
  assert.equal(formatCastTenure(getCastTenure({ joined_at: '2026-10-09' }, '2026-10-09')), '入店から0年0ヶ月0日経過中')
  assert.equal(formatCastTenure(getCastTenure({ joined_at: '2026-09-10' }, '2026-10-09')), '入店から0年0ヶ月29日経過中')
})

test('年跨ぎ・月末・閏日は月末丸めの応当日で計算する', () => {
  const cases = [
    ['2025-12-31', '2026-01-30', '0年0ヶ月30日'],
    ['2025-12-31', '2026-01-31', '0年1ヶ月0日'],
    ['2026-01-31', '2026-02-28', '0年1ヶ月0日'],
    ['2026-01-31', '2026-03-01', '0年1ヶ月1日'],
    ['2026-01-31', '2026-03-30', '0年1ヶ月30日'],
    ['2024-01-31', '2024-02-29', '0年1ヶ月0日'],
    ['2024-02-29', '2025-02-28', '1年0ヶ月0日'],
    ['2024-02-29', '2026-10-09', '2年7ヶ月10日'],
  ]
  for (const [start, end, expected] of cases) {
    assert.equal(formatCastTenure(getCastTenure({ joined_at: start }, end)), `入店から${expected}経過中`, `${start} → ${end}`)
  }
})

test('入店日は旧フィールドより優先、未登録のみ旧入店日へフォールバック', () => {
  const legacy = { training_start_date: '2025-08-06' }
  for (const joined_at of [null, undefined, '', '   ']) {
    assert.equal(formatCastTenure(getCastTenure({ ...legacy, joined_at }, '2026-10-09')), '入店から1年2ヶ月3日経過中')
  }
  assert.equal(formatCastTenure(getCastTenure({ ...legacy, joined_at: '2026-10-09' }, '2026-10-09')), '入店から0年0ヶ月0日経過中')
})

test('未登録・不正日付は負数やNaNを表示せず未設定にする', () => {
  for (const joined_at of [null, undefined, '', 'invalid', '2026-02-30', '2025-02-29', '2026-13-01', '2026-1-1']) {
    assert.equal(formatCastTenure(getCastTenure({ joined_at }, '2026-10-09')), '入店日未設定')
  }
  assert.equal(getCastTenure({ joined_at: '2026-10-09' }, 'invalid').status, 'unset')
})

test('未来の入店日は経過期間を計算せず予定日を表示', () => {
  assert.equal(formatCastTenure(getCastTenure({ joined_at: '2026-10-10' }, '2026-10-09')), '入店予定 2026/10/10')
})

test('JSTの0時で経過日数が更新される（営業日4時・UTC日付ではない）', () => {
  for (const [now, expected] of [['2026-10-08T14:59:59Z', '0年0ヶ月0日'], ['2026-10-08T15:00:00Z', '0年0ヶ月1日']]) {
    assert.equal(formatCastTenure(getCastTenure({ joined_at: '2026-10-08' }, toJSTDateString(new Date(now)))), `入店から${expected}経過中`)
  }
})

test('スタッフ一覧は名前の左、バナーは現在・目標の左に共通表示し、時計の購読は行ごとに増やさない', () => {
  const list = readFileSync('app/casts/page.tsx', 'utf8')
  const row = list.slice(list.indexOf('const CastListItem'), list.indexOf('const CustomerStaffListItem'))
  assert.ok(row.indexOf('<CastTenureBadge') < row.indexOf('fontSize: 15.5'))
  assert.ok(!row.includes('useJstToday('))
  assert.equal((list.match(/useJstToday\(\)/g) ?? []).length, 1)
  const banner = readFileSync('components/CastTierProgress.tsx', 'utf8')
  assert.ok(banner.indexOf('<CastTenureBadge') < banner.indexOf('現在：'))
  assert.ok(banner.indexOf('<CastTenureBadge') < banner.indexOf('目標：'))
  const clock = readFileSync('hooks/useJstToday.ts', 'utf8')
  assert.ok(clock.includes('useSyncExternalStore'))
  assert.ok(clock.includes('visibilitychange'))
  assert.ok(clock.includes('clearTimeout(timer)'))
})
