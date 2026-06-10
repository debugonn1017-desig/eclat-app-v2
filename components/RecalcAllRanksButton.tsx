'use client'
// ─────────────────────────────────────────────────────────────────
//  全顧客ランク一括再評価ボタン
//   2 段階確認:
//     1. クリック → dryRun=true で差分プレビュー
//     2. 「実行」ボタン → dryRun=false で実反映
// ─────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { C } from '@/lib/colors'

// v0.3.45-A: 選択可能な対象ランク ('切れた' は常に自動変動の対象外なので含めない)
const ALL_RANK_CHIPS = ['S', 'A', 'B', 'C', '未設定']

type Result = {
  ok: boolean
  dryRun: boolean
  // v0.3.45-A: 対象ランクフィルター (null = 全対象)。API がエコーバックする
  targetRanks: string[] | null
  filtered: number
  totalCustomers: number
  v2Resolved: number
  evaluated: number
  changed: number
  bySrcRank: Record<string, number>
  byDstRank: Record<string, number>
  sampleChanges: Array<{
    customerId: string
    customerName: string | null
    castName: string | null
    from: string | null
    to: string
  }>
}

export default function RecalcAllRanksButton({ label = '💎 全顧客のランクを再評価', compact = false }: { label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Result | null>(null)
  const [applied, setApplied] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  // v0.3.45-A: 対象ランクフィルター (デフォルト全ON = 全対象 = 従来互換)
  const [selectedRanks, setSelectedRanks] = useState<string[]>([...ALL_RANK_CHIPS])

  // 取り違え事故防止①: フィルター変更時は preview/applied を破棄 → 再プレビュー必須
  const changeRanks = (ranks: string[]) => {
    setSelectedRanks(ranks)
    setPreview(null); setApplied(null); setError(null)
  }
  const toggleRank = (r: string) => {
    changeRanks(selectedRanks.includes(r) ? selectedRanks.filter(x => x !== r) : [...selectedRanks, r])
  }

  const runDryRun = async () => {
    if (selectedRanks.length === 0) {
      setError('対象ランクを1つ以上選択してください')
      return
    }
    setLoading(true); setError(null); setPreview(null); setApplied(null)
    try {
      const res = await fetch('/api/admin/recalculate-all-ranks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          // v0.3.45-B (P3): 全チップON = 全対象なので null 送信
          //   (サーバーの従来互換パスに乗り、エコーバックも null → 表示が「全対象」になる)
          targetRanks: selectedRanks.length === ALL_RANK_CHIPS.length ? null : selectedRanks,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `${res.status}`)
      setPreview(json)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const applyChanges = async () => {
    if (!preview || preview.changed === 0) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/recalculate-all-ranks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 取り違え事故防止②: 画面の state ではなく preview がエコーバックした条件を送る
        //   (dryRun と実反映で必ず同じ targetRanks になる)
        body: JSON.stringify({ dryRun: false, targetRanks: preview.targetRanks }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `${res.status}`)
      setApplied(json)
      setPreview(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const close = () => {
    setOpen(false); setPreview(null); setApplied(null); setError(null)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: compact ? '6px 12px' : '10px 18px',
          background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
          color: '#FFF', border: 'none', borderRadius: compact ? 14 : 20,
          fontSize: compact ? 11 : 12, fontWeight: 600, letterSpacing: '0.05em',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >{label}</button>

      {open && (
        <div onClick={close} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: 12, padding: 20,
            width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
                💎 全顧客ランク再評価
              </span>
              <button onClick={close} style={{
                marginLeft: 'auto', background: 'transparent', border: 'none',
                fontSize: 22, color: C.pinkMuted, cursor: 'pointer',
              }}>×</button>
            </div>

            {/* v0.3.45-A: 対象ランクフィルター + プレビュー実行 */}
            {!applied && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
                  対象ランク（現在のランクで絞り込み）:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {ALL_RANK_CHIPS.map(r => {
                    const on = selectedRanks.includes(r)
                    return (
                      <button key={r} onClick={() => toggleRank(r)} style={{
                        padding: '5px 14px', borderRadius: 20,
                        border: `1px solid ${on ? C.pink : C.border}`,
                        background: on ? '#FBEAF0' : 'transparent',
                        color: on ? '#72243E' : C.pinkMuted,
                        fontSize: 11, fontWeight: on ? 600 : 400,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>{r}</button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <PresetButton label="全対象" onClick={() => changeRanks([...ALL_RANK_CHIPS])} />
                  <PresetButton label="S・Aのみ" onClick={() => changeRanks(['S', 'A'])} />
                  <PresetButton label="B・Cのみ" onClick={() => changeRanks(['B', 'C'])} />
                </div>
                <button onClick={runDryRun} disabled={loading} style={{
                  width: '100%', padding: '9px',
                  background: 'transparent', color: C.pink,
                  border: `1px solid ${C.pink}`, borderRadius: 8,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>🔍 この条件でプレビュー</button>
              </div>
            )}

            {loading && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: C.pinkMuted, fontSize: 12 }}>
                計算中... (全本指名顧客 × 来店履歴を集計してます)
              </div>
            )}

            {error && (
              <div style={{
                padding: 12, background: '#FCEBEB', border: '1px solid #C53030',
                borderRadius: 8, fontSize: 11, color: '#C53030', marginBottom: 10,
              }}>⚠ {error}</div>
            )}

            {applied && (
              <div style={{
                padding: 14, background: '#E1F5EE', border: '1px solid #0F6E56',
                borderRadius: 8, marginBottom: 12,
              }}>
                <div style={{ fontSize: 13, color: '#0F6E56', fontWeight: 600, marginBottom: 4 }}>
                  ✅ 反映完了
                </div>
                <div style={{ fontSize: 11, color: '#085041' }}>
                  {applied.changed}名のランクを更新しました
                  （対象: {applied.targetRanks ? applied.targetRanks.join('・') : '全対象'} / 評価対象 {applied.evaluated}名）
                </div>
              </div>
            )}

            {preview && !applied && (
              <ResultBody result={preview} />
            )}
            {applied && (
              <ResultBody result={applied} />
            )}

            {preview && !applied && preview.changed > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={close}
                  style={{
                    flex: 1, padding: '10px',
                    background: 'transparent', color: C.pinkMuted,
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >キャンセル</button>
                <button
                  onClick={applyChanges}
                  disabled={loading}
                  style={{
                    flex: 2, padding: '10px',
                    background: C.pink, color: '#FFF',
                    border: 'none', borderRadius: 8,
                    fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >この {preview.changed} 件を反映する</button>
              </div>
            )}

            {preview && preview.changed === 0 && !applied && (
              <p style={{ fontSize: 11, color: C.dark, textAlign: 'center', marginTop: 12 }}>
                変更が必要な顧客はいません。すべて最新のランクです。
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function ResultBody({ result }: { result: Result }) {
  return (
    <div>
      {/* v0.3.45-A: このプレビュー/反映が使った対象フィルターを明示 */}
      <div style={{ fontSize: 11, color: C.pinkMuted, marginBottom: 8 }}>
        対象フィルター: <span style={{ color: '#72243E', fontWeight: 600 }}>
          {result.targetRanks ? result.targetRanks.join('・') : '全対象'}
        </span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12,
      }}>
        <Stat label="本指名顧客" value={result.totalCustomers.toString()} />
        <Stat label="フィルター対象" value={result.filtered.toString()} />
        <Stat label="V2 評価対象" value={result.evaluated.toString()} sub={`(設定済 scope のみ)`} />
        <Stat label="変更あり" value={result.changed.toString()} accent />
      </div>

      {result.changed > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
            変更パターン:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {Object.entries(result.bySrcRank).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <span key={k} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 12,
                background: C.tagBg2, color: '#72243E', fontWeight: 500,
              }}>{k} : {v}名</span>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
            サンプル (最大20件):
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
            {result.sampleChanges.map(ch => (
              <div key={ch.customerId} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderBottom: `1px solid ${C.border}`,
                fontSize: 11,
              }}>
                <span style={{ color: C.dark, fontWeight: 500 }}>{ch.customerName ?? '(無名)'}</span>
                <span style={{ color: C.pinkMuted, fontSize: 9 }}>担当 {ch.castName ?? '—'}</span>
                <span style={{ marginLeft: 'auto', color: C.pink, fontWeight: 600 }}>
                  {ch.from ?? '—'} → {ch.to}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 12,
      border: 'none', background: C.miniBg, color: C.pinkMuted,
      fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? C.tagBg2 : C.miniBg,
      borderRadius: 8, padding: '8px 10px',
    }}>
      <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: accent ? '#72243E' : C.dark }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: C.pinkMuted, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
