'use client'
// ─────────────────────────────────────────────────────────────────
//  /admin/cast-evaluation — キャスト評価ページ
//   全キャストの評価点・強化点・主要順位を一覧表示
//   権限: is_owner または「KPI.詳細分析」
// ─────────────────────────────────────────────────────────────────

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'
import BottomNav from '@/components/BottomNav'
import { getCache, setCache } from '@/lib/cache'
import { CAST_TIERS } from '@/types'
import {
  evaluateAllCasts,
  type CastRow,
  type CastEvaluation,
  type EvalSeverity,
} from '@/lib/castEvaluation'

type SortKey = 'achievement' | 'sales' | 'needFollow'

export default function CastEvaluationPage() {
  return (
    <Suspense fallback={<Center>読み込み中...</Center>}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const { isPC } = useViewMode()

  // ─── 認証 ──────────────────────────────────────────
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/auth/me')
        if (!r.ok) { setAuthorized(false); return }
        const me = await r.json()
        setAuthorized(me.is_owner === true || me.permissions?.['KPI.詳細分析'] === true)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])
  useEffect(() => {
    if (authorized === false) {
      const t = setTimeout(() => router.push('/'), 1500)
      return () => clearTimeout(t)
    }
  }, [authorized, router])

  // ─── データ取得 ────────────────────────────────────
  const [month, setMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [rows, setRows] = useState<CastRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = async (m: string) => {
    setLoadError(null)
    const cacheKey = `cast-evaluation:${m}`
    const cached = getCache<CastRow[]>(cacheKey)
    if (cached) setRows(cached)
    else setRows(null)
    try {
      const res = await fetch(`/api/admin/cast-evaluation?month=${m}`)
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        if (!cached) setLoadError(`データ取得失敗: ${res.status} ${t}`)
        return
      }
      const json = await res.json() as CastRow[]
      setRows(json)
      setCache(cacheKey, json)
    } catch (e) {
      if (!cached) setLoadError((e as Error).message)
    }
  }
  useEffect(() => {
    if (authorized) load(month)
  }, [authorized, month])

  // ─── 評価計算 ─────────────────────────────────────
  const evaluations = useMemo(() => {
    if (!rows) return new Map<string, CastEvaluation>()
    return evaluateAllCasts(rows)
  }, [rows])

  // ─── フィルター + ソート ──────────────────────────
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('achievement')

  const visibleRows = useMemo(() => {
    if (!rows) return []
    let out = [...rows]
    if (tierFilter !== 'all') out = out.filter(r => r.tier === tierFilter)
    if (sortKey === 'achievement') {
      out.sort((a, b) => b.achievementRate - a.achievementRate)
    } else if (sortKey === 'sales') {
      out.sort((a, b) => b.monthlySales - a.monthlySales)
    } else if (sortKey === 'needFollow') {
      out.sort((a, b) => {
        const ai = evaluations.get(a.castId)?.improvements.length ?? 0
        const bi = evaluations.get(b.castId)?.improvements.length ?? 0
        // 強化点多い + severity 'high' を優先
        const aHigh = evaluations.get(a.castId)?.improvements.filter(x => x.severity === 'high').length ?? 0
        const bHigh = evaluations.get(b.castId)?.improvements.filter(x => x.severity === 'high').length ?? 0
        if (bHigh !== aHigh) return bHigh - aHigh
        return bi - ai
      })
    }
    return out
  }, [rows, tierFilter, sortKey, evaluations])

  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-'); return `${y}年${Number(m)}月`
  }, [month])

  if (authorized === null) return <Center>確認中...</Center>
  if (!authorized) return <Center>このページには「KPI.詳細分析」権限が必要です。ホームへ戻ります...</Center>

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      paddingBottom: !isPC ? 'calc(60px + env(safe-area-inset-bottom, 0px))' : 0,
    }}>
      {/* ヘッダー */}
      <div style={{
        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: isPC ? '1100px' : '700px', margin: '0 auto',
          padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <button onClick={() => router.push('/admin/casts')} style={{
            background: 'transparent', border: 'none', color: C.pink,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
          }}>← 管理</button>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: C.dark, margin: 0 }}>
            📊 キャスト評価
          </h1>
          <span style={{ fontSize: 9, color: C.pinkMuted, letterSpacing: '0.1em' }}>
            CAST EVALUATION
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => changeMonth(-1)} style={{
              background: 'transparent', border: 'none', fontSize: 16, color: C.pink,
              cursor: 'pointer', padding: 4, fontFamily: 'inherit',
            }}>‹</button>
            <span style={{
              fontSize: 12, color: C.dark, letterSpacing: '0.05em',
              fontWeight: 600, minWidth: 86, textAlign: 'center',
            }}>{monthLabel}</span>
            <button onClick={() => changeMonth(1)} style={{
              background: 'transparent', border: 'none', fontSize: 16, color: C.pink,
              cursor: 'pointer', padding: 4, fontFamily: 'inherit',
            }}>›</button>
          </div>
        </div>
        {/* PageNav は BottomNav と機能重複のため 2026-05-15 撤去 */}
      </div>

      <div style={{
        maxWidth: isPC ? '1100px' : '700px', margin: '0 auto',
        padding: isPC ? '14px 18px' : '10px 12px',
      }}>
        {/* フィルター/ソート */}
        <div style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '10px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11,
        }}>
          <span style={{ color: C.pinkMuted }}>層:</span>
          <button
            onClick={() => setTierFilter('all')}
            style={chipStyle(tierFilter === 'all')}
          >全 {rows?.length ?? 0}名</button>
          {CAST_TIERS.map(t => {
            const count = (rows ?? []).filter(r => r.tier === t).length
            if (count === 0) return null
            return (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                style={chipStyle(tierFilter === t)}
              >{t} {count}名</button>
            )
          })}
          <span style={{ color: C.pinkMuted, marginLeft: 8 }}>並び:</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            style={{
              fontSize: 11, padding: '4px 8px',
              border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'inherit', background: '#FFF',
            }}
          >
            <option value="achievement">達成率 高い順</option>
            <option value="sales">売上 高い順</option>
            <option value="needFollow">強化点 多い順 (要フォロー)</option>
          </select>
        </div>

        {/* 本体 */}
        {loadError ? (
          <Center>{loadError}</Center>
        ) : !rows ? (
          <Center>キャスト評価データを集計中...</Center>
        ) : visibleRows.length === 0 ? (
          <Center>該当キャストがいません</Center>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleRows.map(r => {
              const ev = evaluations.get(r.castId)
              if (!ev) return null
              return <CastCard key={r.castId} row={r} ev={ev} isPC={isPC} />
            })}
          </div>
        )}
      </div>

      {!isPC && <BottomNav />}
    </div>
  )
}

// ─── キャスト 1 人のカード ───────────────────────────────
function CastCard({ row: r, ev, isPC }: { row: CastRow; ev: CastEvaluation; isPC: boolean }) {
  const isTopThree = ev.overallRank <= 3
  const isWorst = ev.improvements.filter(i => i.severity === 'high').length >= 2

  const ribbonGradient =
    ev.overallRank === 1 ? 'linear-gradient(135deg, #D4A017, #F5C842)' :
    ev.overallRank === 2 ? 'linear-gradient(135deg, #B8B8B8, #DCDCDC)' :
    ev.overallRank === 3 ? 'linear-gradient(135deg, #C28C5C, #DBA877)' :
    isWorst ? 'linear-gradient(135deg, #A32D2D, #E24B4A)' :
    `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
  const ribbonEmoji =
    ev.overallRank === 1 ? '🥇' :
    ev.overallRank === 2 ? '🥈' :
    ev.overallRank === 3 ? '🥉' :
    isWorst ? '📉' : '・'

  const cardBorder = isWorst ? '#F09595' : C.border

  return (
    <Link
      href={`/casts/${r.castId}`}
      prefetch={false}
      style={{
        display: 'block', textDecoration: 'none', color: 'inherit',
        background: C.white, border: `1px solid ${cardBorder}`,
        borderRadius: 12, padding: '14px 16px', position: 'relative', overflow: 'hidden',
      }}
    >
      {/* リボン */}
      <div style={{
        position: 'absolute', top: 12, left: -6,
        background: ribbonGradient, color: '#FFF',
        padding: '3px 12px 3px 16px',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
      }}>
        {ribbonEmoji} 総合 {ev.overallRank} 位
      </div>

      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        margin: '24px 0 12px', paddingBottom: 10,
        borderBottom: `1px dashed ${C.border}`, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFE8EE, #FFF2F5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, color: C.pink, fontWeight: 500,
        }}>{(r.castName ?? '?').charAt(0)}</div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.dark }}>
            {r.castName ?? '(無名)'}
          </div>
          <div style={{ display: 'flex', gap: 6, fontSize: 9, marginTop: 2, color: C.pinkMuted, flexWrap: 'wrap' }}>
            <span style={{ padding: '1px 6px', background: '#FBEAF0', color: '#72243E', borderRadius: 3 }}>
              {r.tier ?? '層未設定'}
            </span>
            {r.targetWorkDays > 0 && (
              <span>出勤 {r.workDays}/{r.targetWorkDays} 日</span>
            )}
            {r.isNew && (
              <span style={{ padding: '1px 6px', background: '#E1F5EE', color: '#085041', borderRadius: 3 }}>🆕 新人</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 16, fontWeight: 500,
            color: r.achievementRate >= 80 ? C.pink : r.achievementRate < 50 ? '#A32D2D' : C.dark,
          }}>¥{Math.round(r.monthlySales / 10000).toLocaleString()}万</div>
          <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 1 }}>
            達成率 <strong>{r.achievementRate}%</strong>
            {r.targetSales > 0 && ` / ノルマ ¥${Math.round(r.targetSales / 10000)}万`}
          </div>
        </div>
      </div>

      {/* 主要 4 指標 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12,
      }}>
        {ev.topRankings.map((tr, i) => {
          const isTop3 = tr.rank <= 3
          return (
            <div key={i} style={{
              background: isTop3 ? '#FBEAF0' : '#F9F6F7',
              padding: '6px 8px', borderRadius: 4, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: isTop3 ? '#72243E' : C.pinkMuted }}>{tr.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: isTop3 ? '#993556' : C.dark }}>
                {tr.rank} 位
              </div>
            </div>
          )
        })}
      </div>

      {/* 評価点 + 強化点 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isPC ? '1fr 1fr' : '1fr',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#0F6E56', fontWeight: 500, marginBottom: 6 }}>
            ✨ 評価点 ({ev.evaluations.length}項目)
          </div>
          {ev.evaluations.length === 0 ? (
            <div style={{ padding: '5px 9px', fontSize: 11, color: C.pinkMuted, fontStyle: 'italic' }}>
              該当なし
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ev.evaluations.map((e, i) => (
                <div key={i} style={{
                  padding: '5px 9px', background: '#E1F5EE', borderRadius: 4,
                  fontSize: 11, color: '#085041',
                }}>
                  {e.icon} <strong>{e.title}</strong>　<span style={{ fontWeight: 400 }}>{e.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#993556', fontWeight: 500, marginBottom: 6 }}>
            🎯 強化点 ({ev.improvements.length}項目)
          </div>
          {ev.improvements.length === 0 ? (
            <div style={{ padding: '5px 9px', fontSize: 11, color: C.pinkMuted, fontStyle: 'italic' }}>
              特になし 👍
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ev.improvements.map((im, i) => (
                <div key={i} style={{
                  padding: '5px 9px',
                  background: severityBg(im.severity), color: severityFg(im.severity),
                  borderRadius: 4, fontSize: 11,
                }}>
                  {im.icon} <strong>{im.title}</strong>　<span style={{ fontWeight: 400 }}>{im.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ─── スタイルヘルパ ─────────────────────────────────────
function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 12,
    border: `1px solid ${active ? C.pink : C.border}`,
    background: active ? '#FBEAF0' : '#FFF',
    color: active ? '#72243E' : C.pinkMuted,
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
  }
}

function severityBg(s: EvalSeverity): string {
  switch (s) {
    case 'high': return '#FCEBEB'
    case 'mid':  return '#FAEEDA'
    case 'low':  return '#FBEAF0'
  }
}
function severityFg(s: EvalSeverity): string {
  switch (s) {
    case 'high': return '#501313'
    case 'mid':  return '#633806'
    case 'low':  return '#72243E'
  }
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, color: C.pinkMuted, padding: 20, textAlign: 'center',
    }}>{children}</div>
  )
}
