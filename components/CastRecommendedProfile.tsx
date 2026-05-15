'use client'

// 🎯 おすすめ客像（このキャストが強い顧客タイプの自動生成プロファイル）
//   このキャストの担当顧客データから、属性ごとのベストゾーンを抽出し、
//   「30代の経営者で清楚系を好む福岡県の本指名客に強い」のような
//   キャラクター像をデータ駆動で生成して表示する。
//
//   /casts/[id]（キャスト本人ページ）と /admin/cast-analysis（統合分析）の両方で使用。

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'
import type { CustomerLite } from './CastAnalysisAdvancedTabs'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

type ExtraAttrs = {
  age_group: string | null
  occupation: string | null
  favorite_type: string | null
  nomination_route: string | null
  spouse_status: string | null
}

type GroupStat = {
  key: string
  customerCount: number
  totalSales: number
  avgPerCustomer: number
  repeatRate: number
}

type Section = {
  label: string         // 例: "ランク"
  emoji: string
  best: GroupStat | null
  secondBest: GroupStat | null
  total: number         // 全グループ合計顧客数
  description: string   // 「○○のお客様に最も強い」みたいな1行
}

export function CastRecommendedProfile({
  customers: customersProp,
  castName,
  isPC,
  compact = false,
}: {
  /** 既に集計済みの顧客リスト（/admin/cast-analysis 用） */
  customers?: CustomerLite[]
  /** castName が渡されていれば内部で fetch する（/casts/[id] 用） */
  castName?: string
  isPC: boolean
  /** /casts/[id] 用にコンパクト表示するモード */
  compact?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [extra, setExtra] = useState<Map<string, ExtraAttrs>>(new Map())
  const [internalCustomers, setInternalCustomers] = useState<CustomerLite[]>([])
  const [loading, setLoading] = useState(true)

  // castName が渡されている場合は内部で顧客を fetch して集計する
  useEffect(() => {
    if (customersProp || !castName) return
    const load = async () => {
      setLoading(true)
      // 顧客取得
      const { data: cs } = await supabase
        .from('customers')
        .select('id, customer_name, customer_rank, region, nomination_status, first_visit_date, last_contact_date')
        .eq('cast_name', castName)
      const list = (cs ?? []) as Array<{
        id: string; customer_name: string; customer_rank: string | null
        region: string | null; nomination_status: string | null
        first_visit_date: string | null; last_contact_date: string | null
      }>
      const ids = list.map(c => c.id)
      // 訪問取得
      const visitsByCust = new Map<string, { visits: number; total: number; douhan: boolean; lastDate: string | null }>()
      if (ids.length > 0) {
        // ⚠ 1000件超対策
        const vs = await fetchAllPaginated<{ customer_id: string; visit_date: string; amount_spent: number; has_douhan: boolean }>((from, to) =>
          supabase
            .from('customer_visits')
            .select('customer_id, visit_date, amount_spent, has_douhan')
            .in('customer_id', ids)
            .range(from, to)
        ).catch(e => { console.error("[fetchAllPaginated]", e); return [] })
        for (const v of vs) {
          const a = Number(v.amount_spent) || 0
          if (a <= 0) continue
          const cur = visitsByCust.get(v.customer_id) ?? { visits: 0, total: 0, douhan: false, lastDate: null }
          cur.visits += 1
          cur.total += a
          if (v.has_douhan) cur.douhan = true
          if (!cur.lastDate || v.visit_date > cur.lastDate) cur.lastDate = v.visit_date
          visitsByCust.set(v.customer_id, cur)
        }
      }
      const enriched: CustomerLite[] = list.map(c => {
        const v = visitsByCust.get(c.id) ?? { visits: 0, total: 0, douhan: false, lastDate: null }
        return {
          id: c.id, customer_name: c.customer_name,
          customer_rank: c.customer_rank, region: c.region,
          nomination_status: c.nomination_status,
          first_visit_date: c.first_visit_date,
          last_visit_date: v.lastDate,
          visit_count: v.visits,
          total_spent: v.total,
          has_douhan: v.douhan,
          avg_spent: v.visits > 0 ? Math.round(v.total / v.visits) : 0,
          last_contact_date: c.last_contact_date,
        }
      })
      setInternalCustomers(enriched)
    }
    load()
  }, [supabase, castName, customersProp])

  // 効果のあるリスト
  const customers = customersProp ?? internalCustomers

  // 追加属性 fetch
  useEffect(() => {
    const load = async () => {
      if (customers.length === 0) { setExtra(new Map()); setLoading(false); return }
      setLoading(true)
      const ids = customers.map(c => c.id)
      // ⚠ 1000件超対策
      const data = await fetchAllPaginated<{
        id: string; age_group: string | null; occupation: string | null
        favorite_type: string | null; nomination_route: string | null
        spouse_status: string | null
      }>((from, to) =>
        supabase
          .from('customers')
          .select('id, age_group, occupation, favorite_type, nomination_route, spouse_status')
          .in('id', ids)
          .range(from, to)
      ).catch(e => { console.error("[fetchAllPaginated]", e); return [] })
      const m = new Map<string, ExtraAttrs>()
      for (const r of data) {
        m.set(r.id, {
          age_group: r.age_group,
          occupation: r.occupation,
          favorite_type: r.favorite_type,
          nomination_route: r.nomination_route,
          spouse_status: r.spouse_status,
        })
      }
      setExtra(m)
      setLoading(false)
    }
    load()
  }, [supabase, customers])

  // 属性別の Top グループ抽出
  const sections: Section[] = useMemo(() => {
    const aggregateBy = (getKey: (c: CustomerLite) => string | null | undefined): Section['best'][] => {
      const groups = new Map<string, { ids: Set<string>; total: number; repeat: number }>()
      for (const c of customers) {
        const k = getKey(c)
        if (!k) continue
        if (k === '未設定' || k === '') continue
        const total = c.total_spent
        if (total <= 0) continue
        const g = groups.get(k) ?? { ids: new Set<string>(), total: 0, repeat: 0 }
        g.ids.add(c.id)
        g.total += total
        if (c.visit_count >= 2) g.repeat += 1
        groups.set(k, g)
      }
      const arr: GroupStat[] = []
      for (const [key, g] of groups) {
        const cc = g.ids.size
        if (cc < 2) continue // 1名だけは「強い」と言えないので除外
        arr.push({
          key,
          customerCount: cc,
          totalSales: g.total,
          avgPerCustomer: cc > 0 ? Math.round(g.total / cc) : 0,
          repeatRate: cc > 0 ? Math.round((g.repeat / cc) * 100) : 0,
        })
      }
      return arr.sort((a, b) => b.totalSales - a.totalSales)
    }

    const buildSection = (
      label: string,
      emoji: string,
      getKey: (c: CustomerLite) => string | null | undefined,
    ): Section => {
      const sorted = aggregateBy(getKey).filter(g => g) as GroupStat[]
      const best = sorted[0] ?? null
      const secondBest = sorted[1] ?? null
      const total = sorted.reduce((s, g) => s + g.customerCount, 0)
      const description = best
        ? `${best.key} (${best.customerCount}名 / ¥${best.totalSales.toLocaleString()})`
        : 'データ不足'
      return { label, emoji, best, secondBest, total, description }
    }

    return [
      buildSection('ランク', '⭐', c => c.customer_rank),
      buildSection('地域', '📍', c => c.region),
      buildSection('年齢層', '🎂', c => extra.get(c.id)?.age_group),
      buildSection('職業', '💼', c => extra.get(c.id)?.occupation),
      buildSection('好みのタイプ', '💗', c => extra.get(c.id)?.favorite_type),
      buildSection('入口（指名ルート）', '🎯', c => extra.get(c.id)?.nomination_route),
      buildSection('指名状況', '🪑', c => c.nomination_status),
      buildSection('配偶者', '💍', c => extra.get(c.id)?.spouse_status),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, extra])

  // プロファイル文の生成（自然言語っぽく）
  const profileSentence = useMemo(() => {
    const ageBest = sections.find(s => s.label === '年齢層')?.best?.key
    const occBest = sections.find(s => s.label === '職業')?.best?.key
    const favBest = sections.find(s => s.label === '好みのタイプ')?.best?.key
    const regBest = sections.find(s => s.label === '地域')?.best?.key
    const nomBest = sections.find(s => s.label === '指名状況')?.best?.key
    const rankBest = sections.find(s => s.label === 'ランク')?.best?.key

    const parts: string[] = []
    if (ageBest) parts.push(ageBest)
    if (occBest) parts.push(occBest)
    if (favBest) parts.push(`${favBest}を好む`)
    if (regBest) parts.push(`${regBest}の`)
    if (nomBest) parts.push(nomBest)
    if (rankBest) parts.push(`${rankBest}ランク`)

    if (parts.length === 0) return null
    return parts.join('・').replace(/・の/g, 'の') + ' のお客様に強い'
  }, [sections])

  if (customers.length === 0) {
    return (
      <div style={{
        padding: 20, textAlign: 'center',
        background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12,
      }}>
        <div style={{ fontSize: 12, color: C.pinkMuted }}>
          担当顧客がいないため、おすすめ客像を生成できません。
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{
        padding: 20, textAlign: 'center',
        background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12,
      }}>
        <div style={{ fontSize: 12, color: C.pinkMuted }}>分析データを集計中...</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── ハイライト：1行プロファイル ── */}
      {profileSentence && (
        <div style={{
          background: 'linear-gradient(135deg, #FFF8EC 0%, #FFE9C8 100%)',
          border: '1px solid #E5B14C',
          borderRadius: 12,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 10, color: '#9C6300', marginBottom: 4, fontWeight: 600, letterSpacing: '0.05em' }}>
            ⭐ データから読み解く「おすすめ客像」
          </div>
          <div style={{ fontSize: isPC ? 18 : 16, fontWeight: 700, color: '#5C3A00', lineHeight: 1.5 }}>
            {profileSentence}
          </div>
          <div style={{ fontSize: 10, color: '#9C6300', marginTop: 6, fontStyle: 'italic' }}>
            ※ 担当顧客の累計売上ベースで算出。データが増えるほど精度が上がります。
          </div>
        </div>
      )}

      {/* ── 属性別ベストゾーン ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isPC ? (compact ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)') : 'repeat(2, 1fr)',
        gap: compact ? 6 : 10,
      }}>
        {sections.map((s, i) => (
          <SectionCard key={i} section={s} compact={compact} />
        ))}
      </div>

      {!compact && (
        <div style={{
          fontSize: 10, color: C.pinkMuted, padding: '8px 12px',
          background: C.miniBg, borderRadius: 8, border: `1px dashed ${C.border}`,
        }}>
          💡 各カテゴリで「最も売上が多いゾーン」を抽出しています。
          顧客が2名以上いるグループのみが対象。プロフィール属性が空欄の顧客は集計から除外されます。
          より精度を上げるには、新規顧客登録時に <strong>年齢層・職業・好みのタイプ</strong> を入力してください。
        </div>
      )}
    </div>
  )
}

// ─── サブコンポーネント ────────────────────────────────
function SectionCard({ section, compact }: { section: Section; compact: boolean }) {
  if (!section.best) {
    return (
      <div style={{
        background: C.miniBg, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: compact ? '8px 10px' : '10px 12px',
      }}>
        <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 2 }}>
          {section.emoji} {section.label}
        </div>
        <div style={{ fontSize: 11, color: C.pinkMuted, fontStyle: 'italic' }}>データ不足</div>
      </div>
    )
  }
  return (
    <div style={{
      background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 10,
      padding: compact ? '8px 10px' : '10px 12px',
    }}>
      <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 4 }}>
        {section.emoji} {section.label}
      </div>
      <div style={{
        fontSize: compact ? 12 : 14, fontWeight: 700,
        color: '#72243E', marginBottom: 4,
      }}>
        ⭐ {section.best.key}
      </div>
      <div style={{ fontSize: 9, color: C.pinkMuted, lineHeight: 1.4 }}>
        {section.best.customerCount}名 / 累計 ¥{section.best.totalSales.toLocaleString()}
        <br />
        1人平均 ¥{section.best.avgPerCustomer.toLocaleString()}
        {' / リピ率 '}
        <span style={{
          color: section.best.repeatRate >= 50 ? '#0F6E56'
            : section.best.repeatRate >= 25 ? '#B8860B' : C.pinkMuted,
          fontWeight: 600,
        }}>{section.best.repeatRate}%</span>
      </div>
      {!compact && section.secondBest && (
        <div style={{
          fontSize: 9, color: C.pinkMuted, marginTop: 6,
          paddingTop: 6, borderTop: `1px dashed ${C.border}`,
        }}>
          2位: {section.secondBest.key}（{section.secondBest.customerCount}名）
        </div>
      )}
    </div>
  )
}
