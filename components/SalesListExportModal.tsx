'use client'

import { useEffect, useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import type { Customer, CustomerVisit } from '@/types'
import { REGIONS } from '@/types'
import { useCustomers } from '@/hooks/useCustomers'
import { exportSalesList } from '@/lib/excelExport'

// ─── プリセット定義 ────────────────────────────────────────────
export type PresetKey =
  | 'birthdayThisMonth'
  | 'birthdayNextMonth'
  | 'inactive90'
  | 'inactive60'
  | 'rankS'
  | 'rankAOrAbove'
  | 'douhanExperienced'
  | 'totalOver500k'

const PRESETS: { key: PresetKey; label: string; describe: string }[] = [
  { key: 'birthdayThisMonth', label: '今月誕生日', describe: '今月が誕生月の顧客' },
  { key: 'birthdayNextMonth', label: '来月誕生日', describe: '来月が誕生月の顧客' },
  { key: 'inactive90', label: '90日以上未来店', describe: '最終来店から 90 日以上経過' },
  { key: 'inactive60', label: '60日以上未来店', describe: '最終来店から 60 日以上経過' },
  { key: 'rankS', label: 'VIP（Sランク）', describe: 'S ランクのみ' },
  { key: 'rankAOrAbove', label: 'A ランク以上', describe: 'S または A ランク' },
  { key: 'douhanExperienced', label: '同伴経験あり', describe: '同伴の来店履歴あり' },
  { key: 'totalOver500k', label: '累計 50 万円以上', describe: '累計売上が 50 万円以上' },
]

interface Props {
  open: boolean
  onClose: () => void
  customers: Customer[]
  // 担当キャスト名（ファイル名やフィルタリングに使用）
  castName?: string
  // 初期選択プリセット（バナーから開く場合に使用）
  initialPreset?: PresetKey | null
}

export default function SalesListExportModal({
  open,
  onClose,
  customers,
  castName,
  initialPreset = null,
}: Props) {
  const { getBulkVisits } = useCustomers()
  const [activePreset, setActivePreset] = useState<PresetKey | null>(initialPreset)
  const [filterRank, setFilterRank] = useState('')
  const [filterPhase, setFilterPhase] = useState('')
  const [filterRegion, setFilterRegion] = useState('')
  const [filterMinTotal, setFilterMinTotal] = useState('')
  const [filterDaysSinceLast, setFilterDaysSinceLast] = useState('')
  const [filterBirthMonth, setFilterBirthMonth] = useState('')
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [visitsByCustomer, setVisitsByCustomer] = useState<Record<string, CustomerVisit[]>>({})
  const [loadingVisits, setLoadingVisits] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 来店履歴を顧客全員分取得（モーダルが開いた時に 1 回だけ）
  useEffect(() => {
    if (!open) return
    if (customers.length === 0) return
    let cancelled = false
    setLoadingVisits(true)
    ;(async () => {
      const ids = customers.map((c) => c.id)
      const data = await getBulkVisits(ids)
      if (!cancelled) {
        setVisitsByCustomer(data)
        setLoadingVisits(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customers.length])

  // initialPreset が変わったら反映
  useEffect(() => {
    setActivePreset(initialPreset)
  }, [initialPreset])

  // 開いた瞬間に除外をリセット
  useEffect(() => {
    if (open) setExcludedIds(new Set())
  }, [open])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const thisMonth = today.getMonth() + 1
  const nextMonth = ((today.getMonth() + 1) % 12) + 1

  // フィルタリング
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // プリセット適用
      if (activePreset === 'birthdayThisMonth') {
        if (!c.birthday) return false
        const m = parseInt(c.birthday.split('-')[1] || '0', 10)
        if (m !== thisMonth) return false
      }
      if (activePreset === 'birthdayNextMonth') {
        if (!c.birthday) return false
        const m = parseInt(c.birthday.split('-')[1] || '0', 10)
        if (m !== nextMonth) return false
      }
      if (activePreset === 'inactive90' || activePreset === 'inactive60') {
        const visits = visitsByCustomer[c.id] ?? []
        if (visits.length === 0) return true // 一度も来てない → 該当
        const sorted = [...visits].sort((a, b) => (a.visit_date < b.visit_date ? 1 : -1))
        const last = new Date(sorted[0].visit_date)
        const days = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
        const threshold = activePreset === 'inactive90' ? 90 : 60
        if (days < threshold) return false
      }
      if (activePreset === 'rankS' && c.customer_rank !== 'S') return false
      if (activePreset === 'rankAOrAbove' && !(c.customer_rank === 'S' || c.customer_rank === 'A')) return false
      if (activePreset === 'douhanExperienced') {
        const visits = visitsByCustomer[c.id] ?? []
        if (!visits.some((v) => v.has_douhan)) return false
      }
      if (activePreset === 'totalOver500k') {
        const visits = visitsByCustomer[c.id] ?? []
        const total = visits.reduce((acc, v) => acc + Number(v.amount_spent || 0), 0)
        if (total < 500000) return false
      }

      // 詳細フィルタ
      if (filterRank && c.customer_rank !== filterRank) return false
      if (filterPhase && c.phase !== filterPhase) return false
      if (filterRegion && c.region !== filterRegion) return false
      if (filterBirthMonth) {
        if (!c.birthday) return false
        const m = parseInt(c.birthday.split('-')[1] || '0', 10)
        if (m !== Number(filterBirthMonth)) return false
      }
      if (filterMinTotal) {
        const visits = visitsByCustomer[c.id] ?? []
        const total = visits.reduce((acc, v) => acc + Number(v.amount_spent || 0), 0)
        if (total < Number(filterMinTotal)) return false
      }
      if (filterDaysSinceLast) {
        const visits = visitsByCustomer[c.id] ?? []
        if (visits.length === 0) return true
        const sorted = [...visits].sort((a, b) => (a.visit_date < b.visit_date ? 1 : -1))
        const last = new Date(sorted[0].visit_date)
        const days = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
        if (days < Number(filterDaysSinceLast)) return false
      }

      return true
    })
  }, [
    customers,
    activePreset,
    visitsByCustomer,
    filterRank,
    filterPhase,
    filterRegion,
    filterBirthMonth,
    filterMinTotal,
    filterDaysSinceLast,
    today,
    thisMonth,
    nextMonth,
  ])

  const selectedCustomers = useMemo(
    () => filteredCustomers.filter((c) => !excludedIds.has(c.id)),
    [filteredCustomers, excludedIds]
  )

  const totalSelectedSales = useMemo(() => {
    return selectedCustomers.reduce((acc, c) => {
      const visits = visitsByCustomer[c.id] ?? []
      return acc + visits.reduce((a, v) => a + Number(v.amount_spent || 0), 0)
    }, 0)
  }, [selectedCustomers, visitsByCustomer])

  const toggleExcluded = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setExcludedIds(new Set())
  const deselectAll = () => setExcludedIds(new Set(filteredCustomers.map((c) => c.id)))

  const handleExport = async () => {
    if (selectedCustomers.length === 0) {
      alert('対象顧客が 0 名です。条件を変更してください。')
      return
    }
    setExporting(true)
    try {
      const presetLabel = activePreset
        ? PRESETS.find((p) => p.key === activePreset)?.label ?? '営業リスト'
        : '営業リスト'

      // フィルター詳細を文字列化
      const descParts: string[] = []
      if (activePreset) descParts.push(PRESETS.find((p) => p.key === activePreset)?.describe ?? '')
      if (filterRank) descParts.push(`ランク=${filterRank}`)
      if (filterPhase) descParts.push(`フェーズ=${filterPhase}`)
      if (filterRegion) descParts.push(`地域=${filterRegion}`)
      if (filterBirthMonth) descParts.push(`誕生月=${filterBirthMonth}月`)
      if (filterMinTotal) descParts.push(`累計≥${Number(filterMinTotal).toLocaleString()}円`)
      if (filterDaysSinceLast) descParts.push(`最終来店から≥${filterDaysSinceLast}日`)
      const filterDescription = descParts.length > 0 ? descParts.join(' / ') : '全顧客'

      await exportSalesList({
        title: presetLabel,
        filterDescription,
        customers: selectedCustomers,
        visitsByCustomer,
        castName,
      })
    } catch (err) {
      console.error('exportSalesList error:', err)
      alert('エクセル出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  if (!open) return null

  // ─── スタイル ────────────────────────────────────────────────
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  }
  const modalStyle: React.CSSProperties = {
    background: C.white,
    width: '100%',
    maxWidth: '720px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
  }
  const headerStyle: React.CSSProperties = {
    padding: '14px 18px',
    borderBottom: `1px solid ${C.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: C.headerBg,
  }
  const sectionStyle: React.CSSProperties = {
    padding: '12px 18px',
    borderBottom: `1px solid ${C.border}`,
  }
  const sectionLabel: React.CSSProperties = {
    fontSize: '9px',
    letterSpacing: '0.3em',
    color: C.pink,
    fontWeight: 500,
    margin: 0,
    marginBottom: '8px',
  }
  const presetBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: `1px solid ${active ? C.pink : C.border}`,
    background: active ? '#FBEAF0' : C.white,
    color: active ? C.pink : C.dark2,
    fontWeight: active ? 600 : 400,
  })
  const selectStyle: React.CSSProperties = {
    width: '100%',
    background: C.white,
    border: `1px solid ${C.border}`,
    padding: '6px 8px',
    fontSize: '11px',
    color: C.dark,
    outline: 'none',
    fontFamily: 'inherit',
    borderRadius: '6px',
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: C.dark }}>営業リスト出力</div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: C.pinkMuted,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* プリセット */}
          <div style={sectionStyle}>
            <p style={sectionLabel}>PRESETS</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setActivePreset(activePreset === p.key ? null : p.key)}
                  style={presetBtn(activePreset === p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 詳細フィルター */}
          <div style={sectionStyle}>
            <p style={sectionLabel}>DETAILED FILTERS</p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '9px', color: C.pinkMuted, marginBottom: '3px' }}>
                  誕生月
                </div>
                <select
                  value={filterBirthMonth}
                  onChange={(e) => setFilterBirthMonth(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">指定なし</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={String(m)}>
                      {m}月
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: C.pinkMuted, marginBottom: '3px' }}>
                  ランク
                </div>
                <select
                  value={filterRank}
                  onChange={(e) => setFilterRank(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">指定なし</option>
                  <option value="S">S</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: C.pinkMuted, marginBottom: '3px' }}>
                  最終来店から日数
                </div>
                <select
                  value={filterDaysSinceLast}
                  onChange={(e) => setFilterDaysSinceLast(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">指定なし</option>
                  <option value="30">30日以上</option>
                  <option value="60">60日以上</option>
                  <option value="90">90日以上</option>
                  <option value="180">180日以上</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: C.pinkMuted, marginBottom: '3px' }}>
                  累計売上
                </div>
                <select
                  value={filterMinTotal}
                  onChange={(e) => setFilterMinTotal(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">指定なし</option>
                  <option value="100000">10万円以上</option>
                  <option value="300000">30万円以上</option>
                  <option value="500000">50万円以上</option>
                  <option value="1000000">100万円以上</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: C.pinkMuted, marginBottom: '3px' }}>
                  フェーズ
                </div>
                <select
                  value={filterPhase}
                  onChange={(e) => setFilterPhase(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">指定なし</option>
                  {['認知', '場内', '初指名', 'リピート', '安定', '来店操作可能'].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: C.pinkMuted, marginBottom: '3px' }}>
                  地域
                </div>
                <select
                  value={filterRegion}
                  onChange={(e) => setFilterRegion(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">指定なし</option>
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 対象顧客リスト */}
          <div
            style={{
              padding: '10px 18px',
              background: '#F9F6F7',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: C.dark2,
            }}
          >
            <span>
              該当 <span style={{ color: C.pink, fontWeight: 600 }}>{filteredCustomers.length} 名</span> /
              選択中{' '}
              <span style={{ color: C.pink, fontWeight: 600 }}>{selectedCustomers.length} 名</span> /
              累計売上{' '}
              <span style={{ color: C.pink, fontWeight: 600 }}>
                {totalSelectedSales.toLocaleString()} 円
              </span>
            </span>
            <span style={{ fontSize: '10px', color: C.pinkMuted }}>
              <button
                onClick={selectAll}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: C.pink,
                  cursor: 'pointer',
                  fontSize: '10px',
                  padding: '2px 6px',
                  fontFamily: 'inherit',
                }}
              >
                全選択
              </button>
              /
              <button
                onClick={deselectAll}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: C.pink,
                  cursor: 'pointer',
                  fontSize: '10px',
                  padding: '2px 6px',
                  fontFamily: 'inherit',
                }}
              >
                全解除
              </button>
            </span>
          </div>

          <div>
            {loadingVisits ? (
              <div style={{ padding: '24px', textAlign: 'center', color: C.pinkMuted }}>
                来店履歴を取得中…
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: C.pinkMuted }}>
                該当する顧客がいません
              </div>
            ) : (
              filteredCustomers.map((c) => {
                const visits = visitsByCustomer[c.id] ?? []
                const total = visits.reduce((acc, v) => acc + Number(v.amount_spent || 0), 0)
                const lastVisit = visits[0]?.visit_date || ''
                const isExcluded = excludedIds.has(c.id)
                return (
                  <label
                    key={c.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 1fr 80px 100px',
                      gap: '10px',
                      alignItems: 'center',
                      padding: '8px 18px',
                      borderBottom: `1px solid ${C.border}`,
                      cursor: 'pointer',
                      opacity: isExcluded ? 0.4 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={() => toggleExcluded(c.id)}
                      style={{ accentColor: C.pink }}
                    />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: C.dark }}>
                        {c.customer_name}
                        {c.customer_rank && (
                          <span
                            style={{
                              marginLeft: '6px',
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '20px',
                              background: c.customer_rank === 'S' ? '#FBEAF0' : C.tagBg,
                              color: c.customer_rank === 'S' ? C.pink : C.tagText,
                            }}
                          >
                            {c.customer_rank}
                          </span>
                        )}
                        {c.birthday && (
                          <span
                            style={{
                              marginLeft: '4px',
                              fontSize: '10px',
                              color: C.pinkMuted,
                            }}
                          >
                            🎂 {c.birthday.slice(5).replace('-', '/')}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: C.pinkMuted, marginTop: '2px' }}>
                        最終来店: {lastVisit || '—'} / {visits.length} 回
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: C.dark2, textAlign: 'right' }}>
                      {visits.length} 回
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: C.pink,
                        textAlign: 'right',
                        fontWeight: 500,
                      }}
                    >
                      {total.toLocaleString()} 円
                    </div>
                  </label>
                )
              })
            )}
          </div>
        </div>

        {/* フッター */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: C.white,
          }}
        >
          <span style={{ fontSize: '11px', color: C.pinkMuted }}>
            {selectedCustomers.length} 名選択中
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 14px',
                background: C.white,
                color: C.dark2,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              キャンセル
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || loadingVisits || selectedCustomers.length === 0}
              style={{
                padding: '8px 16px',
                background:
                  exporting || loadingVisits || selectedCustomers.length === 0
                    ? C.pinkMuted
                    : `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                color: C.white,
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor:
                  exporting || loadingVisits || selectedCustomers.length === 0
                    ? 'not-allowed'
                    : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {exporting ? '出力中…' : `エクセルで出力 (${selectedCustomers.length} 名)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
