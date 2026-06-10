'use client'

// キャスト用ホームダッシュボード
// 出勤時にホーム画面の上部で「今日の自分」を一目で把握できる。
//   - 月次売上 / 達成率 / 場内→本指名転換数
//   - 今日の出勤キャスト（一覧）
//   - 営業要連絡のお客様 top 5（タップで顧客詳細へ）
// 折りたたみ可能。
import { useEffect, useMemo, useState } from 'react'
import { useCasts } from '@/hooks/useCasts'
import { C } from '@/lib/colors'
import type { Customer, CastKPI } from '@/types'
import { detectBadgesForMonth } from '@/lib/badges'
import { BadgeCard } from './BadgeDisplay'

type Props = {
  castName: string
  castId: string
  customers: Customer[]
  onCustomerClick?: (customerId: string) => void
}

export default function CastHomeDashboard({ castName, castId, customers, onCustomerClick }: Props) {
  const { getCastKPI, getCastTarget } = useCasts()

  // 今日 / 今月
  const { today, month, todayDow } = useMemo(() => {
    const d = new Date()
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const today = `${month}-${String(d.getDate()).padStart(2, '0')}`
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
    return { today, month, todayDow: dow }
  }, [])

  const [kpi, setKpi] = useState<CastKPI | null>(null)
  const [target, setTarget] = useState<number>(0)
  const [todayShifts, setTodayShifts] = useState<{ id: string; name: string; tier: string | null }[]>([])
  const [collapsed, setCollapsed] = useState<boolean>(false)
  const [castTier, setCastTier] = useState<string | null>(null)
  const [rankInMonth, setRankInMonth] = useState<number | undefined>(undefined)
  const [prevMonths, setPrevMonths] = useState<Array<{ kpi: CastKPI; targetSales: number }>>([])

  // ⚡ パフォーマンス対策:
  //   旧: 3つの useEffect で順次にプロフィール取得 → ランキング取得 → 過去5ヶ月ループ取得
  //       (5ヶ月の getCastKPI+getCastTarget が serial に並ぶので 5×往復 で重い)
  //   新: 1つの useEffect で /api/cast/home-dashboard (補助データ集約) と
  //       6ヶ月分の getCastKPI/getCastTarget を Promise.all で全部並列実行
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        // 過去5ヶ月のキー
        const baseDate = new Date(month + '-01')
        const prevMonthsKeys: string[] = []
        for (let i = 1; i <= 5; i++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1)
          prevMonthsKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }

        const params = new URLSearchParams({ castId, month, today })
        const [
          auxRes,
          rankRes,
          curKpi,
          curTarget,
          ...prevKpis
        ] = await Promise.all([
          // 補助データ集約 API（プロフィール + 今日のシフト + 過去5ヶ月の目標）
          fetch(`/api/cast/home-dashboard?${params.toString()}`).then(r => r.ok ? r.json() : null).catch(() => null),
          // 月間順位
          fetch(`/api/cast-rankings?month=${month}`).then(r => r.ok ? r.json() : null).catch(() => null),
          // 今月の自分の KPI
          getCastKPI(castName, month, castId),
          // 今月の自分の目標
          getCastTarget(castId, month),
          // 過去5ヶ月の KPI を並列取得
          ...prevMonthsKeys.map(m => getCastKPI(castName, m, castId).catch(() => null)),
        ])

        if (!alive) return

        // 今月の KPI / 目標
        setKpi(curKpi)
        setTarget(curTarget?.target_sales ?? 0)

        // 補助データ
        if (auxRes) {
          setCastTier(auxRes.castTier ?? null)
          setTodayShifts(auxRes.todayShifts ?? [])

          // 過去5ヶ月の達成判定用 (KPI と target を組み合わせ)
          const targetsMap: Record<string, number> = {}
          for (const t of (auxRes.prevTargets ?? []) as Array<{ month: string; target_sales: number }>) {
            targetsMap[t.month] = t.target_sales
          }
          const prevList: Array<{ kpi: CastKPI; targetSales: number }> = []
          prevMonthsKeys.forEach((m, i) => {
            const k = prevKpis[i] as CastKPI | null
            if (k) prevList.push({ kpi: k, targetSales: targetsMap[m] ?? 0 })
          })
          setPrevMonths(prevList)
        }

        // 月間順位
        if (rankRes && Array.isArray(rankRes)) {
          const sorted = [...rankRes as Array<{ cast: { id: string }; kpi: { monthlySales: number } }>]
            .sort((a, b) => b.kpi.monthlySales - a.kpi.monthlySales)
          const idx = sorted.findIndex(r => r.cast.id === castId)
          if (idx >= 0) setRankInMonth(idx + 1)
        }
      } catch (e) {
        console.error('CastHomeDashboard load error', e)
      }
    }
    load()
    return () => { alive = false }
  }, [castId, castName, month, today, getCastKPI, getCastTarget])

  // バッジ判定
  const badges = useMemo(() => {
    if (!kpi) return []
    return detectBadgesForMonth({
      kpi, targetSales: target, rankInMonth, castTier, prevMonths,
    })
  }, [kpi, target, rankInMonth, castTier, prevMonths])

  // 営業要連絡 top 5: 自分の担当顧客で最終連絡からの経過が長い順
  const top5 = useMemo(() => {
    const my = customers.filter(c => c.cast_name === castName)
    const now = Date.now()
    const dayMs = 1000 * 60 * 60 * 24
    return my
      .map(c => {
        const last = c.last_contact_date ? new Date(c.last_contact_date).getTime() : 0
        const days = last > 0 ? Math.floor((now - last) / dayMs) : 999
        // ランクボーナス: S=高 / A / B
        const rank = c.customer_rank
        const rankBonus = rank === 'S' ? 30 : rank === 'A' ? 20 : rank === 'B' ? 10 : 0
        return { c, days, score: days + rankBonus }
      })
      .filter(x => x.days >= 3) // 3日未満は要連絡対象外
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [customers, castName])

  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const monthlySales = kpi?.monthlySales ?? 0
  const targetSales = target
  const achievementRate = targetSales > 0
    ? Math.min(200, Math.round((monthlySales / targetSales) * 100))
    : 0
  const progressPct = targetSales > 0
    ? Math.min(100, (monthlySales / targetSales) * 100)
    : 0
  const conversionCount = kpi?.conversionCount ?? 0

  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      marginBottom: '12px',
      overflow: 'hidden',
    }}>
      {/* ヘッダー（タップで折りたたみ） */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          // 「ふんわりベビーピンク」テーマに合わせて、淡いピンクのグラデにする
          background: `linear-gradient(135deg, #FFF0F5 0%, #FFE4ED 60%, #FFD7E4 100%)`,
          borderBottom: `1px solid ${C.border}`,
          border: 'none',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{
            display: 'inline-block',
            fontSize: '8px', letterSpacing: '0.25em', color: C.pink,
            background: 'rgba(255,255,255,0.55)', padding: '2px 8px',
            borderRadius: '10px', fontWeight: 700,
          }}>
            TODAY · {today}（{todayDow}）
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: C.dark, marginTop: '6px', letterSpacing: '0.05em' }}>
            {castName} さん、今日もよろしくお願いします
          </div>
        </div>
        <span style={{
          fontSize: '12px', color: C.pink, fontWeight: 700,
          background: '#FFF', padding: '4px 8px', borderRadius: '50%',
          width: '24px', height: '24px', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(232,120,154,0.2)',
        }}>{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 🏆 バッジ */}
          <BadgeCard badges={badges} isPC={false} />

          {/* 月次達成率 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <span style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted }}>今月の売上</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: C.pink }}>
                {formatYen(monthlySales)}
                {targetSales > 0 && (
                  <span style={{ fontSize: '9px', color: C.pinkMuted, marginLeft: '6px' }}>
                    / 目標 {formatYen(targetSales)}（{achievementRate}%）
                  </span>
                )}
              </span>
            </div>
            <div style={{
              height: '8px', background: C.rankBadge, borderRadius: '4px', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${progressPct}%`,
                background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight ?? '#F4A5B8'})`,
                transition: 'width .3s ease',
              }} />
            </div>
          </div>

          {/* 主要指標 3つ並び */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <MiniStat label="達成率" value={`${achievementRate}%`} color={C.pink} />
            <MiniStat label="本指名" value={`${kpi?.honshimeiCount ?? 0}人`} color="#B25575" />
            <MiniStat label="場内→本" value={`${conversionCount}件`} color="#0F6E56" />
          </div>

          {/* 今日の出勤キャスト */}
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, marginBottom: '6px' }}>
              今日の出勤 — {todayShifts.length}名
            </div>
            {todayShifts.length === 0 ? (
              <div style={{ fontSize: '11px', color: C.pinkMuted }}>出勤予定のキャストがいません</div>
            ) : (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {todayShifts.map(s => {
                  const isMe = s.id === castId
                  return (
                    <span
                      key={s.id}
                      style={{
                        fontSize: '11px',
                        padding: '4px 10px',
                        background: isMe ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight ?? '#F4A5B8'})` : C.tagBg,
                        color: isMe ? '#FFF' : C.tagText,
                        border: `1px solid ${isMe ? C.pink : C.border}`,
                        fontWeight: isMe ? 600 : 400,
                        borderRadius: '12px',
                      }}
                    >
                      {s.name}{isMe ? ' (自分)' : ''}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* 営業要連絡 TOP 5 */}
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, marginBottom: '6px' }}>
              営業要連絡 TOP 5
            </div>
            {top5.length === 0 ? (
              <div style={{ fontSize: '11px', color: C.pinkMuted }}>
                直近3日以内に全員と連絡できています
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {top5.map(({ c, days }) => (
                  <button
                    key={c.id}
                    onClick={() => onCustomerClick?.(c.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 10px',
                      background: C.bgLight, border: `1px solid ${C.border}`,
                      borderRadius: '6px',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 600, color: C.dark,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{c.customer_name}</span>
                      {c.customer_rank && (
                        <span style={{
                          fontSize: '9px', fontWeight: 600,
                          color: C.pink, padding: '1px 6px',
                          background: '#FFF', border: `1px solid ${C.pink}`,
                          borderRadius: '8px',
                        }}>{c.customer_rank}</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: '10px', color: days >= 7 ? '#C04060' : C.pinkMuted, fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      {days >= 999 ? '連絡なし' : `${days}日連絡なし`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: C.miniBg,
      borderRadius: '8px',
      padding: '8px 10px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '8px', color: C.pinkMuted, letterSpacing: '0.15em' }}>{label}</div>
      <div style={{ fontSize: '15px', fontWeight: 700, color, marginTop: '2px' }}>{value}</div>
    </div>
  )
}
