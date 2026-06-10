// ─────────────────────────────────────────────────────────────────
//  GET /api/customers/search — 顧客のサーバー側条件検索 (v0.3.48-B)
// ─────────────────────────────────────────────────────────────────
//  「初期表示で全顧客を取得しない」検索ファースト化の土台。
//  条件に合う顧客だけをサーバー側で絞り込んで返す。
//
//  クエリパラメータ (すべて任意。なし = 全件 = 「全員表示」ボタン用):
//   - keyword: 名前・ニックネームの部分一致 (大文字小文字無視)。v0.3.48-C2 追加。
//       PostgREST or() への ilike 文字列合成はエスケープ事故リスクがあるため、
//       SQL ではなくサーバー内 JS で判定する (注入リスクゼロ)。
//       重い visits 集計は keyword 通過後の母集団だけに走る
//   - area: 'fukuoka' (県内=福岡県) | 'outside' (県外) | 'unset' (未登録) の1つ
//       県内   = region が「福岡県」
//       県外   = region が入力済み (NULL・空文字でない) かつ「福岡県」以外
//       未登録 = region が NULL または空文字
//       ※ 県外に未登録は含めない (2026-06-11 拓馬さん決定)。region の必須化はしない
//   - nomination: '本指名,場内,フリー' のサブセット (カンマ区切り)
//   - ranks:      'S,A,B,C,切れた,未設定' のサブセット ('未設定' = customer_rank IS NULL)
//   - castName:   担当キャスト名 (完全一致)
//   - minAvgSpend:            客単価 ≥ N 円 (来店実績のある顧客のみ対象)
//   - minTotalSpent:          累計売上 ≥ N 円
//   - minDaysSinceLastVisit:  最終来店から ≥ N 日
//       ※ 来店記録ゼロの顧客は「未フォロー対象」として常にヒットさせる
//         (2026-06-11 拓馬さん決定: 検索から漏らさない)
//
//  処理は2段方式:
//   ① customers テーブルの列で絞れる条件を SQL (RLS クライアント) で絞る
//   ② ①の母集団だけ customer_visits を集計し、金額/日数条件で判定
//
//  返却: { conditions (エコーバック), total, customers: [{...顧客, metrics}] }
//   metrics = totalSpent / visitCount / avgPerVisit / lastVisitDate /
//             daysSinceLastVisit / firstVisitDate (NEWバッジ用)
//   → 検索UI (v0.3.48-C) はこの API 1本で badge-meta 相当の表示まで賄える
//
//  認可: 既存 GET /api/customers と同一
//   (cast = RLS で自分の担当のみ / staff = 顧客.閲覧 必須 / owner = 素通り)
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentProfile } from '@/lib/auth'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

// /api/customers の SUMMARY_COLUMNS と同等 + phase_shoshimei_at (NEWバッジ判定用)
const SEARCH_COLUMNS = [
  'id',
  'customer_name',
  'nickname',
  'cast_name',
  'cast_type',
  'has_customer_staff',
  'nomination_status',
  'age_group',
  'occupation',
  'region',
  'spouse_status',
  'birthday',
  'blood_type',
  'hobby',
  'nomination_route',
  'relationship_type',
  'phase',
  'phase_shoshimei_at',
  'customer_rank',
  'sales_expectation',
  'trend',
  'favorite_type',
  'score',
  'memo',
  'last_contact_date',
  'next_contact_date',
  'first_visit_date',
  'monthly_target_visits',
  'monthly_target_sales',
  'actual_visit_frequency',
  'sales_priority',
  'created_at',
].join(',')

const AREA_VALUES = ['fukuoka', 'outside', 'unset']
const NOMINATION_VALUES = ['フリー', '場内', '本指名']
const RANK_VALUES = ['S', 'A', 'B', 'C', '切れた', '未設定']
const FUKUOKA = '福岡県'

type VisitRow = {
  customer_id: string | number
  visit_date: string
  amount_spent: number | null
  is_first_visit: boolean | null
}

type Metrics = {
  totalSpent: number
  visitCount: number
  avgPerVisit: number
  lastVisitDate: string | null
  daysSinceLastVisit: number | null
  firstVisitDate: string | null
}

/** カンマ区切りパラメータ → 配列。未指定は null */
function parseList(raw: string | null): string[] | null {
  if (raw === null || raw === '') return null
  return Array.from(new Set(raw.split(',').map(s => s.trim()).filter(s => s !== '')))
}

/** 非負整数パラメータ。未指定は null、不正は NaN を返して呼び出し側で 400 */
function parseNonNegInt(raw: string | null): number | null {
  if (raw === null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return Number.NaN
  return n
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 既存 GET /api/customers と同じ権限ガード
    const profile = await getCurrentProfile()
    if (profile?.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.閲覧')
      if (!allowed) {
        return NextResponse.json({ error: '顧客.閲覧 の権限がありません' }, { status: 403 })
      }
    }

    // ─── パラメータ検証 (フロント不信用: 許可外は 400) ───
    const url = new URL(request.url)
    // v0.3.48-C2: keyword (名前・ニックネーム部分一致)。trim 後空なら未指定扱い
    const keywordRaw = url.searchParams.get('keyword')
    if (keywordRaw !== null && keywordRaw.length > 100) {
      return NextResponse.json({ error: 'keyword は 100 文字以内で指定してください' }, { status: 400 })
    }
    const keyword = keywordRaw !== null && keywordRaw.trim() !== '' ? keywordRaw.trim() : null
    const kwLower = keyword ? keyword.toLowerCase() : null
    const area = url.searchParams.get('area')
    if (area !== null && !AREA_VALUES.includes(area)) {
      return NextResponse.json({ error: `不正な area: ${area}` }, { status: 400 })
    }
    const nomination = parseList(url.searchParams.get('nomination'))
    if (nomination) {
      const bad = nomination.filter(v => !NOMINATION_VALUES.includes(v))
      if (bad.length > 0) {
        return NextResponse.json({ error: `不正な nomination: ${bad.join(', ')}` }, { status: 400 })
      }
    }
    const ranks = parseList(url.searchParams.get('ranks'))
    if (ranks) {
      const bad = ranks.filter(v => !RANK_VALUES.includes(v))
      if (bad.length > 0) {
        return NextResponse.json({ error: `不正な ranks: ${bad.join(', ')}` }, { status: 400 })
      }
    }
    const castName = url.searchParams.get('castName')
    if (castName !== null && (castName === '' || castName.length > 100)) {
      return NextResponse.json({ error: '不正な castName' }, { status: 400 })
    }
    const minAvgSpend = parseNonNegInt(url.searchParams.get('minAvgSpend'))
    const minTotalSpent = parseNonNegInt(url.searchParams.get('minTotalSpent'))
    const minDaysSinceLastVisit = parseNonNegInt(url.searchParams.get('minDaysSinceLastVisit'))
    if (Number.isNaN(minAvgSpend) || Number.isNaN(minTotalSpent) || Number.isNaN(minDaysSinceLastVisit)) {
      return NextResponse.json({ error: '金額・日数は 0 以上の整数で指定してください' }, { status: 400 })
    }

    // ─── ① customers 列で絞れる条件を SQL で適用 ───
    //   fetchAllPaginated はページごとにクエリを作り直すため builder 関数にする
    const buildQuery = () => {
      let q = supabase.from('customers').select(SEARCH_COLUMNS)
      if (area === 'fukuoka') q = q.eq('region', FUKUOKA)
      // 県外 = 入力済み (NULL でも空文字でもない) かつ 福岡県以外
      //   ※ .neq() だけだと空文字が「県外」に紛れ込むため、明示的に3条件で絞る
      if (area === 'outside') q = q.not('region', 'is', null).neq('region', '').neq('region', FUKUOKA)
      // 未登録 = NULL または空文字
      if (area === 'unset') q = q.or('region.is.null,region.eq.""')
      if (nomination) q = q.in('nomination_status', nomination)
      if (ranks) {
        const real = ranks.filter(r => r !== '未設定')
        const hasNull = ranks.includes('未設定')
        if (hasNull && real.length > 0) {
          // ⚠ .in() は NULL を拾わないため or で IS NULL を併用 (v0.3.45-B hotfix の学び)
          q = q.or(`customer_rank.in.(${real.map(r => `"${r}"`).join(',')}),customer_rank.is.null`)
        } else if (hasNull) {
          q = q.is('customer_rank', null)
        } else {
          q = q.in('customer_rank', real)
        }
      }
      if (castName !== null) q = q.eq('cast_name', castName)
      return q
    }

    const rows = await fetchAllPaginated<Record<string, unknown>>((from, to) =>
      buildQuery()
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>
    ).catch((e) => {
      console.error('GET /api/customers/search paginated fetch error:', e)
      return null
    })
    if (rows === null) {
      return NextResponse.json({ error: '顧客の検索に失敗しました' }, { status: 500 })
    }

    // ─── ①' keyword をサーバー内 JS で適用 (v0.3.48-C2) ───
    const matchedRows = kwLower
      ? rows.filter(r =>
          String((r.customer_name as string | null) ?? '').toLowerCase().includes(kwLower) ||
          String((r.nickname as string | null) ?? '').toLowerCase().includes(kwLower)
        )
      : rows

    const conditions = {
      keyword,
      area: area ?? null,
      nomination: nomination ?? null,
      ranks: ranks ?? null,
      castName: castName ?? null,
      minAvgSpend: minAvgSpend ?? null,
      minTotalSpent: minTotalSpent ?? null,
      minDaysSinceLastVisit: minDaysSinceLastVisit ?? null,
    }

    if (matchedRows.length === 0) {
      return NextResponse.json({ conditions, total: 0, customers: [] }, {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
          'Vary': 'Cookie',
        },
      })
    }

    // ─── ② 母集団の来店履歴を chunk 集計 → metrics 算出 ───
    const ids = matchedRows.map(r => String(r.id))
    const aggById = new Map<string, { total: number; count: number; last: string | null; first: string | null }>()
    const CHUNK = 200
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const visits = await fetchAllPaginated<VisitRow>((from, to) =>
        supabase
          .from('customer_visits')
          .select('customer_id, visit_date, amount_spent, is_first_visit')
          .in('customer_id', chunk)
          .range(from, to)
      ).catch(() => [] as VisitRow[])
      for (const v of visits) {
        const key = String(v.customer_id)
        const agg = aggById.get(key) ?? { total: 0, count: 0, last: null, first: null }
        agg.total += v.amount_spent ?? 0
        agg.count += 1
        if (!agg.last || v.visit_date > agg.last) agg.last = v.visit_date
        if (v.is_first_visit === true && (!agg.first || v.visit_date < agg.first)) agg.first = v.visit_date
        aggById.set(key, agg)
      }
    }

    const now = Date.now()
    const dayMs = 1000 * 60 * 60 * 24
    const result: Array<Record<string, unknown> & { metrics: Metrics }> = []
    for (const row of matchedRows) {
      const agg = aggById.get(String(row.id)) ?? { total: 0, count: 0, last: null, first: null }
      const daysSinceLastVisit = agg.last !== null
        ? Math.floor((now - new Date(agg.last).getTime()) / dayMs)
        : null

      // 集計条件の判定
      //  - 客単価: 来店実績のある顧客のみ対象 (来店ゼロでは単価が定義できない)
      if (minAvgSpend !== null && (agg.count === 0 || Math.round(agg.total / agg.count) < minAvgSpend)) continue
      //  - 累計売上
      if (minTotalSpent !== null && agg.total < minTotalSpent) continue
      //  - 最終来店日数: 来店記録ゼロ (daysSinceLastVisit=null) は常にヒット (未フォロー対象)
      if (minDaysSinceLastVisit !== null && daysSinceLastVisit !== null && daysSinceLastVisit < minDaysSinceLastVisit) continue

      result.push({
        ...row,
        metrics: {
          totalSpent: agg.total,
          visitCount: agg.count,
          avgPerVisit: agg.count > 0 ? Math.round(agg.total / agg.count) : 0,
          lastVisitDate: agg.last,
          daysSinceLastVisit,
          firstVisitDate: agg.first,
        },
      })
    }

    // 並び: 累計売上の高い順 (C 側で並び替え UI を付けるまでの既定値)
    result.sort((a, b) => b.metrics.totalSpent - a.metrics.totalSpent)

    return NextResponse.json({ conditions, total: result.length, customers: result }, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        'Vary': 'Cookie',
      },
    })
  } catch (err) {
    console.error('GET /api/customers/search unexpected error:', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
