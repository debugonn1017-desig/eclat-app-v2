'use client'
// ─────────────────────────────────────────────────────────────────
//  RankRecalcModal — 本指名顧客のランクを事実から再計算するモーダル
// ─────────────────────────────────────────────────────────────────
//  使い方:
//    <RankRecalcModal
//      open={open}
//      castId={castId}
//      castName={castName}
//      onClose={() => setOpen(false)}
//      onApplied={() => refetchCustomers()}
//    />
//
//  動き:
//    1. open=true になったらサーバーの署名付きV2プレビューを取得
//    2. 本指名・手動/履歴なし切れたの保護を共通定義で判定
//    3. ユーザーは行ごとに「反映」 or 下の「変更がある全員に一括反映」を押せる
//    4. サーバー/DBで同時編集と権限を再確認し、変更元と履歴を記録
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo } from 'react'
import { C } from '@/lib/colors'
import { invalidateAllCastsKPI, invalidateCustomerDetail } from '@/lib/cache'
import { useToast } from '@/hooks/useToast'
import type {
  CustomerRank,
  RankCalculationResult,
} from '@/types'

type Props = {
  open: boolean
  castId: string
  castName: string
  /** キャストの層名（A層 / B層 等）。階層検索で使う。 */
  castTier?: string | null
  onClose: () => void
  /** 反映が起きた後、親側でデータを再取得するためのコールバック */
  onApplied?: () => void
}

type Row = {
  customerId: string
  customerName: string
  currentRank: CustomerRank | null
  token: string
  result: RankCalculationResult
}

// 「切れた」は出所autoだけをサーバーで取得する。
const ALL_RANK_CHIPS = ['S', 'A', 'B', 'C', '未設定', '切れた']
const RANK_ORDER = ['切れた', 'C', 'B', 'A', 'S']

const RANK_COLOR: Record<CustomerRank, string> = {
  S: '#D4A017',
  A: '#B25575',
  B: '#7A4060',
  C: '#999999',
  '切れた': C.dark2,
}

export default function RankRecalcModal({
  open,
  castId,
  castName,
  castTier = null,
  onClose,
  onApplied,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [applying, setApplying] = useState<Set<string>>(new Set())
  const [bulkApplying, setBulkApplying] = useState(false)
  const [showAll, setShowAll] = useState(false) // false なら「変更ありのみ」表示
  // v0.3.46-A: 失敗通知は alert ではなく非ブロッキングのトーストで出す
  const { toast, ToastView } = useToast()
  // v0.3.45-B: 対象ランクフィルター (デフォルト全ON = 従来挙動と同一)
  const [selectedRanks, setSelectedRanks] = useState<string[]>([...ALL_RANK_CHIPS])

  // 証明付きサーバープレビュー。manual/unknown の切れたは自動反映から除外。
  useEffect(() => {
    if (!open || !castId) return
    let cancelled=false
    setLoading(true); setError(null); setRows([])
    void fetch('/api/customer-ranks?mode=auto&castId='+encodeURIComponent(castId),{cache:'no-store'})
      .then(async response=>{
        const data=await response.json()
        if (!response.ok) throw new Error(data.error || '読み込めませんでした')
        if (cancelled) return
        setRows(data.items.map((r: {id:string;name:string;currentRank:CustomerRank|null;token:string;result:{recommended:CustomerRank;reasons:string[];metrics:Record<string,number>}})=>({
          customerId:r.id,customerName:r.name,currentRank:r.currentRank,token:r.token,
          result:{recommended:r.result.recommended,base:r.result.recommended,totalAdjustment:0,
            reasons:r.result.reasons.map(label=>({kind:'base',label,delta:0})),
            metrics:{totalSpent:r.result.metrics.cumulative_sales,monthlyAverage:r.result.metrics.monthly_avg_sales,
              visitCount3m:0,visitCountTotal:r.result.metrics.cumulative_visits,douhanRate:r.result.metrics.douhan_rate,
              afterRate:r.result.metrics.after_rate,daysSinceLastVisit:r.result.metrics.days_since_last_visit,
              tenureMonths:r.result.metrics.tenure_months,trendRatio:r.result.metrics.recent_trend_ratio}}})))
      }).catch(e=>{if(!cancelled)setError(e instanceof Error ? e.message : '取得失敗')})
      .finally(()=>{if(!cancelled)setLoading(false)})
    return ()=>{cancelled=true}
  },[open,castId,castName,castTier])

  const applyRows = async (targets: Row[]) => {
    const succeeded=new Set<string>()
    try {
    for(let i=0;i<targets.length;i+=50){
      const response=await fetch('/api/customer-ranks',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({tokens:targets.slice(i,i+50).map(r=>r.token)})})
      const data=await response.json()
      if(!response.ok) throw new Error(data.error || '保存失敗')
      for(const r of data.results as {id:string;ok:boolean}[]) if(r.ok){succeeded.add(r.id);invalidateCustomerDetail(r.id)}
      setRows(prev=>prev.map(r=>succeeded.has(r.customerId) ? {...r,currentRank:r.result.recommended} : r))
    }
    if(succeeded.size!==targets.length) throw new Error('一部はデータ変更等により反映できませんでした。開き直して再確認してください')
    } finally {
      if(succeeded.size){invalidateAllCastsKPI(); onApplied?.()}
    }
  }

  // ─── v0.3.45-B: ランクフィルター → 変更あり抽出 ─────────────
  //   applyAll は changedRows を使うので、自動的に
  //   「フィルター後の変更あり行だけ」が一括反映の対象になる
  const filteredRows = useMemo(
    () => rows.filter(r => selectedRanks.includes(r.currentRank ?? '未設定')),
    [rows, selectedRanks]
  )
  const changedRows = useMemo(
    () => filteredRows.filter(r => r.currentRank !== r.result.recommended),
    [filteredRows]
  )
  const visibleRows = showAll ? filteredRows : changedRows
  // フィルターのラベル (集計行 / 一括ボタン / confirm 文言で共用)
  const isAllRanks = selectedRanks.length === ALL_RANK_CHIPS.length
  const ranksLabel = ALL_RANK_CHIPS.filter(r => selectedRanks.includes(r)).join('・')

  // ─── 個別反映 ────────────────────────────────────────────
  const applyOne = async (row: Row) => {
    if (applying.has(row.customerId)) return
    setApplying(prev => new Set(prev).add(row.customerId))
    try {
      await applyRows([row])
    } catch (e) {
      // v0.3.46-A: alert → toast (非ブロッキング)
      toast('反映に失敗しました: ' + (e instanceof Error ? e.message : ''), 'error')
    } finally {
      setApplying(prev => {
        const next = new Set(prev)
        next.delete(row.customerId)
        return next
      })
    }
  }

  // ─── 一括反映 ────────────────────────────────────────────
  const applyAll = async () => {
    if (changedRows.length === 0) return
    // v0.3.45-B: 対象ランクを confirm に明記 (フィルター取り違え防止)
    const ok = window.confirm(
      `対象ランク: ${isAllRanks ? '全対象' : ranksLabel}\n変更がある ${changedRows.length} 名のランクを推奨値に書き換えます。\nよろしいですか？`
    )
    if (!ok) return

    setBulkApplying(true)
    try {
      await applyRows(changedRows)
    } catch (e) {
      // v0.3.46-A: alert → toast (非ブロッキング)
      toast('一括反映に失敗しました: ' + (e instanceof Error ? e.message : ''), 'error')
    } finally {
      setBulkApplying(false)
    }
  }

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFF', maxWidth: '560px', width: '100%',
          maxHeight: '90vh', overflow: 'auto',
          borderRadius: 16, padding: '20px 18px',
          fontFamily: 'inherit',
        }}
      >
        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '14px', borderBottom: `1px solid ${C.border}`, paddingBottom: '10px',
        }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: C.pink, marginBottom: 2 }}>
              📊 ランク再評価
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: C.dark }}>
              {castName} の本指名顧客
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              fontSize: '20px', cursor: 'pointer', color: C.pinkMuted,
            }}
          >×</button>
        </div>

        {/* ロード中 / エラー */}
        {loading && <div style={{ padding: '40px 0', textAlign: 'center', color: C.pinkMuted }}>計算中…</div>}
        {error && <div style={{ padding: '12px', color: C.danger, background: '#FFF5F5' }}>{error}</div>}

        {/* 本体 */}
        {!loading && !error && (
          <>
            {/* v0.3.45-B: 対象ランクフィルター */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {ALL_RANK_CHIPS.map(r => {
                  const on = selectedRanks.includes(r)
                  return (
                    <button key={r} onClick={() =>
                      setSelectedRanks(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
                    } style={{
                      padding: '4px 12px', borderRadius: 20,
                      border: `1px solid ${on ? C.pink : C.border}`,
                      background: on ? '#FBEAF0' : 'transparent',
                      color: on ? '#72243E' : C.pinkMuted,
                      fontSize: 11, fontWeight: on ? 600 : 400,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>{r}</button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([['全対象', ALL_RANK_CHIPS], ['S・Aのみ', ['S', 'A']], ['B・Cのみ', ['B', 'C']]] as const).map(([label, ranks]) => (
                  <button key={label} onClick={() => setSelectedRanks([...ranks])} style={{
                    padding: '3px 10px', borderRadius: 12,
                    border: 'none', background: C.miniBg, color: C.pinkMuted,
                    fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {/* 集計 + フィルタ */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '12px', fontSize: '12px', color: C.pinkMuted,
            }}>
              <div>
                対象 <strong style={{ color: C.dark }}>{filteredRows.length}</strong> 名
                {!isAllRanks && <span style={{ fontSize: 11 }}>（全 {rows.length} 名中）</span>} ／
                変更あり <strong style={{ color: C.pink }}>{changedRows.length}</strong> 名
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={e => setShowAll(e.target.checked)}
                />
                変更なしも表示
              </label>
            </div>

            {/* 行リスト */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {visibleRows.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '30px 0',
                  color: C.pinkMuted, fontSize: '13px',
                }}>
                  {selectedRanks.length === 0
                    ? '対象ランクが選択されていません'
                    : showAll ? '対象顧客がいません' : '変更が必要な顧客はいません ✨'}
                </div>
              )}

              {visibleRows.map(row => {
                const changed = row.currentRank !== row.result.recommended
                const direction =
                  !changed
                    ? null
                    : RANK_ORDER.indexOf(row.currentRank ?? 'C') < RANK_ORDER.indexOf(row.result.recommended)
                      ? 'up'
                      : 'down'

                return (
                  <div
                    key={row.customerId}
                    style={{
                      border: `1px solid ${changed ? 'rgba(232,135,155,0.3)' : C.border}`,
                      background: changed ? 'rgba(232,135,155,0.04)' : '#FAFAF9',
                      padding: '10px 12px', borderRadius: 8,
                    }}
                  >
                    {/* 1段目: 名前 + ランク変化 + 反映ボタン */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: C.dark, flex: 1 }}>
                        {direction === 'up' ? '🔼 ' : direction === 'down' ? '🔽 ' : ''}
                        {row.customerName}
                      </span>
                      <span style={{ fontSize: '11px', color: C.pinkMuted }}>現在</span>
                      <span style={{
                        fontSize: '12px', fontWeight: 700,
                        color: row.currentRank ? RANK_COLOR[row.currentRank] : C.pinkMuted,
                        minWidth: 18, textAlign: 'center',
                      }}>
                        {row.currentRank ?? '—'}
                      </span>
                      <span style={{ fontSize: '11px', color: C.pinkMuted }}>→</span>
                      <span style={{
                        fontSize: '13px', fontWeight: 800,
                        color: RANK_COLOR[row.result.recommended],
                        minWidth: 18, textAlign: 'center',
                      }}>
                        {row.result.recommended}
                      </span>
                      {changed ? (
                        <button
                          onClick={() => applyOne(row)}
                          disabled={applying.has(row.customerId)}
                          style={{
                            fontSize: '10px', letterSpacing: '0.1em',
                            padding: '4px 10px', borderRadius: 6,
                            background: C.pink, color: '#FFF',
                            border: 'none', cursor: applying.has(row.customerId) ? 'wait' : 'pointer',
                            fontFamily: 'inherit', opacity: applying.has(row.customerId) ? 0.6 : 1,
                          }}
                        >
                          {applying.has(row.customerId) ? '…' : '反映'}
                        </button>
                      ) : (
                        <span style={{
                          fontSize: '10px', color: C.pinkMuted,
                          padding: '4px 8px',
                        }}>✓</span>
                      )}
                    </div>

                    {/* 2段目: 判定理由（簡潔に） */}
                    <div style={{
                      marginTop: 6, fontSize: '11px', color: C.pinkMuted,
                      display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                      {row.result.reasons.map((r, i) => (
                          <div key={i} style={{
                            color: r.delta > 0 ? '#229954' : r.delta < 0 ? '#C0392B' : C.pinkMuted,
                          }}>
                            {r.label}
                          </div>
                        ))}
                    </div>

                    {/* 3段目: 中間メトリクス（数字の根拠）*/}
                    <div style={{
                      marginTop: 4, fontSize: '10px', color: C.pinkMuted,
                      paddingTop: 4, borderTop: `1px dashed ${C.border}`,
                    }}>
                      累計 {Math.round(row.result.metrics.totalSpent / 10000).toLocaleString()}万円 ／
                      月平均 {Math.round(row.result.metrics.monthlyAverage / 1000) / 10}万円 ／
                      来店 {row.result.metrics.visitCountTotal}回 ／
                      同伴 {row.result.metrics.douhanRate.toFixed(0)}%
                      {row.result.metrics.daysSinceLastVisit !== null && (
                        <> ／ 最終 {row.result.metrics.daysSinceLastVisit}日前</>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* フッター: 一括反映 */}
            {changedRows.length > 0 && (
              <div style={{
                marginTop: '14px', paddingTop: '12px',
                borderTop: `1px solid ${C.border}`,
                display: 'flex', gap: '10px', alignItems: 'center',
              }}>
                <button
                  onClick={applyAll}
                  disabled={bulkApplying}
                  style={{
                    flex: 1, fontSize: '13px', fontWeight: 700,
                    padding: '10px', borderRadius: 8,
                    background: C.pink, color: '#FFF',
                    border: 'none', cursor: bulkApplying ? 'wait' : 'pointer',
                    fontFamily: 'inherit', opacity: bulkApplying ? 0.6 : 1,
                  }}
                >
                  {bulkApplying
                    ? '反映中…'
                    : isAllRanks
                      ? `変更がある ${changedRows.length} 名に一括反映`
                      : `${ranksLabel} の変更がある ${changedRows.length} 名に一括反映`}
                </button>
                <button
                  onClick={onClose}
                  style={{
                    fontSize: '12px', padding: '10px 16px', borderRadius: 8,
                    background: 'transparent', color: C.dark,
                    border: `1px solid ${C.border}`, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  閉じる
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* v0.3.46-A: 失敗通知トースト (position:fixed なのでモーダル内マウントでOK) */}
      {ToastView}
    </div>
  )
}
