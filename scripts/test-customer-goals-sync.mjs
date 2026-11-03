import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
function load(file, mocks = {}, globals = {}) {
  const exports = {}
  vm.runInThisContext(`(function(require,exports,${Object.keys(globals).join(',')}){${compile(file)}\n})`)(name => { if (!(name in mocks)) throw new Error(name); return mocks[name] }, exports, ...Object.values(globals))
  return exports
}
const logic = load('lib/starCustomerGoals.ts')
const cast = '11111111-1111-4111-8111-111111111111', otherCast = '22222222-2222-4222-8222-222222222222'
const goal = (id = 1, castId = cast, month = '2026-11') => ({ customer_id: id, cast_id: castId, month: month + '-01', target_sales: 100, target_visits: 2, note: '保存済み', revision: 3 })
const dataFor = (ids = ['1', '2'], month = '2026-11', castId = cast) => ({ castId, month, customerIds: ids, canEdit: true, goals: ids.map(id => goal(Number(id), castId, month)), actuals: Object.fromEntries(ids.map(id => [id, { sales: 0, visits: 0 }])) })
const inputFor = () => ({ castId: cast, customerId: '1', month: '2026-11', targetSales: 123456, targetVisits: 3, note: '下書きは保持', expectedRevision: 3 })
const until = async predicate => { for (let count = 0; count < 100; count++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 0)) } throw new Error('fixture timeout') }

// 実hook・実画面の状態とeffectを進める独立fixture。APIは架空、ブラウザ共有状態に触れない。
function fixture(fetcher) {
  let active, timerId = 0
  const instances = [], timers = new Map(), listeners = { window: new Map(), document: new Map() }
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const schedule = instance => {
    if (instance.queued || instance.unmounted) return
    instance.queued = true
    queueMicrotask(() => { instance.queued = false; if (!instance.unmounted) instance.render(instance.args) })
  }
  const react = {
    Fragment: Symbol('fragment'),
    useState(initial) {
      const instance = active, index = instance.cursor++
      if (!(index in instance.slots)) instance.slots[index] = typeof initial === 'function' ? initial() : initial
      return [instance.slots[index], value => {
        const next = typeof value === 'function' ? value(instance.slots[index]) : value
        if (!Object.is(next, instance.slots[index])) { instance.slots[index] = next; schedule(instance) }
      }]
    },
    useRef(initial) { const instance = active, index = instance.cursor++; return instance.slots[index] ??= { current: initial } },
    useCallback(fn, deps) { const instance = active, index = instance.cursor++; if (!same(instance.slots[index]?.deps, deps)) instance.slots[index] = { value: fn, deps }; return instance.slots[index].value },
    useMemo(fn, deps) { const instance = active, index = instance.cursor++; if (!same(instance.slots[index]?.deps, deps)) instance.slots[index] = { value: fn(), deps }; return instance.slots[index].value },
    useEffect(fn, deps) {
      const instance = active, index = instance.cursor++
      if (!same(instance.effects[index]?.deps, deps)) instance.pending.push(() => { instance.effects[index]?.cleanup?.(); instance.effects[index] = { deps, cleanup: fn() } })
    },
  }
  const target = name => ({ addEventListener(event, fn) { const set = listeners[name].get(event) ?? new Set(); set.add(fn); listeners[name].set(event, set) }, removeEventListener(event, fn) { listeners[name].get(event)?.delete(fn) } })
  const window = { ...target('window'), setInterval(fn) { timers.set(++timerId, fn); return timerId }, clearInterval(id) { timers.delete(id) }, confirm: () => true }
  const document = { ...target('document'), visibilityState: 'visible' }
  const hooks = load('hooks/useCustomerGoals.ts', { react, '@/lib/starCustomerGoals': logic }, { fetch: fetcher, window, document })
  const staffHooks = load('hooks/useStaffCustomerGoals.ts', { react, '@/lib/starCustomerGoals': logic }, { fetch: fetcher, window, document })
  function runner(fn, args) {
    const instance = { slots: [], effects: [], pending: [], cursor: 0, queued: false, unmounted: false, args, output: null,
      render(nextArgs) {
        instance.args = nextArgs; instance.cursor = 0
        const previous = active; active = instance
        instance.output = fn(...nextArgs); active = previous
        while (instance.pending.length) instance.pending.shift()()
        return instance.output
      },
    }
    instances.push(instance); instance.render(args)
    return instance
  }
  const stub = name => { const component = () => null; component.displayName = name; return { default: component } }
  function screen(props) {
    const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
    const mocks = {
      react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: react.Fragment }, 'next/dynamic': { default: () => stub('CustomerDetailPanel').default },
      '@/lib/colors': load('lib/colors.ts'), '@/hooks/useCustomerGoals': hooks,
      '@/hooks/useStaffCustomerGoals': staffHooks,
      '@/lib/starCustomerGoals': logic, '@/lib/customerGoalsPdf': { goalYen: n => `¥${n}`, goalGapLabel: () => '' },
      '@/lib/starLog': { matchesStarCheck: () => true }, '@/lib/starredCustomers': { isStarredContactDue: () => false, starredElapsedDays: () => 1 },
      '@/lib/customerVisitPattern': { CUSTOMER_SORT_OPTIONS: [] }, './StarCustomerGoals.module.css': { default: new Proxy({}, { get: (_, key) => key }) },
    }
    for (const name of ['CustomerVisitPatternSummary', 'CustomerCardPreview', 'CustomerGoalsOverlay', 'CustomerGoalsExport', 'CustomerGoalLedgerRow', 'CustomerGoalHistory', 'CompactListField']) mocks['./' + name] = stub(name)
    const component = load('components/StarCustomerGoals.tsx', mocks, { window }).default
    return runner(component, [props])
  }
  function actions() {
    const noop = () => {}
    const actionModule = load('hooks/useCustomerListActions.tsx', { react, 'react/jsx-runtime': { jsx: noop, jsxs: noop }, '@/hooks/useToast': { useToast: () => ({ toast: noop, ToastView: null }) }, '@/hooks/useUndoToast': { useUndoToast: () => ({ show: noop }) },
      '@/lib/cache': { invalidateCustomerDetail: noop, invalidateAllCastsKPI: noop }, '@/components/CustomerRankDialog': { default: noop }, '@/lib/customerRankChange': { customerRankLabel: value => value },
    }, { fetch: fetcher, window })
    return runner(actionModule.useCustomerListActions, [{ castName: 'りな' }])
  }
  return { hooks, staffHooks, runner, screen, actions, timers, fire(name, event) { for (const fn of listeners[name].get(event) ?? []) fn() }, close() { for (const instance of instances) { instance.unmounted = true; for (const effect of instance.effects) effect?.cleanup?.() } } }
}
function nodes(value, predicate, found = []) {
  if (Array.isArray(value)) value.forEach(item => nodes(item, predicate, found))
  else if (value && typeof value === 'object') { if (predicate(value)) found.push(value); nodes(value.props?.children, predicate, found) }
  return found
}
const components = (tree, name) => nodes(tree, node => node.type?.displayName === name || node.type?.name === name)
const customer = id => ({ id, customer_name: `顧客${id}`, cast_name: 'りな', nomination_status: '本指名', customer_rank: 'A', region: '福岡県', is_starred: true })
const propsFor = () => ({ castId: cast, castName: 'りな', month: '2026-11', setMonth() {}, target: null, customers: [customer(1), customer(2)], today: '2026-11-04',
  metadataReady: true, metadataError: false, refreshing: false, lastVisits: new Map(), totals: new Map(), counts: new Map(), averages: new Map(), patterns: new Map(), staffNames: new Map(), bottleSearch: new Map(), companions: new Map(),
  logs: { filter: 'all', ready: true, error: '', summaries: new Map(), HistoryButton: null }, revision: 0, busy: false, canManage: true, isAdmin: true,
  sortKey: 'lastVisitNewest', onSort() {}, view: 'all', onView() {}, noReply: new Set(), onRefresh() {}, onBusyChange() {},
})

test('personal hookは取得成功の0と未取得を区別し、欠けた実績/旧担当目標はreadyにしない', async () => {
  for (const broken of [false, 'actual', 'cast']) {
    const f = fixture(async () => { const data = dataFor(); if (broken === 'actual') delete data.actuals['1']; if (broken === 'cast') data.goals[0].cast_id = otherCast; return Response.json(data) })
    const hook = f.runner(f.hooks.useCustomerGoals, [cast, '2026-11', 0, false])
    await until(() => hook.output.ready || hook.output.error)
    assert.equal(hook.output.ready, !broken)
    if (!broken) assert.deepEqual(hook.output.data.actuals['1'], { sales: 0, visits: 0 })
    else { assert.equal(hook.output.data, null); assert.ok(hook.output.error) }
    f.close()
  }
})
test('編集pauseでpoll/focus停止。同じ担当月ならrevision変更後もsnapshotの保存をPUTで再認可', async () => {
  const calls = [], f = fixture(async (url, options) => { calls.push([url, options]); return options?.method === 'PUT' ? Response.json({ goal: { ...goal(), revision: 4 } }) : Response.json(dataFor()) })
  const hook = f.runner(f.hooks.useCustomerGoals, [cast, '2026-11', 0, false])
  await until(() => hook.output.ready)
  hook.render([cast, '2026-11', 1, true]); assert.equal(f.timers.size, 0)
  const before = calls.length; f.fire('window', 'focus'); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(calls.length, before)
  const input = inputFor(); await hook.output.save(input)
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body), input)
  assert.equal(hook.output.data.goals.find(goal => goal.customer_id === 1).revision, 4)
  f.close()
})
test('古いsave closureから別担当月へ保存しない。遅れたGETも新scopeへ混ぜない', async () => {
  let resolveFirst, writes = 0
  const f = fixture(async (url, options) => {
    if (options?.method === 'PUT') { writes++; return Response.json({ goal: { ...goal(), revision: 4 } }) }
    const p = new URL(url, 'https://example.test').searchParams
    if (p.get('month') === '2026-11') return new Promise(resolve => { resolveFirst = resolve })
    return Response.json(dataFor(['2'], p.get('month'), p.get('castId')))
  })
  const hook = f.runner(f.hooks.useCustomerGoals, [cast, '2026-11', 0, false]), oldSave = hook.output.save
  hook.render([otherCast, '2026-12', 0, false]); await until(() => hook.output.ready)
  resolveFirst(Response.json(dataFor())); await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(hook.output.data.castId, otherCast); assert.equal(hook.output.data.month, '2026-12')
  await assert.rejects(oldSave(inputFor()), /担当|⭐️/); assert.equal(writes, 0)
  f.close()
})
test('ID不一致は親を一度だけ更新し、pause中は待機。一致後は次の変更も一度同期', () => {
  const f = fixture(async () => Response.json(dataFor())), calls = []
  const base = { castId: cast, month: '2026-11', customerIds: ['1', '2'], data: dataFor(['2']), enabled: false, onRefresh: () => calls.push('refresh') }
  const sync = f.runner(f.hooks.useCustomerGoalMembership, [base]); assert.equal(sync.output, true); assert.equal(calls.length, 0)
  sync.render([{ ...base, enabled: true }]); sync.render([{ ...base, data: dataFor(['2']), enabled: true }]); assert.equal(calls.length, 1)
  sync.render([{ ...base, data: dataFor(['2']), enabled: false }]); sync.render([{ ...base, enabled: true }]); assert.equal(calls.length, 1)
  sync.render([{ ...base, customerIds: ['2'], enabled: true }]); assert.equal(sync.output, false)
  sync.render([{ ...base, customerIds: ['2'], data: dataFor([]), enabled: true }]); assert.equal(calls.length, 2)
  f.close()
})
test('実画面: 別端末の⭐️解除がgoal GETへ先に届いても残りの行はready、旧行なし・export停止→一度同期で復帰', async () => {
  let latest = dataFor(), refreshes = 0
  const f = fixture(async () => Response.json(latest)), props = { ...propsFor(), onRefresh: () => { refreshes++ } }, screen = f.screen(props)
  await until(() => components(screen.output, 'CustomerGoalLedgerRow').every(row => row.props.ready))
  // 検索・開閉はローカル状態。親がIDを追いつかせても再初期化しない。
  const category = nodes(screen.output, node => node.props?.['data-goal-category'] === '県内顧客')[0]
  category.props.onToggle({ currentTarget: { open: true } })
  latest = dataFor(['2']); f.fire('window', 'focus')
  await until(() => refreshes === 1)
  const rows = components(screen.output, 'CustomerGoalLedgerRow')
  assert.deepEqual(rows.map(row => String(row.props.customer.id)), ['2']); assert.equal(rows[0].props.ready, true)
  assert.equal(components(screen.output, 'CustomerGoalsExport')[0].props.disabled, true)
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(refreshes, 1)
  screen.render([{ ...props, customers: [customer(2)], revision: 1 }])
  await until(() => !components(screen.output, 'CustomerGoalsExport')[0].props.disabled)
  assert.equal(nodes(screen.output, node => node.props?.['data-goal-category'] === '県内顧客')[0].props.open, true)
  assert.equal(components(screen.output, 'CustomerGoalsExport')[0].props.report.rows.length, 1)
  f.close()
})
test('実編集画面: 顧客が一覧から消えても下書きsnapshotを維持し、PUT403/409後も3入力を保持', async () => {
  for (const status of [403, 409]) {
    const calls = [], f = fixture(async (url, options) => {
      calls.push([url, options])
      return options?.method === 'PUT' ? Response.json({ error: status === 403 ? '担当が変更されています' : '⭐️が解除されています' }, { status }) : Response.json(dataFor())
    })
    const props = propsFor(), screen = f.screen(props)
    await until(() => components(screen.output, 'CustomerGoalLedgerRow')[0]?.props.ready)
    components(screen.output, 'CustomerGoalLedgerRow')[0].props.onEdit()
    await until(() => components(screen.output, 'GoalEditor').length)
    let node = components(screen.output, 'GoalEditor')[0]
    const key = node.key, editor = f.runner(node.type, [node.props])
    const field = label => nodes(editor.output, node => node.props?.['aria-label'] === label)[0]
    field('目標売上（円）').props.onChange({ target: { value: '345678' } }); field('目標来店回数（回）').props.onChange({ target: { value: '7' } }); field('月別の備考').props.onChange({ target: { value: '保持する下書き' } })
    await new Promise(resolve => setTimeout(resolve, 0))
    screen.render([{ ...props, customers: [customer(2)], revision: 1 }])
    node = components(screen.output, 'GoalEditor')[0]; editor.render([node.props])
    assert.equal(node.key, key); assert.equal(node.props.customer.id, 1); assert.equal(node.props.month, '2026-11'); assert.equal(node.props.castId, cast); assert.ok(node.props.warning)
    nodes(editor.output, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    await until(() => nodes(editor.output, node => node.props?.role === 'alert').length >= 2)
    assert.equal(field('目標売上（円）').props.value, '345678'); assert.equal(field('目標来店回数（回）').props.value, '7'); assert.equal(field('月別の備考').props.value, '保持する下書き')
    assert.equal(JSON.parse(calls.find(([, options]) => options?.method === 'PUT')[1].body).expectedRevision, 3)
    screen.render([{ ...props, customers: [customer(2)], month: '2026-12', revision: 2 }])
    node = components(screen.output, 'GoalEditor')[0]; assert.equal(node.key, key); assert.equal(node.props.month, '2026-11')
    f.close()
  }
})

function actualWorkspaceCallbacks(dependencies) {
  const source = fs.readFileSync('components/CastWorkspace.tsx', 'utf8'), ast = ts.createSourceFile('CastWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let refresh, onRefresh
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'refreshCustomers') refresh = node.initializer.arguments[0]
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'StarCustomerGoals') onRefresh = node.attributes.properties.find(prop => prop.name?.getText(ast) === 'onRefresh')?.initializer?.expression
    ts.forEachChild(node, visit)
  }
  visit(ast); assert.ok(refresh); assert.ok(onRefresh)
  const evaluate = (expression, scope) => vm.runInThisContext(`(function(${Object.keys(scope).join(',')}){return (${expression.getText(ast)})})`)(...Object.values(scope))
  const refreshCustomers = evaluate(refresh, dependencies)
  return evaluate(onRefresh, { ...dependencies, refreshCustomers })
}

test('実CastWorkspace refresh callback＋marks hook: 別端末の⭐️追加/解除と個人overlay復帰でID同期が収束し、月・検索・並び・開閉・scrollを保持', async () => {
  for (const scenario of ['remove', 'add', 'overlay-remove']) {
    let starredIds = ['1', '2'], revision = 0, extrasReady = true, refreshes = 0, markReads = 0, preserved = 0, screen
    const allCustomers = [customer(1), customer(2), customer(3)], parentState = { month: '2026-11', sort: 'name', scroll: 840 }
    const f = fixture(async url => {
      if (url.startsWith('/api/customer-marks')) { markReads++; return Response.json({ items: allCustomers.map(c => ({ id: c.id, is_starred: starredIds.includes(String(c.id)), no_reply: false })) }) }
      return Response.json(dataFor(starredIds))
    })
    const actions = f.actions(); await actions.output.loadActiveFollowUpIds()
    await until(() => actions.output.activeFollowUpIds.size === 2)
    const props = () => ({ ...propsFor(), month: parentState.month, sortKey: parentState.sort, customers: allCustomers.filter(c => actions.output.activeFollowUpIds.has(String(c.id))), revision, refreshing: !extrasReady, onRefresh })
    const onRefresh = actualWorkspaceCallbacks({
      castId: cast, month: parentState.month, loadFollowUpCustomerIds: actions.output.loadActiveFollowUpIds,
      setCustExtrasLoaded: value => { extrasReady = value }, preserveCustomerScroll: () => { preserved++; assert.equal(parentState.scroll, 840) },
      invalidateCache() {}, onCustomerListChanged() {}, setRefreshKey: update => { refreshes++; revision = update(revision); screen?.render([props()]) },
    })
    screen = f.screen(props()); await until(() => !components(screen.output, 'CustomerGoalsExport')[0].props.disabled)
    nodes(screen.output, node => node.props?.['data-goal-category'] === '県内顧客')[0].props.onToggle({ currentTarget: { open: true } })
    nodes(screen.output, node => node.type === 'button' && node.props.children?.includes?.('検索'))[0].props.onClick()
    await new Promise(resolve => setTimeout(resolve, 0))
    nodes(screen.output, node => node.props?.['aria-label'] === '名前・ボトル名で検索')[0].props.onChange({ target: { value: '顧客' } })
    await new Promise(resolve => setTimeout(resolve, 0))
    if (scenario === 'overlay-remove') {
      components(screen.output, 'CustomerGoalLedgerRow')[0].props.onInfo(); await new Promise(resolve => setTimeout(resolve, 0))
      const footer = components(screen.output, 'CustomerCardPreview')[0].props.footer
      nodes(footer, node => node.type === 'button' && node.props.children?.includes?.('個人ページ'))[0].props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    starredIds = scenario === 'add' ? ['1', '2', '3'] : ['2']
    if (scenario === 'overlay-remove') components(screen.output, 'CustomerGoalsOverlay').find(node => node.props.title === 'お客様の個人ページ').props.onClose()
    else f.fire('window', 'focus')
    await until(() => refreshes === 1 && actions.output.activeFollowUpIds.size === starredIds.length)
    extrasReady = true; screen.render([props()])
    await until(() => !components(screen.output, 'CustomerGoalsExport')[0].props.disabled)
    assert.deepEqual(components(screen.output, 'CustomerGoalLedgerRow').map(row => String(row.props.customer.id)), starredIds)
    assert.equal(nodes(screen.output, node => node.props?.['aria-label'] === '名前・ボトル名で検索')[0].props.value, '顧客')
    assert.equal(nodes(screen.output, node => node.props?.['data-goal-category'] === '県内顧客')[0].props.open, true)
    assert.equal(nodes(screen.output, node => node.props?.['aria-label'] === '目標の対象月')[0].props.value, parentState.month)
    assert.equal(nodes(screen.output, node => node.props?.['aria-label'] === '並び順')[0].props.value, 'name')
    assert.equal(components(screen.output, 'CustomerGoalsExport')[0].props.report.rows.length, starredIds.length)
    assert.equal(markReads, 2); assert.equal(refreshes, 1); assert.equal(preserved, 1)
    f.close()
  }
})

const staffDataFor = ids => ({ month: '2026-11', customerIds: ids, canEdit: true, items: Object.fromEntries(ids.map(id => [id, { customerId: id, castId: cast, castName: 'りな', status: 'ready', goal: goal(Number(id)), actual: { sales: 0, visits: 0 } }])) })
test('staff本日確認の実hook/共通画面: unavailable/担当差だけ一度親を同期し、同じ不一致で繰返さない', async () => {
  for (const scenario of ['remove', 'reassign']) {
    let changed = false, refreshes = 0
    const f = fixture(async url => {
      const ids = new URL(url, 'https://fixture.test').searchParams.get('customerIds').split(','), data = staffDataFor(ids)
      if (changed && data.items['1']) data.items['1'] = scenario === 'remove'
        ? { customerId: '1', castId: null, castName: null, status: 'unavailable', goal: null, actual: null }
        : { ...data.items['1'], castId: otherCast, castName: 'あかり', goal: { ...goal(1, otherCast), target_sales: 765432 } }
      return Response.json(data)
    })
    const props = { ...propsFor(), castId: '', castName: '全キャスト', staff: { castLabels: new Map([['りな', 'りな'], ['あかり', 'あかり']]), selectionMode: false, selectedIds: new Set(), onToggleSelected() {} }, onRefresh: () => { refreshes++ } }, screen = f.screen(props)
    await until(() => !components(screen.output, 'CustomerGoalsExport')[0].props.disabled)
    changed = true; f.fire('window', 'focus'); await until(() => refreshes === 1)
    assert.equal(components(screen.output, 'CustomerGoalLedgerRow')[0].props.ready, false)
    assert.equal(components(screen.output, 'CustomerGoalsExport')[0].props.disabled, true)
    f.fire('window', 'focus'); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(refreshes, 1)
    const customers = scenario === 'remove' ? [customer(2)] : [{ ...customer(1), cast_name: 'あかり' }, customer(2)]
    screen.render([{ ...props, customers, revision: 1 }])
    await until(() => !components(screen.output, 'CustomerGoalsExport')[0].props.disabled)
    assert.deepEqual(components(screen.output, 'CustomerGoalLedgerRow').map(row => row.props.customer.id), customers.map(c => c.id))
    if (scenario === 'reassign') assert.equal(components(screen.output, 'CustomerGoalsExport')[0].props.report.rows[0].targetSales, 765432)
    assert.equal(refreshes, 1)
    f.close()
  }
})
test('staffの元々未設定担当は—のまま再取得ループなし。HTTP失敗も親同期せずretryを案内', async () => {
  for (const scenario of ['unassigned', 'http-error']) {
    let refreshes = 0
    const f = fixture(async () => {
      if (scenario === 'http-error') return Response.json({ error: '架空の取得失敗' }, { status: 503 })
      const data = staffDataFor(['1', '2']); data.items['1'] = { customerId: '1', castId: null, castName: null, status: 'unassigned', goal: null, actual: null }; return Response.json(data)
    })
    const props = { ...propsFor(), castId: '', customers: [{ ...customer(1), cast_name: '' }, customer(2)], staff: { castLabels: new Map(), selectedIds: new Set() }, onRefresh: () => { refreshes++ } }, screen = f.screen(props)
    if (scenario === 'http-error') await until(() => nodes(screen.output, node => node.props?.role === 'alert').length)
    else await until(() => components(screen.output, 'CustomerGoalLedgerRow')[1].props.ready)
    f.fire('window', 'focus'); await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(refreshes, 0); assert.equal(components(screen.output, 'CustomerGoalLedgerRow')[0].props.ready, false)
    assert.equal(components(screen.output, 'CustomerGoalsExport')[0].props.disabled, true)
    if (scenario === 'http-error') assert.ok(nodes(screen.output, node => node.type === 'button' && node.props.children === '再取得').length)
    f.close()
  }
})
