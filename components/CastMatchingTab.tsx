'use client'

// 🔮 マッチング診断タブ（Phase 4）
//   顧客の属性（ランク・地域・指名ルート・年齢層・職業）を入力すると、
//   過去のデータから「この属性の顧客に最も強いキャスト」をスコアリングして提案。
//
//   /admin/cast-analysis から使用される。

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'
import { CastProfile, CustomerRank, REGIONS, NominationRoute, AgeGroup, Occupation, FavoriteType, CastType, SpouseStatus } from '@/types'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

type AnyRoute = NominationRoute | ''
type AnyOccupation = Occupation | ''
type AnyFavoriteType = FavoriteType | ''
type AnyCastType = CastType | ''
type AnySpouse = SpouseStatus | ''

// 入力フォームの状態
type Criteria = {
  customer_rank: CustomerRank | ''
  region: string                   // Region 型は readonly tuple なので string で受ける
  nomination_route: AnyRoute
  age_group: AgeGroup | ''
  occupation: AnyOccupation
  favorite_type: AnyFavoriteType
  cast_type: AnyCastType
  spouse_status: AnySpouse
}

const EMPTY_CRITERIA: Criteria = {
  customer_rank: '',
  region: '',
  nomination_route: '',
  age_group: '',
  occupation: '',
  favorite_type: '',
  cast_type: '',
  spouse_status: '',
}

type CustomerForMatch = {
  id: string
  cast_name: string
  customer_rank: string | null
  region: string | null
  nomination_route: string | null
  age_group: string | null
  occupation: string | null
  favorite_type: string | null
  cast_type: string | null
  spouse_status: string | null
  total_spent: number   // 来店記録の合計
  visit_count: number
}

type CastScore = {
  cast: CastProfile
  matchingCount: number
  matchingTotalSales: number
  matchingAvgLtv: number
  matchingRepeatRate: number
  score: number  // 総合スコア（matchingCount * matchingAvgLtv * (repeatRate+0.5)）
  examples: { name: string; ltv: number }[]
}

export function CastMatchingTab({ isPC }: { isPC: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [casts, setCasts] = useState<CastProfile[]>([])
  const [allCustomers, setAllCustomers] = useState<CustomerForMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [criteria, setCriteria] = useState<Criteria>(EMPTY_CRITERIA)
  const [submitted, setSubmitted] = useState(false)

  // 全キャスト・全顧客・全 visits をマウント時に取得
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      // 1) 在籍中キャスト
      const { data: cs } = await supabase
        .from('profiles')
        .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
        .eq('role', 'cast')
        .eq('is_active', true)
      setCasts((cs ?? []) as CastProfile[])

      // 2) 全顧客（必要属性のみ）
      // ⚠ 1000件制限対策: 現状 1000+ 顧客いるので fetchAllPaginated 必須
      const cust = await fetchAllPaginated<{
        id: string; cast_name: string; customer_rank: string | null;
        region: string | null; nomination_route: string | null;
        age_group: string | null; occupation: string | null;
        favorite_type: string | null; cast_type: string | null;
        spouse_status: string | null;
      }>((from, to) =>
        supabase
          .from('customers')
          .select('id, cast_name, customer_rank, region, nomination_route, age_group, occupation, favorite_type, cast_type, spouse_status')
          .range(from, to)
      ).catch(e => { console.error('[CastMatchingTab customers]', e); return [] })

      const custList = (cust as Array<{
        id: string; cast_name: string; customer_rank: string | null;
        region: string | null; nomination_route: string | null;
        age_group: string | null; occupation: string | null;
        favorite_type: string | null; cast_type: string | null;
        spouse_status: string | null;
      }>)

      // 3) 全 visits（合計売上計算用）— 1000件超対策のページング取得
      const customerIds = custList.map(c => c.id)
      const visitsByCust = new Map<string, { total: number; count: number }>()
      if (customerIds.length > 0) {
        const vs = await fetchAllPaginated<{ customer_id: string; amount_spent: number }>((from, to) =>
          supabase
            .from('customer_visits')
            .select('customer_id, amount_spent')
            .in('customer_id', customerIds)
            .range(from, to)
        ).catch(e => { console.error("[fetchAllPaginated]", e); return [] })
        for (const v of vs) {
          const a = Number(v.amount_spent) || 0
          if (a <= 0) continue
          const cur = visitsByCust.get(v.customer_id) ?? { total: 0, count: 0 }
          cur.total += a
          cur.count += 1
          visitsByCust.set(v.customer_id, cur)
        }
      }

      const enriched: CustomerForMatch[] = custList.map(c => {
        const v = visitsByCust.get(c.id) ?? { total: 0, count: 0 }
        return { ...c, total_spent: v.total, visit_count: v.count }
      })
      setAllCustomers(enriched)
      setLoading(false)
    }
    load()
  }, [supabase])

  // スコアリング
  const ranking: CastScore[] = useMemo(() => {
    if (!submitted || casts.length === 0) return []
    // criteria に合致する顧客を抽出（少なくとも1つの条件が指定されている前提）
    const filterCustomer = (c: CustomerForMatch): boolean => {
      if (criteria.customer_rank && c.customer_rank !== criteria.customer_rank) return false
      if (criteria.region && c.region !== criteria.region) return false
      if (criteria.nomination_route && c.nomination_route !== criteria.nomination_route) return false
      if (criteria.age_group && c.age_group !== criteria.age_group) return false
      if (criteria.occupation && c.occupation !== criteria.occupation) return false
      if (criteria.favorite_type && c.favorite_type !== criteria.favorite_type) return false
      if (criteria.cast_type && c.cast_type !== criteria.cast_type) return false
      if (criteria.spouse_status && c.spouse_status !== criteria.spouse_status) return false
      return true
    }

    const matches = allCustomers.filter(filterCustomer)
    const byCast = new Map<string, CustomerForMatch[]>()
    for (const c of matches) {
      if (!c.cast_name) continue
      const list = byCast.get(c.cast_name) ?? []
      list.push(c)
      byCast.set(c.cast_name, list)
    }

    const result: CastScore[] = []
    for (const cast of casts) {
      const list = byCast.get(cast.cast_name) ?? []
      const matchingCount = list.length
      const totalSales = list.reduce((s, c) => s + c.total_spent, 0)
      const repeatedCount = list.filter(c => c.visit_count >= 2).length
      const repeatRate = matchingCount > 0 ? repeatedCount / matchingCount : 0
      const avgLtv = matchingCount > 0 ? Math.round(totalSales / matchingCount) : 0
      // 総合スコア = 該当顧客数 × LTV平均 × (リピート率+0.5)
      // リピート率が低くても完全に0にならないように +0.5
      const score = matchingCount > 0
        ? matchingCount * avgLtv * (repeatRate + 0.5)
        : 0
      // 上位の例（売上トップ3）
      const examples = [...list]
        .sort((a, b) => b.total_spent - a.total_spent)
        .slice(0, 3)
        .map(c => ({ name: '⋯', ltv: c.total_spent }))
      result.push({
        cast,
        matchingCount,
        matchingTotalSales: totalSales,
        matchingAvgLtv: avgLtv,
        matchingRepeatRate: Math.round(repeatRate * 100),
        score,
        examples,
      })
    }
    return result.sort((a, b) => b.score - a.score)
  }, [submitted, criteria, casts, allCustomers])

  const hasAnyCriteria = Object.values(criteria).some(v => v !== '')
  const topResult = ranking.find(r => r.matchingCount > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ヘッダー */}
      <div style={{
        background: 'linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 60%, #F48FB1 100%)',
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '14px 16px',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#5A2840', marginBottom: 4 }}>
          🔮 顧客タイプ診断 — おすすめキャスト
        </div>
        <div style={{ fontSize: 11, color: '#72243E' }}>
          お客様の属性を入力すると、過去のデータから「このタイプに強いキャスト」を提案します。
          データが多いほど精度が上がります。
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: C.pinkMuted }}>
          全データ読込中...
        </div>
      ) : (
        <>
          {/* 入力フォーム */}
          <div style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
              お客様の属性（分かるものだけ入力。未入力=その属性は無視）
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isPC ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
              gap: 10,
            }}>
              <Field label="顧客ランク">
                <Select value={criteria.customer_rank} onChange={v => setCriteria({ ...criteria, customer_rank: v as CustomerRank | '' })}>
                  <option value="">— 指定なし —</option>
                  {(['S', 'A', 'B', 'C'] as CustomerRank[]).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="地域">
                <Select value={criteria.region} onChange={v => setCriteria({ ...criteria, region: v })}>
                  <option value="">— 指定なし —</option>
                  {REGIONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="入口（指名ルート）">
                <Select value={criteria.nomination_route} onChange={v => setCriteria({ ...criteria, nomination_route: v as AnyRoute })}>
                  <option value="">— 指定なし —</option>
                  {([
                    '前店舗顧客', 'SNS指名', '紹介指名', '店舗外指名',
                    '場内指名→本指名', 'フリー→本指名', 'ヘルプ→本指名', 'ロイヤル層→本指名', 'その他',
                  ] as NominationRoute[]).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="年齢層">
                <Select value={criteria.age_group} onChange={v => setCriteria({ ...criteria, age_group: v as AgeGroup | '' })}>
                  <option value="">— 指定なし —</option>
                  {(['20代', '30代', '40代', '50代以上'] as AgeGroup[]).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="職業">
                <Select value={criteria.occupation} onChange={v => setCriteria({ ...criteria, occupation: v as AnyOccupation })}>
                  <option value="">— 指定なし —</option>
                  {([
                    '経営者', 'サラリーマン', '接待役が多い', '自営業', '医療系', '夜職',
                    '公務員・堅い職業', '土業', '不動産', '金融', '建設', '飲食', 'IT',
                    '美容', '広告', '士業', 'その他',
                  ] as Occupation[]).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="💗 好みのタイプ（最重要）">
                <Select value={criteria.favorite_type} onChange={v => setCriteria({ ...criteria, favorite_type: v as AnyFavoriteType })}>
                  <option value="">— 指定なし —</option>
                  {([
                    '可愛い系', '清楚系', '綺麗系', 'ギャル系', '大人系', '癒し系',
                    '甘え系', '強気系', 'お姉さん系', '素朴系', '明るい子', '落ち着いた子',
                  ] as FavoriteType[]).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="🎭 希望キャストタイプ（接客スタイル）">
                <Select value={criteria.cast_type} onChange={v => setCriteria({ ...criteria, cast_type: v as AnyCastType })}>
                  <option value="">— 指定なし —</option>
                  {([
                    '清楚系', '可愛い系', '綺麗系', 'ギャル系', 'お姉さん系', '癒し系',
                    'サバサバ系', '色恋営業型', '友達営業型', '聞き役タイプ', '盛り上げ役',
                    'S系', 'M系',
                  ] as CastType[]).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="配偶者">
                <Select value={criteria.spouse_status} onChange={v => setCriteria({ ...criteria, spouse_status: v as AnySpouse })}>
                  <option value="">— 指定なし —</option>
                  {(['有', '無', '不明'] as SpouseStatus[]).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => setSubmitted(true)}
                disabled={!hasAnyCriteria}
                style={{
                  padding: '8px 22px', borderRadius: 20,
                  border: 'none',
                  background: hasAnyCriteria ? C.pink : '#DDD',
                  color: '#FFF', fontWeight: 600, fontSize: 12,
                  fontFamily: 'inherit',
                  cursor: hasAnyCriteria ? 'pointer' : 'not-allowed',
                }}
              >
                🔮 診断する
              </button>
              <button
                onClick={() => { setCriteria(EMPTY_CRITERIA); setSubmitted(false) }}
                style={{
                  padding: '8px 18px', borderRadius: 20,
                  border: `1px solid ${C.border}`,
                  background: '#FFF', color: C.pinkMuted, fontSize: 12,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                クリア
              </button>
              <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 10, color: C.pinkMuted }}>
                データ件数: 顧客 {allCustomers.length}名 / キャスト {casts.length}名
              </span>
            </div>
          </div>

          {/* 結果 */}
          {submitted && (
            <>
              {topResult ? (
                <div style={{
                  background: 'linear-gradient(135deg, #FFF8EC 0%, #FFE9C8 100%)',
                  border: `1px solid #E5B14C`,
                  borderRadius: 12,
                  padding: '14px 16px',
                }}>
                  <div style={{ fontSize: 11, color: '#9C6300', fontWeight: 600, marginBottom: 4 }}>
                    🌟 おすすめキャスト No.1
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#5C3A00' }}>
                    {topResult.cast.cast_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#9C6300', marginTop: 4 }}>
                    類似タイプの担当顧客 <strong>{topResult.matchingCount}名</strong>、
                    そこからの累計売上 <strong>¥{topResult.matchingTotalSales.toLocaleString()}</strong>、
                    リピート率 <strong>{topResult.matchingRepeatRate}%</strong>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12,
                  padding: 24, textAlign: 'center', fontSize: 12, color: C.pinkMuted,
                }}>
                  該当属性の顧客実績データが見つかりませんでした。<br />
                  条件を緩めるか、まずはデータを蓄積してから再度お試しください。
                </div>
              )}

              {/* 全体ランキング */}
              <div style={{
                background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: '14px 16px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
                  キャスト別 マッチングスコア
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: C.tagBg2, color: '#5A2840' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10 }}>順位</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10 }}>キャスト</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10 }}>該当顧客</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10 }}>累計売上</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10 }}>LTV平均</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10 }}>リピ率</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10 }}>スコア</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.slice(0, 15).map((r, i) => {
                      const isTop3 = i < 3 && r.matchingCount > 0
                      return (
                        <tr key={r.cast.id} style={{
                          borderBottom: `1px solid ${C.border}`,
                          background: isTop3 ? 'linear-gradient(90deg, #FFF6E5 0%, #FFFDF7 100%)' : 'transparent',
                          opacity: r.matchingCount === 0 ? 0.5 : 1,
                        }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: isTop3 ? '#9C6300' : C.dark }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                          </td>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                            {r.cast.cast_name}
                            {r.cast.cast_tier && (
                              <span style={{
                                fontSize: 9, padding: '1px 5px', borderRadius: 6,
                                background: C.rankBadge, marginLeft: 6,
                              }}>{r.cast.cast_tier}</span>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.matchingCount}名</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: C.pink, fontWeight: 600 }}>
                            ¥{r.matchingTotalSales.toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>¥{r.matchingAvgLtv.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right',
                            color: r.matchingRepeatRate >= 50 ? '#0F6E56' : r.matchingRepeatRate >= 25 ? '#B8860B' : C.pinkMuted,
                            fontWeight: 600,
                          }}>{r.matchingCount > 0 ? `${r.matchingRepeatRate}%` : '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, color: C.pinkMuted }}>
                            {r.score > 0 ? Math.round(r.score / 10000) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 8, fontStyle: 'italic' }}>
                  ※ スコア = 該当顧客数 × LTV平均 × (リピ率+0.5)。万円単位で表示。
                  実績データがないキャストは灰色表示。
                </div>
              </div>
            </>
          )}

          {!submitted && (
            <div style={{
              background: C.miniBg, border: `1px dashed ${C.border}`, borderRadius: 12,
              padding: 24, textAlign: 'center', fontSize: 11, color: C.pinkMuted,
            }}>
              ↑ 属性を入力して「診断する」を押してください。
              <br />
              入力した属性に該当する顧客の実績から、相性が良いキャストを推定します。
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── サブコンポーネント ──────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: C.pinkMuted, fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  )
}

function Select({
  value, onChange, children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '6px 8px', fontSize: 11,
        border: `1px solid ${C.border}`, borderRadius: 6,
        background: '#FFF', color: C.dark,
        fontFamily: 'inherit',
        width: '100%',
      }}
    >
      {children}
    </select>
  )
}
