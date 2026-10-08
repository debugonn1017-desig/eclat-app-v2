import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CAST_TIERS, CAST_TIER_GROUPS } from '../types'
import { groupCastRowsByTier } from './castTierGrouping'
import { getCastSettingPermissions } from './castSettingPermissions'
import { getCastDetailTabs } from './castWorkspaceTabs'

test('キャストには設定・出力を表示せず、スタッフの出力はランキングの直後', () => {
  const castTabs = getCastDetailTabs(false)
  const adminTabs = getCastDetailTabs(true)
  assert.equal(castTabs.includes('SETTING'), false)
  assert.equal(adminTabs.includes('SETTING'), true)
  assert.equal(castTabs.includes('EXPORTS'), false)
  assert.equal(adminTabs.includes('EXPORTS'), true)
  assert.equal(adminTabs[adminTabs.indexOf('RANKING') + 1], 'EXPORTS')
  assert.ok(!castTabs.some(tab => String(tab) === 'TRAINING'))
  assert.ok(!adminTabs.some(tab => String(tab) === 'TRAINING'))
  assert.deepEqual(adminTabs.filter(tab => tab !== 'SETTING' && tab !== 'EXPORTS'), castTabs)
  assert.deepEqual(castTabs.slice(0, 4), ['KPI', 'CUSTOMERS', 'SALES', 'SHIFT'])
  assert.equal(castTabs[castTabs.length - 1], 'RANKING')
})

test('新人90日育成のタブ・ヘッダー・一覧導線を撤去し、入店日設定は残す', () => {
  for (const file of ['components/CastWorkspace.tsx', 'app/casts/page.tsx']) {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    for (const retired of ['90日育成', 'NewCastTrainingTab', 'getNewCastTrainingProgress', "'TRAINING'", 'CastTrainingListStatus']) {
      assert.ok(!source.includes(retired), `${file}に${retired}を残さない`)
    }
  }
  const workspace = readFileSync(join(process.cwd(), 'components/CastWorkspace.tsx'), 'utf8')
  assert.match(workspace, /canEditProfile=\{canEditProfile\}/)
  assert.match(workspace, /nextCanEditProfile = settingsPermissions\.canEditProfile/)
  assert.match(readFileSync(join(process.cwd(), 'components/CastSettingTab.tsx'), 'utf8'), /入店日/)
})

test('出力はスタッフ用タブ・ハンドラ・モーダルで制限し、上部バナーには残さない', () => {
  const workspace = readFileSync(join(process.cwd(), 'components/CastWorkspace.tsx'), 'utf8')
  assert.match(workspace, /isAdmin && activeTab === 'EXPORTS'/)
  assert.match(workspace, /isAdmin && <SalesListExportModal/)
  for (const handler of ['handleExportAllCustomers', 'handleExportHonshimei']) {
    assert.match(workspace, new RegExp(`const ${handler} = useCallback\\(async \\(\\) => \\{\\s*if \\(!isAdmin \\|\\| !cast\\) return`))
  }
  assert.match(workspace, /const openSalesListModal = useCallback\([^]*?if \(!isAdmin\) return/)
  for (const label of ['全顧客履歴を出力', '本指名のみ出力', '営業リスト出力']) {
    assert.ok(!workspace.includes(`'${label}'`), `バナーから${label}を移動済み`)
    assert.ok(readFileSync(join(process.cwd(), 'components/CastExportTab.tsx'), 'utf8').includes(label))
  }
})

test('成績は売上2列・年間グラフ1個で、内部切替は上位スワイプを止める', () => {
  const source = readFileSync(join(process.cwd(), 'components/CastKPITab.tsx'), 'utf8')
  assert.match(source, /aria-label="月間売上と設定売上"[^]*?gridTemplateColumns: 'repeat\(2,minmax\(0,1fr\)\)'/)
  assert.equal((source.match(/<YearChart\b/g) ?? []).length, 1)
  assert.match(source, /useState<'sales' \| 'nominations'>\('sales'\)/)
  assert.match(source, /aria-label="年間グラフの切り替え" data-block-tab-swipe="true"/)
  assert.match(source, /money=\{chartTab === 'sales'\}/)
  assert.match(source, /height: isPC \? 230 : 190/)
  for (const field of ['monthlySales', 'localMonthlyPeople', 'outsideMonthlyPeople', 'banaiMonthlyCount']) {
    assert.ok(source.includes(`annual[m]?.${field}`), `${field}は従来の月次実績を参照`)
  }
})

test('PC上部の6項目帯を廃止し、入店期間・層バナーと成績タブの実績を維持する', () => {
  const source = readFileSync(join(process.cwd(), 'components/CastWorkspace.tsx'), 'utf8')
  assert.ok(!source.includes('formatYenShort'))
  assert.ok(!source.includes("gridTemplateColumns: 'repeat(6, minmax(0, 1fr))'"))
  assert.match(source, /<CastTierProgress cast=\{cast\}/)
  assert.match(source, /<CastKPITab[^]*?kpi=\{kpi\}[^]*?workDays=\{workDays\}/)
  assert.match(source, /<CastKPITab[^]*?isPC=\{isViewPC\}/)
})

test('売上2カードの直下に今月の本指名・場内・同伴本数を3列で表示し、既存の月次KPIを参照する', () => {
  const source = readFileSync(join(process.cwd(), 'components/CastKPITab.tsx'), 'utf8')
  const salesAt = source.indexOf('aria-label="月間売上と設定売上"')
  const countsAt = source.indexOf('aria-label="今月の指名・同伴本数"')
  const shiftsAt = source.indexOf('aria-label="出勤日数・シフト"')
  assert.ok(salesAt < countsAt && countsAt < shiftsAt)
  const counts = source.slice(countsAt, shiftsAt)
  assert.ok(counts.includes("gridTemplateColumns: 'repeat(3,minmax(0,1fr))'"))
  for (const [label, field] of [['本指名本数', 'honshimeiMonthlyVisits'], ['場内本数', 'banaiMonthlyCount'], ['同伴本数', 'douhanCount']]) {
    assert.ok(counts.includes(`label: '${label}', count: kpi.${field} ?? 0`))
  }
  assert.ok(!counts.includes('kpi.honshimeiCount'), '総顧客人数ではなく当月来店本数を使う')
  assert.ok(!counts.includes('kpi.banaiAcquiredCount'), '転換履歴の獲得人数ではなく当月場内本数を使う')
})

test('県外顧客の人数・来店集計は画面とランキングAPIが同じS/A/B限定述語を使う', () => {
  for (const file of ['hooks/useCasts.ts', 'app/api/cast-rankings/route.ts']) {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    assert.match(source, /honshimeiCustomers\.filter\(isKpiKengai\)\.length/)
    assert.match(source, /const kengaiCount = remoteCustomerCount/)
    assert.match(source, /isKpiKengai\(metaInput\)/)
  }
})

test('新9層・旧5層・未設定が全員ちょうど1回表示される', () => {
  const rows = [...CAST_TIER_GROUPS, null].map((cast_tier, id) => ({ id, cast_tier }))
  const groups = groupCastRowsByTier(rows)
  assert.deepEqual(groups.map(g => g.tier), [...CAST_TIER_GROUPS, '層未設定'])
  assert.deepEqual(groups.flatMap(g => g.rows), rows)
  assert.equal(new Set(groups.flatMap(g => g.rows.map(r => r.id))).size, rows.length)
})

test('層内の元順序と入力を維持し、未知の既存層も落とさない', () => {
  const rows = [{ id: 1, cast_tier: 'B層' }, { id: 2, cast_tier: '旧特別層' }, { id: 3, cast_tier: 'B層' }, { id: 4, cast_tier: '' }]
  const before = structuredClone(rows)
  const groups = groupCastRowsByTier(rows)
  assert.deepEqual(groups.find(g => g.tier === 'B層')?.rows.map(r => r.id), [1, 3])
  assert.equal(groups.flatMap(g => g.rows).length, rows.length)
  assert.deepEqual(rows, before)
})

test('新規入力の選択肢は新9層のみ、表示用は旧層を含む', () => {
  assert.deepEqual(CAST_TIERS, ['AA', 'AB', 'AC', 'BA', 'BB', 'BC', '新人', '無類', 'C'])
  assert.equal(new Set(CAST_TIER_GROUPS).size, CAST_TIER_GROUPS.length)
  for (const legacy of ['A層', 'B層', '新人層', 'C層', 'その他']) assert.ok(CAST_TIER_GROUPS.includes(legacy as typeof CAST_TIER_GROUPS[number]))
})

test('CIソース監査: 新規入力用CAST_TIERSを一覧グループ化へ持ち込まない', () => {
  const root = process.cwd()
  const allowed = new Set(['components/CastSettingTab.tsx', 'app/admin/casts/page.tsx', 'app/api/admin/casts/[id]/route.ts'])
  const violations: string[] = []
  function scan(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) { scan(path); continue }
      if (!/\.tsx?$/.test(path) || path.endsWith('.test.ts')) continue
      const source = readFileSync(path, 'utf8')
      const imports = source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@\/types['"]/g)
      if ([...imports].some(m => /\bCAST_TIERS\b/.test(m[1])) && !allowed.has(relative(root, path))) violations.push(relative(root, path))
    }
  }
  for (const dir of ['app', 'components', 'hooks', 'lib']) scan(join(root, dir))
  assert.deepEqual(violations, [], '表示用にはCAST_TIER_GROUPSまたは共通グループ関数を使う')
  for (const path of ['app/admin/shifts/page.tsx', 'app/admin/daily-sales/page.tsx', 'app/calendar/page.tsx', 'app/admin/targets/page.tsx', 'app/admin/rank-criteria/page.tsx', 'app/casts/page.tsx', 'components/CastWorkspace.tsx']) {
    assert.match(readFileSync(join(root, path), 'utf8'), /\bCAST_TIER_GROUPS\b/, path)
  }
  assert.match(readFileSync(join(root, 'app/admin/cast-issues/page.tsx'), 'utf8'), /groupCastRowsByTier/, '課題シートも共通グループ関数を使う')
})

test('設定保存権限を区別し、キャスト・未確認は無効、オーナーは両方可', () => {
  assert.deepEqual(getCastSettingPermissions(null), { canEditTargets: false, canEditProfile: false })
  assert.deepEqual(getCastSettingPermissions({ role: 'cast', is_owner: true }), { canEditTargets: false, canEditProfile: false })
  assert.deepEqual(getCastSettingPermissions({ role: 'admin' }), { canEditTargets: false, canEditProfile: false })
  assert.deepEqual(getCastSettingPermissions({ role: 'admin', is_owner: true }), { canEditTargets: true, canEditProfile: true })
  assert.deepEqual(getCastSettingPermissions({ role: 'admin', permissions: { 'ノルマ.設定': true } }), { canEditTargets: true, canEditProfile: false })
  assert.deepEqual(getCastSettingPermissions({ role: 'admin', permissions: { 'キャスト.アカウント管理': true } }), { canEditTargets: false, canEditProfile: true })
})
