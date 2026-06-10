'use client'

// ─────────────────────────────────────────────────────────────────────
//  /admin/customer-staff — お客様担当リスト
//   has_customer_staff=true の顧客を一覧化（オーナー・管理者のみ）
//   表示: 名前 / 地域 / 担当キャスト / ランク / 最終来店日 / 経過日数 /
//         来店回数 / 平均単価 / 合計金額
//   デフォルト並び: 合計金額の高い順
//  v0.3.28 (2026-05-20)
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
// v0.3.43-A: クライアント認証情報は fetchMe (sessionStorage キャッシュ) に統一。
//   createClient による supabase 直叩きは削除。
import { fetchMe } from '@/lib/authCache'
import { C } from '@/lib/colors'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/ui/Spinner'
import { useViewMode } from '@/hooks/useViewMode'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'

type Row = {
  id: string
  customer_name: string | null
  region: string | null
  cast_name: string | null
  customer_rank: string | null
  lastVisit: string | null
  daysSince: number | null
  visitCount: number
  avgSpend: number
  total: number
}

type SortKey = 'total' | 'avgSpend' | 'daysSince' | 'visitCount' | 'name'

export default function CustomerStaffListPage() {
  const router = useRouter()
  // v0.3.43-A: supabase client は不要になったため削除
  const { isPC } = useViewMode()
  useScrollTopOnMount()

  const [authChecked, setAuthChecked] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('total')

  // 権限チェック（オーナー or 管理者）
  useEffect(() => {
    const check = async () => {
      // v0.3.43-A: fetchMe() で sessionStorage キャッシュ経由。
      //   is_owner 防御は維持 (owner = role='admin' + is_owner=true)
      const me = await fetchMe()
      if (!me) { router.replace('/login'); return }
      const ok = me.is_owner === true || me.role === 'admin'
      setAllowed(ok)
      setAuthChecked(true)
    }
    check()
  }, [router])

  // データ取得
  useEffect(() => {
    if (!authChecked || !allowed) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/customer-staff-list')
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = await res.json()
        if (!cancelled) setRows(Array.isArray(data.rows) ? data.rows : [])
      } catch (e) {
        console.error('[customer-staff-list]', e)
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [authChecked, allowed])

  const sortedRows = useMemo(() => {
    const arr = [...rows]
    switch (sortKey) {
      case 'total': arr.sort((a, b) => b.total - a.total); break
      case 'avgSpend': arr.sort((a, b) => b.avgSpend - a.avgSpend); break
      case 'daysSince': arr.sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1)); break
      case 'visitCount': arr.sort((a, b) => b.visitCount - a.visitCount); break
      case 'name': arr.sort((a, b) => (a.customer_name ?? '').localeCompare(b.customer_name ?? '', 'ja')); break
    }
    return arr
  }, [rows, sortKey])

  const totalSum = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows])

  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const daysColor = (d: number | null) =>
    d == null ? C.pinkMuted
    : d <= 30 ? '#3D8B5F'
    : d <= 60 ? '#C9A53A'
    : d <= 90 ? '#D67A2C'
    : '#C94A4A'
  const daysBg = (d: number | null) =>
    d == null ? 'transparent'
    : d <= 30 ? '#E4F5EC'
    : d <= 60 ? '#FCF4D9'
    : d <= 90 ? '#FCE7D3'
    : '#FBE0E0'

  // ─── ローディング/権限ガード ───
  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size="md" label="読み込み中…" />
      </div>
    )
  }
  if (!allowed) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg }}>
        <PageHeader title="お客様担当リスト" subtitle="CUSTOMER STAFF" backFallback="/admin/casts" />
        <div style={{ padding: 40, textAlign: 'center', color: C.pinkMuted, fontSize: 13 }}>
          このページはオーナー・管理者のみアクセスできます。
        </div>
      </div>
    )
  }

  const SORT_TABS: { key: SortKey; label: string }[] = [
    { key: 'total', label: '合計金額順' },
    { key: 'avgSpend', label: '平均単価順' },
    { key: 'visitCount', label: '来店回数順' },
    { key: 'daysSince', label: '経過日数順' },
    { key: 'name', label: '名前順' },
  ]

  const pill = (active: boolean): React.CSSProperties => ({
    fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
    fontFamily: 'inherit',
    border: `1px solid ${active ? C.pink : C.border}`,
    background: active ? '#FBEAF0' : '#FFF',
    color: active ? C.pink : C.pinkMuted,
  })

  const rankBadge = (rank: string | null): React.CSSProperties => ({
    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 8,
    background: rank === 'S' ? C.tagBg2 : rank === '切れた' ? '#EEE' : C.tagBg,
    color: rank === 'S' ? C.pink : C.tagText,
  })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: !isPC ? 60 : 0 }}>
      <PageHeader title="お客様担当リスト" subtitle="CUSTOMER STAFF" backFallback="/admin/casts" />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isPC ? '20px 24px' : '14px 14px' }}>
        {/* サマリー */}
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 14, fontSize: 12, color: C.dark,
        }}>
          <span style={{ fontWeight: 700, color: C.pink }}>該当 {rows.length} 名</span>
          <span style={{ color: C.pinkMuted }}>合計売上 {formatYen(totalSum)}</span>
        </div>

        {/* ソートタブ */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {SORT_TABS.map(t => (
            <button key={t.key} onClick={() => setSortKey(t.key)} style={pill(sortKey === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spinner size="md" label="お客様担当の顧客を集計中…" />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.pinkMuted, fontSize: 13 }}>
            「お客様担当」チェックが付いた顧客がいません。
          </div>
        ) : isPC ? (
          /* ═══ PC: テーブル ═══ */
          <div style={{
            background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 14,
            overflow: 'hidden', boxShadow: '0 6px 18px rgba(232,135,154,0.08)',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #FFE4ED, #FFD0DE)', color: '#B85075' }}>
                  <th style={thStyle}>お名前</th>
                  <th style={thStyle}>地域</th>
                  <th style={thStyle}>担当キャスト</th>
                  <th style={thStyle}>ランク</th>
                  <th style={thStyle}>最終来店日</th>
                  <th style={thStyle}>経過日数</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>来店回数</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>平均単価</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>合計金額</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? '#FFF' : '#FFFAFC', borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: C.dark }}>{r.customer_name || '—'}</td>
                    <td style={tdStyle}>{r.region || '—'}</td>
                    <td style={tdStyle}>{r.cast_name || '—'}</td>
                    <td style={tdStyle}>
                      {r.customer_rank ? <span style={rankBadge(r.customer_rank)}>{r.customer_rank}</span> : '—'}
                    </td>
                    <td style={tdStyle}>{r.lastVisit || '—'}</td>
                    <td style={tdStyle}>
                      {r.daysSince != null ? (
                        <span style={{
                          fontWeight: 600, color: daysColor(r.daysSince), background: daysBg(r.daysSince),
                          padding: '2px 8px', borderRadius: 8,
                        }}>{r.daysSince}日前</span>
                      ) : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.visitCount}回</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgSpend > 0 ? formatYen(r.avgSpend) : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.pink }}>{formatYen(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ═══ Mobile: カード ═══ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedRows.map(r => (
              <div key={r.id} style={{
                background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{r.customer_name || '—'}</span>
                  {r.customer_rank && <span style={rankBadge(r.customer_rank)}>{r.customer_rank}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 700, color: C.pink }}>{formatYen(r.total)}</span>
                </div>
                <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 8 }}>
                  {r.region || '地域未設定'} ・ 担当 {r.cast_name || '—'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10 }}>
                  <span style={{ color: C.pinkMuted }}>最終来店 {r.lastVisit || '—'}</span>
                  {r.daysSince != null && (
                    <span style={{
                      fontWeight: 600, color: daysColor(r.daysSince), background: daysBg(r.daysSince),
                      padding: '2px 8px', borderRadius: 8,
                    }}>{r.daysSince}日前</span>
                  )}
                  <span style={{ color: C.dark2 }}>{r.visitCount}回</span>
                  {r.avgSpend > 0 && <span style={{ color: C.dark2 }}>平均 {formatYen(r.avgSpend)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontWeight: 700,
  fontSize: 11, letterSpacing: '0.05em', whiteSpace: 'nowrap',
  borderBottom: '1px solid #FFD0DE',
}
const tdStyle: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}
