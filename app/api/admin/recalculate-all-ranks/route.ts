// ─────────────────────────────────────────────────────────────────
//  /api/admin/recalculate-all-ranks
//   全顧客のランクを V2 ロジックで一括再評価して DB に反映
//
//  POST → { dryRun?: boolean, targetRanks?: string[] }
//   dryRun=true なら差分を返すだけで DB は触らない (プレビュー用)
//   dryRun=false (デフォルト) で実際に customers.customer_rank を更新
//   targetRanks (v0.3.45-A): 現在ランクでの絞り込み。
//     許可値 'S'|'A'|'B'|'C'|'未設定' ('未設定' = customer_rank IS NULL)
//     未指定/null = 全対象 (従来互換)。空配列・不正値は 400。
//     '切れた' は許可値に含めない (常に自動変動の対象外)。
//
//  認証: is_owner または「ランク基準.設定」権限
//  処理: 全本指名顧客を対象 (場内・フリーは除外、ランクは本指名のみ意味あり)
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveRankRulesV2,
  calculateRankByRules,
} from '@/lib/rankCalculatorV2'
import type { RankCriteria, CustomerRank, CastProfile } from '@/types'

type CustomerRow = {
  id: string
  customer_name: string | null
  customer_rank: CustomerRank | null
  cast_name: string | null
  first_visit_date: string | null
}

type VisitRow = {
  customer_id: string
  visit_date: string
  amount_spent: number | null
  has_douhan: boolean | null
  has_after: boolean | null
}

export async function POST(request: Request) {
  try {
    await requirePermission('ランク基準.設定')

    const rawBody = await request.json().catch(() => ({}))
    // v0.3.45-B (P3): body が null / 文字列 / 配列でも 500 にせず空オブジェクト扱い
    const body = (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
      ? rawBody : {}) as Record<string, unknown>
    const dryRun = body.dryRun === true

    // ─── v0.3.45-A: 対象ランクフィルターのバリデーション ───
    //   フロントを信用せず、許可値以外は 400 で明示拒否
    const ALLOWED_TARGET_RANKS = ['S', 'A', 'B', 'C', '未設定']
    let targetRanks: string[] | null = null
    if (body.targetRanks !== undefined && body.targetRanks !== null) {
      if (!Array.isArray(body.targetRanks)) {
        return NextResponse.json({ error: 'targetRanks は配列で指定してください' }, { status: 400 })
      }
      if (body.targetRanks.length === 0) {
        return NextResponse.json({ error: '対象ランクが選択されていません' }, { status: 400 })
      }
      const invalid = (body.targetRanks as unknown[]).filter(
        (r) => typeof r !== 'string' || !ALLOWED_TARGET_RANKS.includes(r)
      )
      if (invalid.length > 0) {
        return NextResponse.json({ error: `不正な対象ランク: ${invalid.join(', ')}` }, { status: 400 })
      }
      targetRanks = Array.from(new Set(body.targetRanks as string[]))
    }

    const admin = createAdminClient()

    // ─── ① ランク基準 + キャストプロフィール ──────────────
    const [criteriaRes, castsRes] = await Promise.all([
      admin.from('rank_criteria').select('*'),
      admin.from('profiles').select('id, cast_name, cast_tier').eq('role', 'cast'),
    ])
    if (criteriaRes.error) throw criteriaRes.error
    if (castsRes.error) throw castsRes.error
    const allCriteria = (criteriaRes.data ?? []) as RankCriteria[]
    const casts = (castsRes.data ?? []) as Pick<CastProfile, 'id' | 'cast_name' | 'cast_tier'>[]
    // cast_name → { id, tier } マップ
    const castByName = new Map<string, { id: string; tier: string | null }>()
    for (const c of casts) {
      if (c.cast_name) castByName.set(c.cast_name, { id: c.id, tier: c.cast_tier ?? null })
    }

    // ─── ② 本指名顧客を全件取得 ───────────────────────────
    const customers: CustomerRow[] = []
    {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customers')
          .select('id, customer_name, customer_rank, cast_name, first_visit_date')
          .eq('nomination_status', '本指名')
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data ?? []) as CustomerRow[]
        customers.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }
    }

    if (customers.length === 0) {
      return NextResponse.json({
        ok: true, dryRun, targetRanks, totalCustomers: 0, v2Resolved: 0,
        filtered: 0, evaluated: 0, changed: 0,
        bySrcRank: {}, byDstRank: {}, sampleChanges: [],
      })
    }

    // ─── ②' ランクフィルター適用 (v0.3.45-A) ──────────────
    //   来店履歴の取得前に絞ってクエリ量も削減。
    //   '切れた' は従来どおり常に自動変動の対象外。
    const rankSet = targetRanks ? new Set(targetRanks) : null
    const filteredCustomers = customers.filter(c =>
      c.customer_rank !== '切れた' &&
      (!rankSet || rankSet.has(c.customer_rank ?? '未設定'))
    )

    // ─── ③ 来店履歴を一括取得 (フィルター通過分のみ) ───────
    const customerIds = filteredCustomers.map(c => c.id)
    const visitsByCustomer = new Map<string, VisitRow[]>()
    const PAGE = 1000
    const CHUNK = 500
    for (let i = 0; i < customerIds.length; i += CHUNK) {
      const chunk = customerIds.slice(i, i + CHUNK)
      let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customer_visits')
          .select('customer_id, visit_date, amount_spent, has_douhan, has_after')
          .in('customer_id', chunk)
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data ?? []) as VisitRow[]
        for (const v of batch) {
          const list = visitsByCustomer.get(v.customer_id) ?? []
          list.push(v)
          visitsByCustomer.set(v.customer_id, list)
        }
        if (batch.length < PAGE) break
        from += PAGE
      }
    }

    // ─── ④ 各顧客で V2 ランクを計算 ──────────────────────
    const today = new Date()
    type Change = {
      customerId: string
      customerName: string | null
      castName: string | null
      from: CustomerRank | null
      to: CustomerRank
    }
    let evaluated = 0
    let v2Resolved = 0
    const changes: Change[] = []

    for (const c of filteredCustomers) {
      // 「切れた」は自動変動の対象外。手動で別ランクに戻すまで '切れた' を維持。
      //   (filteredCustomers で除外済みだが二重防御として残置)
      if (c.customer_rank === '切れた') continue

      const castInfo = c.cast_name ? castByName.get(c.cast_name) : undefined
      const v2 = resolveRankRulesV2(
        allCriteria,
        castInfo?.id ?? null,
        castInfo?.tier ?? null,
      )
      if (!v2) {
        // V2 が未設定のスコープはスキップ (V1 廃止予定なので)
        continue
      }
      v2Resolved++
      evaluated++
      const visits = visitsByCustomer.get(c.id) ?? []
      const result = calculateRankByRules(
        { first_visit_date: c.first_visit_date, customer_rank: c.customer_rank },
        visits.map(v => ({
          visit_date: v.visit_date,
          amount_spent: v.amount_spent ?? 0,
          has_douhan: !!v.has_douhan,
          has_after: !!v.has_after,
        })),
        v2.rules,
        v2.criteria,
        today,
      )
      if (result.recommended !== c.customer_rank) {
        changes.push({
          customerId: c.id,
          customerName: c.customer_name,
          castName: c.cast_name,
          from: c.customer_rank,
          to: result.recommended,
        })
      }
    }

    // 集計
    const bySrcRank: Record<string, number> = {}
    const byDstRank: Record<string, number> = {}
    for (const ch of changes) {
      const key = `${ch.from ?? '—'}→${ch.to}`
      bySrcRank[key] = (bySrcRank[key] ?? 0) + 1
      byDstRank[ch.to] = (byDstRank[ch.to] ?? 0) + 1
    }

    // ─── ⑤ 実反映 (dryRun=false のみ) ─────────────────────
    if (!dryRun && changes.length > 0) {
      // バッチ update (50 件ずつ)
      const BATCH_UPDATE = 50
      for (let i = 0; i < changes.length; i += BATCH_UPDATE) {
        const batch = changes.slice(i, i + BATCH_UPDATE)
        await Promise.all(batch.map(ch =>
          admin.from('customers')
            .update({ customer_rank: ch.to })
            .eq('id', ch.customerId)
        ))
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      // v0.3.45-A: エコーバック。クライアントは実反映時にこの値をそのまま送り返す
      targetRanks,
      totalCustomers: customers.length,
      filtered: filteredCustomers.length,
      v2Resolved,
      evaluated,
      changed: changes.length,
      bySrcRank,
      byDstRank,
      sampleChanges: changes.slice(0, 20),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ランク基準.設定 権限が必要です' }, { status: 403 })
    }
    console.error('POST /api/admin/recalculate-all-ranks error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
