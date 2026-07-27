'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useCustomerActions } from '@/hooks/useCustomers'
// v0.3.48-C: サーバー検索条件パネルの「担当キャスト」選択肢用 (プロフィールのみの軽量リスト)
import { useCasts } from '@/hooks/useCasts'
// v0.3.43-A: クライアント認証情報は fetchMe (sessionStorage キャッシュ) に統一。
//   createClient による supabase 直叩きは削除。
import { fetchMe } from '@/lib/authCache'
import Image from 'next/image'
import { type Customer } from '@/types'
import Link from 'next/link'
import UserChip from '@/components/UserChip'
import BottomNav from '@/components/BottomNav'
import NotificationBell from '@/components/NotificationBell'
import Avatar, { type CustomerRank as AvatarCustomerRank } from '@/components/ui/Avatar'
import { useViewMode } from '@/hooks/useViewMode'
import type { FollowUpNextAction } from '@/lib/followUpWorkflow'
import {
  getMissingCoreCustomerFields,
} from '@/lib/coreCustomerFields'

// ─── ⚡ 動的読み込み（初期バンドルから外して初回表示を高速化） ────
//  これらは「条件付き表示」または「重い」コンポーネント。
//  必要になったタイミング（モーダル開く・スクロール・ロール判定後等）に
//  遅延ロードすることで初期 JS のサイズを大幅削減。
//  2026-05-14 顧客一覧からホーム専用要素を分離済み。
//  お知らせはヘッダーの NotificationBell から見る。
//  v0.3.54-A: ホームのダッシュボードは廃止。スマホ通知設定だけを /home に配置。
const CustomerDetailPanel = dynamic(() => import('@/components/CustomerDetailPanel'), { ssr: false, loading: () => null })
const CustomerForm = dynamic(() => import('@/components/CustomerForm'), { ssr: false, loading: () => null })

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'

// 2026-05-14: 旧 rankStyle マップは Avatar コンポーネントの customerRank バッジに統合済みのため撤去。
// Avatar が S=深紅 / A=濃ピンク / B=淡ピンク / C=極淡 の 4 段階を一元管理する。

// ─── v0.3.49-A: 検索条件の型と「よく使う検索」プリセット ─────────────
//   cond は /api/customers/search のパラメータと1対1。API 変更なしで実現できるものだけ。
//   「今月誕生日」等の API 拡張が必要なものは v0.3.49-A2 候補として見送り。
type SearchCond = {
  keyword: string
  area: string
  nomination: string
  ranks: string[]
  castName: string
  minAvgSpend: string
  minTotalSpent: string
  minDays: string
}
const EMPTY_COND: SearchCond = {
  keyword: '', area: '', nomination: '', ranks: [], castName: '',
  minAvgSpend: '', minTotalSpent: '', minDays: '',
}
const PAGE_SIZE = 50
const SEARCH_PRESETS: { key: string; label: string; cond: Partial<SearchCond> }[] = [
  { key: 'hon30', label: '本指名×30日来店なし', cond: { nomination: '本指名', minDays: '30' } },
  { key: 'hon60', label: '本指名×60日来店なし', cond: { nomination: '本指名', minDays: '60' } },
  { key: 'rankSA', label: 'S・Aランク', cond: { ranks: ['S', 'A'] } },
  { key: 'highUnit', label: '高単価(5万円以上)', cond: { minAvgSpend: '50000' } },
  { key: 'highTotal', label: '累計50万円以上', cond: { minTotalSpent: '500000' } },
  { key: 'outside', label: '県外', cond: { area: 'outside' } },
  // 「未登録あり」は「全員表示」を起点に、サーバー側の登録状況条件を追加する複合プリセット。
  { key: 'incomplete', label: '未登録あり', cond: {} },
]

type FollowUpCardMeta = {
  next_action: FollowUpNextAction | null
  next_contact_date: string | null
  last_contacted_at: string | null
}

export default function CustomerList() {
  // v0.3.48-D: 関数専用 hook に切替 (state なし・全件 fetch なし)
  const { addCustomer, ToastView } = useCustomerActions()
  const { casts } = useCasts()
  const { isPC, toggle, ready } = useViewMode()
  const [isAdmin, setIsAdmin] = useState(false)
  // v0.3.43-A: supabase client は不要になったため削除
  useScrollTopOnMount()

  // v0.3.23: 顧客一覧の NEW バッジ・経過日数用の meta データを取得
  // v0.3.31: 累計来店回数 / 累計売上 / 平均単価 も同時取得して顧客カードに表示
  const [badgeMeta, setBadgeMeta] = useState<{
    firstVisits: Record<string, string>
    lastVisits: Record<string, string>
    phaseShoshimeiAt: Record<string, string>
    visitCounts: Record<string, number>
    totalSales: Record<string, number>
    avgPerVisit: Record<string, number>
  }>({ firstVisits: {}, lastVisits: {}, phaseShoshimeiAt: {}, visitCounts: {}, totalSales: {}, avgPerVisit: {} })
  // ─── v0.3.48-C: サーバー検索 (検索ファースト) ─────────────────────
  //   初期表示では何も fetch しない。「検索」「全員表示」ボタンで
  //   /api/customers/search を叩き、結果の metrics から badgeMeta
  //   (NEWバッジ / 経過日数 / 累計表示用) を構築する。badge-meta API の別取得は廃止。
  const [results, setResults] = useState<Customer[]>([])
  const [followUpMeta, setFollowUpMeta] = useState<Record<string, FollowUpCardMeta>>({})
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchPage, setSearchPage] = useState(1)
  const [searchPageCount, setSearchPageCount] = useState(1)
  const [searchRevision, setSearchRevision] = useState(0)
  // v0.3.49-A: 最後に実行した検索条件 (条件チップの源泉)。all=true は「全員表示」
  const [applied, setApplied] = useState<{ all: boolean; cond: SearchCond } | null>(null)
  // サーバー検索条件
  const [srvKeyword, setSrvKeyword] = useState('')            // v0.3.48-C2: 名前・ニックネーム部分一致
  const [srvArea, setSrvArea] = useState('')                  // '' | fukuoka | outside | unset
  const [srvNomination, setSrvNomination] = useState('')
  const [srvRanks, setSrvRanks] = useState<string[]>([])
  const [srvCastName, setSrvCastName] = useState('')
  const [srvMinAvgSpend, setSrvMinAvgSpend] = useState('')
  const [srvMinTotalSpent, setSrvMinTotalSpent] = useState('')
  const [srvMinDays, setSrvMinDays] = useState('')

  type SearchMetrics = {
    totalSpent: number; visitCount: number; avgPerVisit: number
    lastVisitDate: string | null; daysSinceLastVisit: number | null; firstVisitDate: string | null
  }

  // 検索条件を確定する。実データ取得は下の effect が1ページずつ行う。
  const runSearchWith = useCallback((all: boolean, cond: SearchCond) => {
    setSearchPage(1)
    setApplied({ all, cond })
    setSearched(true)
    // 同じ条件の「再検索」も必ず実行できるよう世代を進める。
    setSearchRevision(value => value + 1)
  }, [])

  // NEW バッジ判定 — 3 条件 OR（キャストページ CUSTOMERS タブと同じロジック）
  //   ① is_first_visit=true visit_date から 90日以内
  //   ② phase='初指名' AND 最終来店日 90日以内
  //   ③ phase_shoshimei_at から 90日以内
  // v0.3.38 hotfix: useEffect 内の setState は react-hooks/set-state-in-effect に
  //   引っかかるため、useState の lazy initializer で初回マウント時に1回だけ
  //   Date.now() を実行する。SSR 時は server time が焼かれるが、経過日数表示の
  //   用途では実害なし (リロード時に client time で最新化)。
  const [todayBaseTime] = useState<number>(() => Date.now())

  const isNewCustomer = (cust: { id: string | number; phase?: string | null }): boolean => {
    const key = String(cust.id)
    const firstDate = badgeMeta.firstVisits[key]
    const lastDate = badgeMeta.lastVisits[key]
    const phAt = badgeMeta.phaseShoshimeiAt[key]
    // ①
    if (firstDate) {
      const d = Math.floor((todayBaseTime - new Date(firstDate + 'T00:00:00').getTime()) / 86400000)
      if (d >= 0 && d <= 90) return true
    }
    // ②
    if (cust.phase === '初指名' && lastDate) {
      const d = Math.floor((todayBaseTime - new Date(lastDate + 'T00:00:00').getTime()) / 86400000)
      if (d >= 0 && d <= 90) return true
    }
    // ③
    if (phAt) {
      const d = Math.floor((todayBaseTime - new Date(phAt).getTime()) / 86400000)
      if (d >= 0 && d <= 90) return true
    }
    return false
  }

  // 最終来店経過日数（カスタマーカード用）
  const daysSinceLastVisit = (custId: string | number): number | null => {
    const lastDate = badgeMeta.lastVisits[String(custId)]
    if (!lastDate) return null
    return Math.floor((todayBaseTime - new Date(lastDate + 'T00:00:00').getTime()) / 86400000)
  }

  // 顧客詳細パネルの権限切替用に admin/owner だけ取得する。
  // ホーム要素は /home に集約したためキャスト用 state は廃止。
  useEffect(() => {
    const checkRole = async () => {
      // v0.3.43-A: fetchMe() で sessionStorage キャッシュ経由
      //   owner = role='admin' + is_owner=true なので role 判定だけで十分
      const me = await fetchMe()
      if (me) setIsAdmin(me.role === 'admin')
    }
    checkRole()
  }, [])
  // v0.3.48-C2: 名前検索はサーバー検索 (srvKeyword) に一本化。クライアント側 searchTerm は廃止
  // v0.3.48-C3: 結果内フィルター (表示調整) は 最終連絡 / お客様担当 / 登録状況 の3つだけ。
  //   重複5項目 (キャスト/ランク/指名/地域/最終入店) は検索条件パネル側に一本化して削除
  const [contactDaysFilter, setContactDaysFilter] = useState('')
  const [staffFilter, setStaffFilter] = useState('')
  const [incompleteFilter, setIncompleteFilter] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'rank' | 'lastVisit' | 'nomination'>('name')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  // v0.3.48-C2: 「さらに絞り込む」(結果内絞り込み) は PC/モバイル共通で
  //   検索後 (searched=true) のみ表示、デフォルト閉
  const [refineOpen, setRefineOpen] = useState(false)

  // ホームの「基本情報の不足」から来たときだけ、「未登録あり」を適用して
  // 全員表示を自動実行する。通常の /customers 初期表示は従来どおり検索前のまま。
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('incomplete') !== 'incomplete') return
    setIncompleteFilter('incomplete')
    runSearchWith(true, EMPTY_COND)
  }, [runSearchWith])

  useEffect(() => {
    if (!applied) return

    const controller = new AbortController()
    let cancelled = false
    const load = async () => {
      setSearching(true)
      setSearchError(null)
      setResults([])
      setSearchTotal(0)
      setSearchPageCount(1)
      try {
        const params = new URLSearchParams({
          page: String(searchPage),
          pageSize: String(PAGE_SIZE),
          sort: sortKey,
        })
        if (!applied.all) {
          const cond = applied.cond
          if (cond.keyword.trim()) params.set('keyword', cond.keyword.trim())
          if (cond.area) params.set('area', cond.area)
          if (cond.nomination) params.set('nomination', cond.nomination)
          if (cond.ranks.length > 0) params.set('ranks', cond.ranks.join(','))
          if (cond.castName) params.set('castName', cond.castName)
          if (cond.minAvgSpend) params.set('minAvgSpend', cond.minAvgSpend)
          if (cond.minTotalSpent) params.set('minTotalSpent', cond.minTotalSpent)
          if (cond.minDays) params.set('minDaysSinceLastVisit', cond.minDays)
        }
        if (contactDaysFilter) params.set('contactDays', contactDaysFilter)
        if (staffFilter) params.set('staff', staffFilter)
        if (incompleteFilter) params.set('incomplete', incompleteFilter)

        const response = await fetch(`/api/customers/search?${params}`, {
          signal: controller.signal,
        })
        const data = await response.json() as {
          error?: string
          total: number
          page: number
          pageCount: number
          customers: Array<Record<string, unknown> & {
            metrics: SearchMetrics
            followUp: FollowUpCardMeta | null
          }>
        }
        if (!response.ok) {
          throw new Error(data.error || `検索に失敗しました (HTTP ${response.status})`)
        }
        if (cancelled) return
        if (data.page > data.pageCount) {
          setSearchPage(data.pageCount)
          return
        }

        const firstVisits: Record<string, string> = {}
        const lastVisits: Record<string, string> = {}
        const phaseShoshimeiAt: Record<string, string> = {}
        const visitCounts: Record<string, number> = {}
        const totalSales: Record<string, number> = {}
        const avgPerVisit: Record<string, number> = {}
        const nextFollowUps: Record<string, FollowUpCardMeta> = {}
        for (const row of data.customers) {
          const key = String(row.id)
          const metrics = row.metrics
          if (metrics.firstVisitDate) firstVisits[key] = metrics.firstVisitDate
          if (metrics.lastVisitDate) lastVisits[key] = metrics.lastVisitDate
          if (typeof row.phase_shoshimei_at === 'string' && row.phase_shoshimei_at) {
            phaseShoshimeiAt[key] = row.phase_shoshimei_at
          }
          visitCounts[key] = metrics.visitCount
          totalSales[key] = metrics.totalSpent
          avgPerVisit[key] = metrics.avgPerVisit
          if (row.followUp) nextFollowUps[key] = row.followUp
        }
        setBadgeMeta({ firstVisits, lastVisits, phaseShoshimeiAt, visitCounts, totalSales, avgPerVisit })
        setFollowUpMeta(nextFollowUps)
        setResults(data.customers as unknown as Customer[])
        setSearchTotal(data.total)
        setSearchPageCount(data.pageCount)
      } catch (error) {
        if (controller.signal.aborted || cancelled) return
        setSearchError(error instanceof Error ? error.message : '検索に失敗しました')
      } finally {
        if (!cancelled) setSearching(false)
      }
    }

    // searchRevision は同一条件で検索ボタンを押した場合の再取得トリガー。
    void searchRevision
    load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [
    applied,
    contactDaysFilter,
    incompleteFilter,
    searchPage,
    searchRevision,
    sortKey,
    staffFilter,
  ])

  // モバイルの折りたたみ閉じバーで「絞り込みN件」を出すための件数
  const activeFilterCount = useMemo(() => {
    return [
      contactDaysFilter, staffFilter, incompleteFilter,
    ].filter(v => v !== '' && v !== null && v !== undefined).length
  }, [contactDaysFilter, staffFilter, incompleteFilter])

  // ─── v0.3.49-A: 適用中条件のチップ (× で外して自動再検索) ───────────
  const condChips = useMemo(() => {
    if (!applied) return [] as Array<{ key: string; label: string; removable: boolean }>
    const chips: Array<{ key: string; label: string; removable: boolean }> = []
    if (applied.all) {
      chips.push({ key: 'all', label: '全員表示', removable: false })
    } else {
      const c = applied.cond
      if (c.keyword.trim()) chips.push({ key: 'keyword', label: `「${c.keyword.trim()}」を含む`, removable: true })
      if (c.area) chips.push({ key: 'area', label: c.area === 'fukuoka' ? '県内' : c.area === 'outside' ? '県外' : 'エリア未登録', removable: true })
      if (c.nomination) chips.push({ key: 'nomination', label: c.nomination, removable: true })
      if (c.ranks.length > 0) chips.push({ key: 'ranks', label: `ランク ${c.ranks.join('・')}`, removable: true })
      if (c.castName) chips.push({ key: 'castName', label: `担当 ${c.castName}`, removable: true })
      if (c.minAvgSpend) chips.push({ key: 'minAvgSpend', label: `単価${Number(c.minAvgSpend).toLocaleString()}円以上`, removable: true })
      if (c.minTotalSpent) chips.push({ key: 'minTotalSpent', label: `累計${Number(c.minTotalSpent).toLocaleString()}円以上`, removable: true })
      if (c.minDays) chips.push({ key: 'minDays', label: `最終来店${c.minDays}日以上`, removable: true })
    }
    // サーバー側の「未登録あり」も適用中条件として見せる。
    if (incompleteFilter === 'incomplete') chips.push({ key: 'incomplete', label: '未登録あり', removable: true })
    return chips
  }, [applied, incompleteFilter])

  const getIncompleteLabels = (customer: Record<string, unknown>) => {
    return getMissingCoreCustomerFields(customer).map(field => field.label)
  }

  // 絞り込み・並び替えはAPI側で行い、現在の50件だけを描画する。
  const filteredCustomers = results

  // v0.3.48-C: isLoaded (全件 fetch 完了) ゲートは廃止。ready (ビューモード判定) のみ
  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{
          width: '32px', height: '32px',
          border: `1px solid ${C.pink}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const selectBase: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.95)',
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: '10px 28px 10px 12px',
    fontSize: 12,
    color: C.dark,
    letterSpacing: '0.05em',
    outline: 'none',
    fontFamily: 'inherit',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(232,135,154,0.06)',
  }

  // ─── ビューモード切替ボタン ────────────────────────────────────────
  const ViewToggle = () => (
    <button
      className="eclat-header-view-toggle"
      onClick={toggle}
      style={{
        background: isPC
          ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
          : C.white,
        border: `1px solid ${C.pink}`,
        color: isPC ? C.white : C.pink,
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.15em',
        padding: '8px 14px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
      }}
    >
      {isPC ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
          </svg>
          スマホ表示
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          パソコン表示
        </>
      )}
    </button>
  )

  // ─── 検索＆フィルターUI ─────────────────────────────────────────
  const searchFilters = (
    <>
      {/* v0.3.48-C2: 名前検索はサーバー検索パネル (srvKeyword) に移動済み */}
      {/* フィルタ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
        {[
          // v0.3.48-C3: キャスト/ランク/指名/地域は検索条件パネルに一本化したため削除。
          //   「お客様担当」(has_customer_staff フラグ) は検索条件の「担当キャスト」とは別物なので残す
          {
            value: staffFilter,
            onChange: (value: string) => {
              setStaffFilter(value)
              setSearchPage(1)
            },
            placeholder: 'お客様担当',
            options: ['yes', 'no'],
            formatOption: (v: string) => v === 'yes' ? 'お客様担当あり' : 'お客様担当なし',
          },
          {
            value: incompleteFilter,
            onChange: (value: string) => {
              setIncompleteFilter(value)
              setSearchPage(1)
            },
            placeholder: '登録状況',
            options: ['incomplete', 'complete'],
            formatOption: (v: string) => v === 'incomplete' ? '未登録あり' : '不足なし・対象外',
          },
        ].map((f, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="eclat-input"
              style={{ ...selectBase, padding: '8px 28px 8px 10px', fontSize: '11px' }}
            >
              <option value="">{f.placeholder}</option>
              {f.options.map((opt: string) => (
                <option key={opt} value={opt}>
                  {f.formatOption ? f.formatOption(opt) : opt}
                </option>
              ))}
            </select>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke={C.pinkMuted} strokeWidth="2"
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        ))}
        {[
          {
            value: contactDaysFilter,
            onChange: (value: string) => {
              setContactDaysFilter(value)
              setSearchPage(1)
            },
            label: '最終連絡',
          },
        ].map((f, i) => (
          <div key={`days-${i}`} style={{ position: 'relative' }}>
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="eclat-input"
              style={{ ...selectBase, padding: '8px 28px 8px 10px', fontSize: '11px' }}
            >
              <option value="">{f.label}</option>
              <option value="3">3日以上</option>
              <option value="7">7日以上</option>
              <option value="14">14日以上</option>
              <option value="30+">30日以上</option>
              <option value="none">未設定</option>
            </select>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke={C.pinkMuted} strokeWidth="2"
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        ))}
      </div>
    </>
  )

  // ─── v0.3.48-C: サーバー検索条件パネル ─────────────────────────
  const toggleSrvRank = (r: string) =>
    setSrvRanks(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])

  // ─── v0.3.49-A: プリセット / チップ操作のヘルパー ─────────────────
  const currentFormCond = (): SearchCond => ({
    keyword: srvKeyword, area: srvArea, nomination: srvNomination, ranks: srvRanks,
    castName: srvCastName, minAvgSpend: srvMinAvgSpend, minTotalSpent: srvMinTotalSpent, minDays: srvMinDays,
  })
  const syncFormStates = (c: SearchCond) => {
    setSrvKeyword(c.keyword); setSrvArea(c.area); setSrvNomination(c.nomination)
    setSrvRanks(c.ranks); setSrvCastName(c.castName)
    setSrvMinAvgSpend(c.minAvgSpend); setSrvMinTotalSpent(c.minTotalSpent); setSrvMinDays(c.minDays)
  }
  const hasAnyCond = (c: SearchCond) =>
    !!(c.keyword.trim() || c.area || c.nomination || c.ranks.length > 0 || c.castName
      || c.minAvgSpend || c.minTotalSpent || c.minDays)

  // v0.3.49-A hotfix (Codex P2): 表示調整 (結果内フィルター) を初期状態に戻す。
  //   プリセット切替/全員表示/条件クリアで contactDays/staff/incomplete が裏に残り、
  //   「全員表示なのに全員出ない」状態になるのを防ぐ
  const resetDisplayAdjustments = () => {
    setContactDaysFilter('')
    setStaffFilter('')
    setIncompleteFilter('')
    setRefineOpen(false)
  }

  // 全員表示 (パネル / 0件時 / チップ全解除 から共用)
  const showAllCustomers = () => {
    resetDisplayAdjustments()
    syncFormStates(EMPTY_COND)
    runSearchWith(true, EMPTY_COND)
  }

  const applyPreset = (p: typeof SEARCH_PRESETS[number]) => {
    if (p.key === 'incomplete') {
      // 「未登録あり」= 全員表示 + サーバー側の登録状況フィルターの複合プリセット
      resetDisplayAdjustments()  // 他の表示調整 (最終連絡/お客様担当) は先にリセット
      setIncompleteFilter('incomplete')
      setRefineOpen(true)  // 何が効いているか見えるように表示調整を開く
      syncFormStates(EMPTY_COND)
      runSearchWith(true, EMPTY_COND)
      return
    }
    resetDisplayAdjustments()  // hotfix: 前のプリセット/手動の表示調整を持ち越さない
    const cond: SearchCond = { ...EMPTY_COND, ...p.cond }
    syncFormStates(cond)  // フォームにも反映 (プリセット→微調整→再検索ができる)
    runSearchWith(false, cond)
  }

  const removeChip = (key: string) => {
    if (key === 'incomplete') {
      setIncompleteFilter('')
      setSearchPage(1)
      return
    }
    if (!applied || applied.all) return
    const cond: SearchCond = { ...applied.cond, [key]: key === 'ranks' ? [] : '' }
    syncFormStates(cond)
    if (hasAnyCond(cond)) {
      runSearchWith(false, cond)
    } else {
      // 条件が無くなったら全員表示と同義 (hotfix: 表示調整も含めて素の全員表示に)
      showAllCustomers()
    }
  }

  const clearAllConditions = () => {
    syncFormStates(EMPTY_COND)
    resetDisplayAdjustments()  // hotfix: 表示調整もまとめてリセット
    setSortKey('name')         // 並びも既定に戻す (Codex 提案採用)
    setResults([])
    setSearchTotal(0)
    setSearchPage(1)
    setSearchPageCount(1)
    setApplied(null)
    setSearched(false)  // 検索前のガイドに戻す
  }

  // 適用中条件チップの行 (PC/モバイル共用)
  const condChipsRow = condChips.length > 0 ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {condChips.map(chip => (
        <span key={chip.key} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 10, fontWeight: 600, color: C.tagTextStrong,
          background: C.tagBg2, border: `1px solid ${C.pinkLight}`,
          padding: '3px 9px', borderRadius: 12,
        }}>
          {chip.label}
          {chip.removable && (
            <button
              onClick={() => removeChip(chip.key)}
              aria-label={`${chip.label} を外す`}
              style={{
                background: 'transparent', border: 'none', color: C.pinkMuted,
                fontSize: 12, cursor: 'pointer', padding: 0, lineHeight: 1, fontFamily: 'inherit',
              }}
            >×</button>
          )}
        </span>
      ))}
    </div>
  ) : null

  const goToSearchPage = (nextPage: number) => {
    setSearchPage(Math.max(1, Math.min(searchPageCount, nextPage)))
    setSelectedCustomerId(null)
    window.requestAnimationFrame(() => {
      const target = document.getElementById(
        isPC ? 'customer-results-scroll' : 'customer-results-heading',
      )
      if (isPC) target?.scrollTo({ top: 0, behavior: 'smooth' })
      else target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const paginationControls = searched && searchPageCount > 1 ? (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      padding: '14px 10px 18px',
    }}>
      <button
        type="button"
        onClick={() => goToSearchPage(searchPage - 1)}
        disabled={searching || searchPage <= 1}
        style={paginationButtonStyle}
      >
        前へ
      </button>
      <span style={{ minWidth: 72, textAlign: 'center', fontSize: 10, color: C.pinkMuted }}>
        {searchPage} / {searchPageCount}
      </span>
      <button
        type="button"
        onClick={() => goToSearchPage(searchPage + 1)}
        disabled={searching || searchPage >= searchPageCount}
        style={paginationButtonStyle}
      >
        次へ
      </button>
    </div>
  ) : null

  const searchPanel = (
    <div>
      {/* v0.3.48-C2: 名前・ニックネーム検索 (サーバー検索条件、一番上) */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={C.pinkMuted} strokeWidth="1.5"
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
        >
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="名前・ニックネームで検索"
          value={srvKeyword}
          onChange={(e) => setSrvKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearchWith(false, currentFormCond()) }}
          className="eclat-input"
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.95)',
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: '11px 14px 11px 38px',
            fontSize: 13,
            color: C.dark,
            letterSpacing: '0.05em',
            outline: 'none',
            fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(232,135,154,0.08)',
            boxSizing: 'border-box',
          }}
        />
      </div>
      {/* v0.3.49-A: よく使う検索 (タップで即検索 + フォームに条件反映) */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.18em', color: C.pinkMuted, fontWeight: 600, marginBottom: 5 }}>
          よく使う検索
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SEARCH_PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p)} disabled={searching} style={{
              padding: '5px 11px', borderRadius: 20,
              border: `1px solid ${C.border}`,
              background: 'rgba(255,255,255,0.9)', color: C.dark2,
              fontSize: 10.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', opacity: searching ? 0.6 : 1,
            }}>{p.label}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 10, letterSpacing: '0.22em', color: C.pink, fontWeight: 700, marginBottom: 8 }}>
        検索条件
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <select value={srvArea} onChange={e => setSrvArea(e.target.value)} className="eclat-input"
          style={{ ...selectBase, padding: '8px 28px 8px 10px', fontSize: 11 }}>
          <option value="">エリア指定なし</option>
          <option value="fukuoka">県内（福岡県）</option>
          <option value="outside">県外</option>
          <option value="unset">エリア未登録</option>
        </select>
        <select value={srvNomination} onChange={e => setSrvNomination(e.target.value)} className="eclat-input"
          style={{ ...selectBase, padding: '8px 28px 8px 10px', fontSize: 11 }}>
          <option value="">指名指定なし</option>
          <option value="本指名">本指名</option>
          <option value="場内">場内</option>
          <option value="フリー">フリー</option>
        </select>
        <select value={srvCastName} onChange={e => setSrvCastName(e.target.value)} className="eclat-input"
          style={{ ...selectBase, padding: '8px 28px 8px 10px', fontSize: 11 }}>
          <option value="">担当指定なし</option>
          {casts.map(c => c.cast_name ? (
            <option key={c.id} value={c.cast_name}>{c.cast_name}</option>
          ) : null)}
        </select>
        <select value={srvMinDays} onChange={e => setSrvMinDays(e.target.value)} className="eclat-input"
          style={{ ...selectBase, padding: '8px 28px 8px 10px', fontSize: 11 }}>
          <option value="">最終来店指定なし</option>
          <option value="30">30日以上</option>
          <option value="60">60日以上</option>
          <option value="90">90日以上</option>
        </select>
        <input type="number" min={0} placeholder="客単価◯円以上" value={srvMinAvgSpend}
          onChange={e => setSrvMinAvgSpend(e.target.value)} className="eclat-input"
          style={{ ...selectBase, padding: '8px 10px', fontSize: 11, cursor: 'text', appearance: 'auto', WebkitAppearance: 'none' }} />
        <input type="number" min={0} placeholder="累計売上◯円以上" value={srvMinTotalSpent}
          onChange={e => setSrvMinTotalSpent(e.target.value)} className="eclat-input"
          style={{ ...selectBase, padding: '8px 10px', fontSize: 11, cursor: 'text', appearance: 'auto', WebkitAppearance: 'none' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {['S', 'A', 'B', 'C', '切れた', '未設定'].map(r => {
          const on = srvRanks.includes(r)
          return (
            <button key={r} onClick={() => toggleSrvRank(r)} style={{
              padding: '4px 12px', borderRadius: 20,
              border: `1px solid ${on ? C.pink : C.border}`,
              background: on ? C.tagBg2 : 'transparent',
              color: on ? C.tagTextStrong : C.pinkMuted,
              fontSize: 11, fontWeight: on ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{r}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => runSearchWith(false, currentFormCond())} disabled={searching} style={{
          flex: 2, padding: '10px',
          background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
          color: C.white, border: 'none', borderRadius: 8,
          fontSize: 12, fontWeight: 600, letterSpacing: '0.1em',
          cursor: 'pointer', fontFamily: 'inherit', opacity: searching ? 0.6 : 1,
        }}>{searching ? '検索中…' : '🔍 この条件で検索'}</button>
        <button onClick={showAllCustomers} disabled={searching} style={{
          flex: 1, padding: '10px',
          background: 'transparent', color: C.pink,
          border: `1px solid ${C.pink}`, borderRadius: 8,
          fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: searching ? 0.6 : 1,
        }}>全員表示</button>
      </div>
      {searchError && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.danger }}>⚠ {searchError}</div>
      )}
    </div>
  )

  // ─── 顧客カード（PC用：モックアップ準拠の大きめサイズ） ──────────
  const selectCustomer = (id: string) => {
    setShowNewCustomerForm(false)
    setSelectedCustomerId(id)
  }

  const shortDate = (date: string | null | undefined) => {
    if (!date) return '未記録'
    const dateOnly = date.slice(0, 10)
    return dateOnly.replaceAll('-', '/')
  }

  const CustomerCardPC = ({ customer }: { customer: typeof filteredCustomers[0] }) => {
    const isActive = selectedCustomerId === customer.id
    const nextFollowUp = followUpMeta[String(customer.id)]
    return (
      <button
        onClick={() => selectCustomer(customer.id)}
        className="eclat-customer-card-pc"
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: isActive
            ? 'linear-gradient(135deg, #FFF1F4 0%, #FFFAFC 100%)'
            : C.white,
          borderLeft: isActive ? `3px solid ${C.pink}` : '3px solid transparent',
          borderTop: 'none',
          borderRight: 'none',
          borderBottom: `1px solid ${C.border}`,
          padding: '14px 18px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.18s ease, padding-left 0.18s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Avatar：イニシャル円＋customerRank バッジ */}
          <Avatar
            name={customer.customer_name || '?'}
            customerRank={(customer.customer_rank ?? null) as AvatarCustomerRank}
            size="md"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 15, fontWeight: 700, color: C.dark,
              margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {customer.customer_name}
                <span style={{ fontSize: 10, color: C.pinkMuted, marginLeft: 6, fontWeight: 500 }}>様</span>
              </span>
              {/* v0.3.23: NEW バッジ */}
              {isNewCustomer(customer) && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  color: '#FFF',
                  background: 'linear-gradient(135deg, #E8879B, #F4A5B8)',
                  padding: '2px 7px', borderRadius: 8,
                  boxShadow: '0 2px 5px rgba(232,135,154,0.3)',
                  flexShrink: 0,
                }}>新規</span>
              )}
            </p>
            {customer.nickname && customer.nickname !== customer.customer_name && (
              <p style={{
                fontSize: 10, color: C.pink,
                margin: '2px 0 0 0', letterSpacing: '0.08em',
                fontStyle: 'italic',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {customer.nickname}
              </p>
            )}
            <p style={{
              // v0.3.50-B: 接客前に読む情報なので可読性を底上げ (10px pinkMuted → 10.5px dark2)
              fontSize: 10.5, color: C.dark2,
              margin: '3px 0 0 0', letterSpacing: '0.05em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {customer.cast_name ? `担当 ${customer.cast_name}` : '—'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{
            fontSize: 10,
            color: '#FFF',
            background: customer.nomination_status === '本指名' ? C.pinkDeep : C.pink,
            padding: '3px 10px',
            borderRadius: 10,
            fontWeight: 700,
          }}>
            {customer.nomination_status || '指名未設定'}
          </span>
          <span style={{
            fontSize: 10,
            color: C.dark,
            background: C.rankBadge,
            border: `1px solid ${C.border}`,
            padding: '3px 10px',
            borderRadius: 10,
            fontWeight: 700,
          }}>
            {customer.customer_rank === '切れた' ? '切れた' : `ランク ${customer.customer_rank || '未設定'}`}
          </span>
          {customer.has_customer_staff && (
            <span style={{
              fontSize: 9.5, color: '#fff',
              background: 'linear-gradient(135deg, #E8789A, #F4A5B8)',
              padding: '3px 10px',
              letterSpacing: '0.05em', fontWeight: 600,
              borderRadius: 10,
              boxShadow: '0 2px 6px rgba(232,135,154,0.22)',
            }}>お客様担当</span>
          )}
          {/* v0.3.23: 最終来店経過日数バッジ（PC版） */}
          {(() => {
            const d = daysSinceLastVisit(customer.id)
            if (d == null) return null
            // v0.3.50-B: 状態色トークン化 (90日超は既存 C.danger 系に統合・微小な色味差は許容)
            const color = d <= 30 ? C.success : d <= 60 ? C.warning : d <= 90 ? C.caution : C.danger
            const bg = d <= 30 ? C.successBg : d <= 60 ? C.warningBg : d <= 90 ? C.cautionBg : C.dangerBg
            return (
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                color, background: bg,
                padding: '3px 10px', borderRadius: 10,
              }}>最終来店 {d}日前</span>
            )
          })()}
          {[customer.phase, customer.region].filter(Boolean).map((tag, i) => (
            <span key={i} style={{
              fontSize: 9.5, color: C.pinkMuted,
              border: `1px solid ${C.border}`,
              background: 'rgba(255,255,255,0.85)',
              padding: '3px 10px', letterSpacing: '0.05em',
              borderRadius: 10,
            }}>{tag}</span>
          ))}
          {incompleteFilter === 'incomplete' && (() => {
            const labels = getIncompleteLabels(customer as unknown as Record<string, unknown>)
            return labels.length > 0 ? (
              <span style={{
                fontSize: 9, color: C.danger,
                border: `1px solid ${C.pinkLight}`,
                background: '#FFEBED',
                padding: '3px 9px', letterSpacing: '0.03em',
                borderRadius: 10, fontWeight: 600,
              }}>未登録: {labels.join('・')}</span>
            ) : null
          })()}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 8,
          padding: '7px 9px',
          borderRadius: 10,
          background: nextFollowUp ? '#FFF0F4' : '#FAF7F8',
          color: C.dark2,
          fontSize: 9.5,
        }}>
          <span>最終連絡 {shortDate(customer.last_contact_date)}</span>
          {nextFollowUp ? (
            <span style={{ color: C.pinkDeep, fontWeight: 700, textAlign: 'right' }}>
              次：{nextFollowUp.next_action || '行動未設定'}
              {nextFollowUp.next_contact_date ? ` ${shortDate(nextFollowUp.next_contact_date)}` : ' 日付未設定'}
            </span>
          ) : (
            <span style={{ color: C.pinkMuted }}>追いかけ未登録</span>
          )}
        </div>
        {/* v0.3.31: 累計来店回数 / 累計売上 / 平均単価（PC版） */}
        {(() => {
          const key = String(customer.id)
          const count = badgeMeta.visitCounts[key] || 0
          const total = badgeMeta.totalSales[key] || 0
          const avg = badgeMeta.avgPerVisit[key] || 0
          if (count === 0) return null
          return (
            <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 10, color: C.dark2 }}>
              <span>来店 <b style={{ color: C.pinkDeep, fontSize: 11 }}>{count}回</b></span>
              <span>累計 <b style={{ color: C.pinkDeep, fontSize: 11 }}>¥{total.toLocaleString()}</b></span>
              <span>単価 <b style={{ color: C.pinkDeep, fontSize: 11 }}>¥{avg.toLocaleString()}</b></span>
            </div>
          )
        })()}
      </button>
    )
  }

  // ─── 顧客カード（Mobile用：フルサイズ） ─────────────────────────
  const CustomerCardMobile = ({ customer }: { customer: typeof filteredCustomers[0] }) => {
    const nextFollowUp = followUpMeta[String(customer.id)]
    return (
      <div
        onClick={() => setSelectedCustomerId(customer.id)}
        style={{
          display: 'block',
          background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          boxShadow: '0 8px 22px rgba(232,135,154,0.08), 0 2px 6px rgba(232,135,154,0.04)',
          textDecoration: 'none', position: 'relative', overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        <div style={{ height: 2, background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})` }} />
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Avatar：イニシャル円＋customerRank バッジ */}
            <Avatar
              name={customer.customer_name || '?'}
              customerRank={(customer.customer_rank ?? null) as AvatarCustomerRank}
              size="lg"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 17, fontWeight: 700, letterSpacing: '0.03em',
                color: C.dark, margin: 0,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  {customer.customer_name}
                </span>
                {/* v0.3.23: NEW バッジ */}
                {isNewCustomer(customer) && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
                    color: '#FFF',
                    background: 'linear-gradient(135deg, #E8879B, #F4A5B8)',
                    padding: '2px 8px', borderRadius: 9,
                    boxShadow: '0 2px 5px rgba(232,135,154,0.3)',
                    flexShrink: 0,
                  }}>新規</span>
                )}
              </p>
              {customer.nickname && customer.nickname !== customer.customer_name && (
                <p style={{
                  fontSize: 10, color: C.pink,
                  fontStyle: 'italic', letterSpacing: '0.1em',
                  margin: '3px 0 0 0',
                }}>
                  &ldquo;{customer.nickname}&rdquo;
                </p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <span style={{
              fontSize: 10,
              color: '#FFF',
              background: customer.nomination_status === '本指名' ? C.pinkDeep : C.pink,
              padding: '4px 11px',
              borderRadius: 11,
              fontWeight: 700,
            }}>
              {customer.nomination_status || '指名未設定'}
            </span>
            <span style={{
              fontSize: 10,
              color: C.dark,
              background: C.rankBadge,
              border: `1px solid ${C.border}`,
              padding: '4px 11px',
              borderRadius: 11,
              fontWeight: 700,
            }}>
              {customer.customer_rank === '切れた' ? '切れた' : `ランク ${customer.customer_rank || '未設定'}`}
            </span>
            {customer.has_customer_staff && (
              <span style={{
                fontSize: 9.5, color: '#fff',
                background: 'linear-gradient(135deg, #E8789A, #F4A5B8)',
                padding: '4px 11px',
                letterSpacing: '0.05em', fontWeight: 600,
                borderRadius: 11,
                boxShadow: '0 2px 6px rgba(232,135,154,0.22)',
              }}>お客様担当</span>
            )}
            {/* v0.3.23: 最終来店経過日数バッジ（Mobile版） */}
            {(() => {
              const d = daysSinceLastVisit(customer.id)
              if (d == null) return null
              // v0.3.50-B: 状態色トークン化 (90日超は既存 C.danger 系に統合・微小な色味差は許容)
              const color = d <= 30 ? C.success : d <= 60 ? C.warning : d <= 90 ? C.caution : C.danger
              const bg = d <= 30 ? C.successBg : d <= 60 ? C.warningBg : d <= 90 ? C.cautionBg : C.dangerBg
              return (
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                  color, background: bg,
                  padding: '4px 11px', borderRadius: 11,
                }}>最終来店 {d}日前</span>
              )
            })()}
            {[customer.phase, customer.cast_name ? `担当 ${customer.cast_name}` : null, customer.region].filter(Boolean).map((tag, i) => (
              <span key={i} style={{
                fontSize: 9.5, color: C.pinkMuted,
                border: `1px solid ${C.border}`,
                background: 'rgba(255,255,255,0.85)',
                padding: '4px 11px', letterSpacing: '0.05em',
                borderRadius: 11,
              }}>{tag}</span>
            ))}
            {incompleteFilter === 'incomplete' && (() => {
              const labels = getIncompleteLabels(customer as unknown as Record<string, unknown>)
              return labels.length > 0 ? (
                <span style={{
                  fontSize: 9, color: C.danger,
                  border: `1px solid ${C.pinkLight}`,
                  background: '#FFEBED',
                  padding: '3px 9px', letterSpacing: '0.03em',
                  borderRadius: 10, fontWeight: 600,
                }}>未登録: {labels.join('・')}</span>
              ) : null
            })()}
          </div>
          <div style={{
            display: 'grid',
            gap: 5,
            marginTop: 11,
            padding: '9px 11px',
            borderRadius: 12,
            background: nextFollowUp ? '#FFF0F4' : '#FAF7F8',
            fontSize: 10,
            color: C.dark2,
          }}>
            <span>最終連絡：{shortDate(customer.last_contact_date)}</span>
            {nextFollowUp ? (
              <span style={{ color: C.pinkDeep, fontWeight: 700 }}>
                次にすること：{nextFollowUp.next_action || '未設定'}
                {nextFollowUp.next_contact_date ? `（${shortDate(nextFollowUp.next_contact_date)}）` : '（日付未設定）'}
              </span>
            ) : (
              <span style={{ color: C.pinkMuted }}>追いかけリストには入っていません</span>
            )}
          </div>
          {/* v0.3.31: 累計来店回数 / 累計売上 / 平均単価（Mobile版） */}
          {(() => {
            const key = String(customer.id)
            const count = badgeMeta.visitCounts[key] || 0
            const total = badgeMeta.totalSales[key] || 0
            const avg = badgeMeta.avgPerVisit[key] || 0
            if (count === 0) return null
            return (
              <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: C.dark2 }}>
                <span>来店 <b style={{ color: C.pinkDeep, fontSize: 12 }}>{count}回</b></span>
                <span>累計 <b style={{ color: C.pinkDeep, fontSize: 12 }}>¥{total.toLocaleString()}</b></span>
                <span>単価 <b style={{ color: C.pinkDeep, fontSize: 12 }}>¥{avg.toLocaleString()}</b></span>
              </div>
            )
          })()}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // PC モード：3カラム（左=フィルター / 中央=リスト / 右=詳細）
  //  - モックアップ準拠（2026-05-15 拓馬さん指示）
  //  - 上段は全幅ヘッダー、下段は3区画 flex
  // ═══════════════════════════════════════════════════════════════════
  if (isPC) {
    return (
      <div style={{ height: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
        {/* ─── 上段：全幅ヘッダー ─── */}
        <div style={{
          background: C.headerBg,
          borderBottom: `1px solid ${C.border}`,
          padding: '12px 22px',
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <Link href="/home" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }} aria-label="ホームへ">
              <Image
                src="/logo.png" alt="Éclat" width={96} height={30}
                className="object-contain"
                style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
              />
            </Link>
            <span style={{
              fontSize: 9.5, letterSpacing: '0.32em',
              color: C.pinkMuted, fontWeight: 600,
            }}>お客様一覧</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <ViewToggle />
            <NotificationBell />
            <UserChip />
          </div>
        </div>

        {/* ─── 下段：3カラム ─── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* ── 左カラム：SEARCH & FILTER + SORT （常時表示） ── */}
          <div style={{
            width: 300, flexShrink: 0,
            borderRight: `1px solid ${C.border}`,
            background: 'linear-gradient(160deg, #FFFAFC 0%, #FFFFFF 100%)',
            padding: '16px 14px 24px',
            overflowY: 'auto',
          }}>
            {/* v0.3.48-C: サーバー検索条件 (一次絞り込み) */}
            <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
              {searchPanel}
            </div>
            {/* v0.3.48-C2: 「さらに絞り込む」(結果内絞り込み) — 検索後のみ・デフォルト閉 */}
            {searched && (
            <>
            <button
              onClick={() => setRefineOpen(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', padding: 0,
              }}
            >
              <span style={{
                display: 'inline-block', width: 3, height: 12,
                background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                borderRadius: 2,
              }} />
              <span style={{
                fontSize: 10, letterSpacing: '0.22em',
                color: C.pink, fontWeight: 700,
              }}>
                表示調整
              </span>
              <span style={{ fontSize: 8.5, color: C.pinkMuted }}>(結果内)</span>
              <span style={{
                marginLeft: 'auto', fontSize: 10, color: C.pinkMuted,
                transition: 'transform 0.2s',
                transform: refineOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}>▼</span>
            </button>
            {refineOpen && (
            <>
            {searchFilters}
            {/* ソートボタン */}
            <div style={{ marginTop: 6 }}>
              <div style={{
                fontSize: 9, letterSpacing: '0.22em',
                color: C.pinkMuted, fontWeight: 600,
                marginBottom: 8, paddingLeft: 2,
              }}>
                SORT
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {([
                  { key: 'name' as const, label: '名前順' },
                  { key: 'rank' as const, label: 'ランク順' },
                  { key: 'lastVisit' as const, label: '最終連絡順' },
                  { key: 'nomination' as const, label: '指名順' },
                ]).map(s => (
                  <button
                    key={s.key}
                    onClick={() => {
                      setSortKey(s.key)
                      setSearchPage(1)
                    }}
                    style={{
                      background: sortKey === s.key
                        ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                        : 'rgba(255,255,255,0.85)',
                      color: sortKey === s.key ? C.white : C.pinkMuted,
                      border: `1px solid ${sortKey === s.key ? C.pink : C.border}`,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      padding: '6px 11px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: sortKey === s.key
                        ? '0 3px 8px rgba(232,135,154,0.28)'
                        : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            </>
            )}
            </>
            )}
          </div>

          {/* ── 中央カラム：CUSTOMERS数 + NEW + リスト ── */}
          <div style={{
            width: 360, flexShrink: 0,
            borderRight: `1px solid ${C.border}`,
            background: C.white,
            display: 'flex', flexDirection: 'column',
            minHeight: 0,
          }}>
            <div style={{
              padding: '12px 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: `1px solid ${C.border}`,
              flexShrink: 0,
              background: 'linear-gradient(135deg, #FFFAFC 0%, #FFFFFF 100%)',
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{
                  fontSize: 11, letterSpacing: '0.25em',
                  color: C.pink, margin: 0, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{
                    display: 'inline-block', width: 3, height: 12,
                    background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                    borderRadius: 2,
                  }} />
                  お客様 — {searched
                    ? searching && searchTotal === 0 ? '検索中…' : searchTotal.toLocaleString()
                    : '—'}
                </p>
                {/* v0.3.49-A: 適用中条件チップ (× で外して自動再検索) */}
                {searched && condChipsRow && (
                  <div style={{ margin: '6px 0 0 11px' }}>{condChipsRow}</div>
                )}
              </div>
              <button
                onClick={() => setShowNewCustomerForm(true)}
                style={{
                  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  color: C.white, fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.15em', padding: '7px 14px',
                  border: `1px solid ${C.pink}`, cursor: 'pointer', fontFamily: 'inherit',
                  borderRadius: 14,
                  boxShadow: '0 4px 12px rgba(232,135,154,0.28)',
                }}
              >
                + NEW
              </button>
            </div>
            <div id="customer-results-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {!searched ? (
                /* v0.3.48-C: 初期表示は検索ガイド (fetch なし) */
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: C.pinkMuted, letterSpacing: '0.1em', lineHeight: 1.9, margin: 0 }}>
                    条件を選択して検索してください<br />
                    <span style={{ fontSize: 9.5 }}>左の「検索条件」で絞り込むか「全員表示」を押してください</span>
                  </p>
                </div>
              ) : searching && filteredCustomers.length === 0 ? (
                <div style={{ padding: '54px 20px', textAlign: 'center', color: C.pinkMuted, fontSize: 10 }}>
                  お客様を検索中…
                </div>
              ) : filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => (
                  <CustomerCardPC key={customer.id} customer={customer} />
                ))
              ) : (
                /* v0.3.49-A: 0件時の次アクション導線 */
                <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: C.pinkMuted, letterSpacing: '0.08em', margin: '0 0 14px' }}>
                    該当する顧客がいませんでした
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button onClick={clearAllConditions} style={{
                      padding: '8px 14px', background: 'transparent', color: C.pinkMuted,
                      border: `1px solid ${C.border}`, borderRadius: 8,
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}>条件をクリアして選び直す</button>
                    <button onClick={showAllCustomers} style={{
                      padding: '8px 14px', background: 'transparent', color: C.pink,
                      border: `1px solid ${C.pink}`, borderRadius: 8,
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}>全員表示</button>
                  </div>
                </div>
              )}
              {paginationControls}
            </div>
          </div>

          {/* ─── 右カラム：顧客詳細 or 新規登録 ─── */}
          <div style={{ flex: 1, overflowY: 'auto', background: C.bg, minWidth: 0 }}>
          {showNewCustomerForm ? (
            <>
              <div style={{
                position: 'sticky', top: 0, zIndex: 10,
                background: C.headerBg,
                borderBottom: `1px solid ${C.border}`,
                padding: '10px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <button
                  onClick={() => setShowNewCustomerForm(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'transparent', border: 'none',
                    color: C.pink, fontSize: '13px', fontFamily: 'inherit',
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  <span style={{ fontSize: '16px' }}>←</span>
                  <span style={{ letterSpacing: '0.05em' }}>戻る</span>
                </button>
                <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: C.dark, fontWeight: 600 }}>
                  新規顧客登録
                </span>
                <div style={{ width: '60px' }} />
              </div>
              <CustomerForm
                inOverlay
                onCancel={() => setShowNewCustomerForm(false)}
                onSubmit={async (data) => {
                  const result = await addCustomer(data)
                  if (result) {
                    setShowNewCustomerForm(false)
                    if (result.id) setSelectedCustomerId(result.id)
                  }
                }}
              />
            </>
          ) : selectedCustomerId ? (
            <CustomerDetailPanel customerId={selectedCustomerId} isPC={true} isAdmin={isAdmin} />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', flexDirection: 'column', gap: '12px',
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={C.border} strokeWidth="1">
                <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
              </svg>
              <p style={{ fontSize: '10px', letterSpacing: '0.25em', color: C.pinkMuted }}>
                左の一覧から顧客を選択
              </p>
            </div>
          )}
          </div>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .eclat-input:focus {
            border-color: ${C.pink} !important;
            box-shadow: 0 0 0 2px rgba(232,120,154,0.18);
          }
          button:hover { opacity: 0.9; }
        `}</style>

        {/* v0.3.49-E: 顧客追加失敗などの通知トースト (useCustomerActions) */}
        {ToastView}
        {/* PC でも他ページに遷移できるよう BottomNav を表示（fixed なので overlay） */}
        <BottomNav />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // Mobile モード：従来のレイアウト
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: C.headerBg,
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <div style={{
          maxWidth: '420px', margin: '0 auto',
          padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ textAlign: 'left' }}>
            <Link href="/home" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} aria-label="ホームへ">
              <Image
                src="/logo.png" alt="Éclat" width={120} height={36}
                className="object-contain"
                style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
              />
            </Link>
            <p style={{ fontSize: '7px', letterSpacing: '0.35em', color: C.pinkMuted, margin: '2px 0 0 0' }}>
              お客様一覧
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ViewToggle />
            <NotificationBell />
            <UserChip />
          </div>
        </div>
      </div>


      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '12px 16px 0' }}>
        {/* v0.3.48-C: サーバー検索条件 (一次絞り込み、常時表示) */}
        <div style={{
          background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          marginBottom: 12, padding: '12px 14px',
          boxShadow: '0 4px 14px rgba(232,135,154,0.06)',
        }}>
          {searchPanel}
        </div>

        {/* v0.3.48-C2: 「さらに絞り込む」(結果内絞り込み) — 検索後のみ・デフォルト閉 */}
        {searched && (
        <div style={{
          background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          marginBottom: 12, overflow: 'hidden',
          boxShadow: '0 4px 14px rgba(232,135,154,0.06)',
        }}>
          <button
            onClick={() => setRefineOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: 'transparent', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px' }}>⚙️</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: C.dark, letterSpacing: '0.1em' }}>
                表示調整
              </span>
              {(activeFilterCount > 0) && (
                <span style={{
                  fontSize: '9px', fontWeight: 700, color: C.white,
                  background: C.pink, padding: '1px 8px', borderRadius: '10px',
                }}>{activeFilterCount}</span>
              )}
            </div>
            <span style={{
              fontSize: '10px', color: C.pinkMuted,
              transition: 'transform 0.2s',
              transform: refineOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}>▼</span>
          </button>
          <div style={{
            overflow: 'hidden',
            maxHeight: refineOpen ? '700px' : '0px',
            transition: 'max-height 0.3s ease',
          }}>
            <div style={{ padding: '4px 14px 10px' }}>
              {searchFilters}
              {/* ソートボタン（pill 型） */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  { key: 'name' as const, label: '名前順' },
                  { key: 'rank' as const, label: 'ランク順' },
                  { key: 'lastVisit' as const, label: '最終連絡順' },
                  { key: 'nomination' as const, label: '指名順' },
                ]).map(s => (
                  <button
                    key={s.key}
                    onClick={() => {
                      setSortKey(s.key)
                      setSearchPage(1)
                    }}
                    style={{
                      background: sortKey === s.key
                        ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                        : 'rgba(255,255,255,0.85)',
                      color: sortKey === s.key ? C.white : C.pinkMuted,
                      border: `1px solid ${sortKey === s.key ? C.pink : C.border}`,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      padding: '7px 13px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: sortKey === s.key
                        ? '0 3px 8px rgba(232,135,154,0.28)'
                        : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* 顧客リスト */}
        <div
          id="customer-results-heading"
          style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, scrollMarginTop: 78 }}
        >
          <span style={{
            display: 'inline-block', width: 3, height: 12,
            background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
            borderRadius: 2,
          }} />
          <p style={{ fontSize: 10, letterSpacing: '0.28em', color: C.pink, margin: 0, fontWeight: 700 }}>
            お客様 &mdash; {searched
              ? searching && searchTotal === 0 ? '検索中…' : searchTotal.toLocaleString()
              : '—'}
          </p>
        </div>
        {/* v0.3.49-A: 適用中条件チップ (× で外して自動再検索) */}
        {searched && condChipsRow && (
          <div style={{ marginBottom: 12 }}>{condChipsRow}</div>
        )}

        {!searched ? (
          /* v0.3.48-C: 初期表示は検索ガイド (fetch なし) */
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: C.pinkMuted, letterSpacing: '0.1em', lineHeight: 1.9, margin: 0 }}>
              条件を選択して検索してください<br />
              <span style={{ fontSize: 9.5 }}>上の「検索条件」で絞り込むか「全員表示」を押してください</span>
            </p>
          </div>
        ) : searching && filteredCustomers.length === 0 ? (
          <div style={{ padding: '54px 0', textAlign: 'center', color: C.pinkMuted, fontSize: 10 }}>
            お客様を検索中…
          </div>
        ) : filteredCustomers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredCustomers.map((customer) => (
              <CustomerCardMobile key={customer.id} customer={customer} />
            ))}
          </div>
        ) : (
          /* v0.3.49-A: 0件時の次アクション導線 */
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: C.pinkMuted, letterSpacing: '0.08em', margin: '0 0 14px' }}>
              該当する顧客がいませんでした
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
              <button onClick={clearAllConditions} style={{
                padding: '8px 14px', background: 'transparent', color: C.pinkMuted,
                border: `1px solid ${C.border}`, borderRadius: 8,
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>条件をクリアして選び直す</button>
              <button onClick={showAllCustomers} style={{
                padding: '8px 14px', background: 'transparent', color: C.pink,
                border: `1px solid ${C.pink}`, borderRadius: 8,
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>全員表示</button>
            </div>
            <button
              onClick={() => setShowNewCustomerForm(true)}
              style={{
                fontSize: '9px', letterSpacing: '0.2em',
                color: C.pinkMuted, border: `1px solid ${C.border}`,
                padding: '8px 20px', background: 'transparent',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              + 新規登録
            </button>
          </div>
        )}
        {paginationControls}
      </div>

      {/* ─── フローティング新規登録ボタン ─── */}
      <button
        onClick={() => setShowNewCustomerForm(true)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          zIndex: 30,
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
          color: C.white,
          border: 'none',
          boxShadow: '0 4px 16px rgba(232,120,154,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          fontWeight: 300,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        +
      </button>

      {/* v0.3.49-E: 顧客追加失敗などの通知トースト (useCustomerActions) */}
      {ToastView}
      <BottomNav />

      {/* ─── 新規顧客登録オーバーレイ（モバイル） ─── */}
      {showNewCustomerForm && (
        <>
          <div
            onClick={() => setShowNewCustomerForm(false)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.3)', zIndex: 100,
            }}
          />
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: C.bg, zIndex: 101,
            overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              background: C.headerBg,
              borderBottom: `1px solid ${C.border}`,
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button
                onClick={() => setShowNewCustomerForm(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'transparent', border: 'none',
                  color: C.pink, fontSize: '13px', fontFamily: 'inherit',
                  cursor: 'pointer', padding: 0,
                }}
              >
                <span style={{ fontSize: '16px' }}>←</span>
                <span style={{ letterSpacing: '0.05em' }}>戻る</span>
              </button>
              <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: C.dark, fontWeight: 600 }}>
                新規顧客登録
              </span>
              <div style={{ width: '60px' }} />
            </div>
            <CustomerForm
              inOverlay
              onCancel={() => setShowNewCustomerForm(false)}
              onSubmit={async (data) => {
                const result = await addCustomer(data)
                if (result) {
                  setShowNewCustomerForm(false)
                  // 作成した顧客の詳細を表示
                  if (result.id) setSelectedCustomerId(result.id)
                }
              }}
            />
          </div>
        </>
      )}

      {/* ─── 顧客詳細オーバーレイパネル（モバイル） ─── */}
      {selectedCustomerId && (
        <>
          <div
            onClick={() => setSelectedCustomerId(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.3)', zIndex: 100,
            }}
          />
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: C.bg, zIndex: 101,
            overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              background: C.headerBg,
              borderBottom: `1px solid ${C.border}`,
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button
                onClick={() => setSelectedCustomerId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'transparent', border: 'none',
                  color: C.pink, fontSize: '13px', fontFamily: 'inherit',
                  cursor: 'pointer', padding: 0,
                }}
              >
                <span style={{ fontSize: '16px' }}>←</span>
                <span style={{ letterSpacing: '0.05em' }}>一覧に戻る</span>
              </button>
            </div>
            <CustomerDetailPanel customerId={selectedCustomerId} isPC={false} isAdmin={isAdmin} />
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .eclat-input:focus {
          border-color: ${C.pink} !important;
          box-shadow: 0 0 0 2px rgba(232,120,154,0.18);
        }
        a:active { opacity: 0.85; }
      `}</style>
    </div>
  )
}

const paginationButtonStyle: React.CSSProperties = {
  minWidth: 58,
  height: 34,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  background: C.white,
  color: C.pinkDeep,
  fontFamily: 'inherit',
  fontSize: 10,
  fontWeight: 700,
  cursor: 'pointer',
}
