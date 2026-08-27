// GET /api/customers/search
// 顧客条件・来店集計・表示調整をDBで絞り、一覧に必要な1ページだけ返す。
// 認証・権限・担当範囲を先に確定し、重い集計ビューだけ service_role で実行する。
// キャストは自分の cast_name を必ず追加条件にするため、従来のRLS可視範囲を維持する。
import { NextResponse } from 'next/server'
import { checkPermission, getCurrentProfile } from '@/lib/auth'
import { resolveCustomerQueryScope } from '@/lib/customerQueryScope'
import { getJstDateString } from '@/lib/followUpWorkflow'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  CUSTOMER_SEARCH_SORT_OPTIONS,
  SORTABLE_VISIT_WEEKDAY_CODES,
  getWeekdaySortCode,
  type CustomerSortKey,
  type CustomerVisitPattern,
  type VisitPatternHour,
} from '@/lib/customerVisitPattern'

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
  'metric_total_spent',
  'metric_visit_count',
  'metric_avg_per_visit',
  'metric_last_visit_date',
  'metric_first_visit_date',
  'metric_pattern_visit_count',
  'metric_pattern_weekday_codes',
  'metric_pattern_early_hour',
  'metric_pattern_early_hour_count',
  'metric_pattern_early_last_visit_date',
  'metric_pattern_usual_hour',
  'metric_pattern_usual_hour_count',
  'metric_early_time_sort',
  ...SORTABLE_VISIT_WEEKDAY_CODES.flatMap(weekdayCode => [
    `metric_pattern_weekday_${weekdayCode}_count`,
    `metric_pattern_weekday_${weekdayCode}_last_visit_date`,
  ]),
].join(',')

const AREA_VALUES = ['fukuoka', 'outside', 'unset']
const NOMINATION_VALUES = ['フリー', '場内', '本指名']
const RANK_VALUES = ['S', 'A', 'B', 'C', '切れた', '未設定']
const STAFF_VALUES = ['yes', 'no']
const INCOMPLETE_VALUES = ['incomplete', 'complete']
const CONTACT_DAYS_VALUES = ['3', '7', '14', '30+', 'none']
const SORT_VALUES = [
  ...CUSTOMER_SEARCH_SORT_OPTIONS.map(option => option.key),
  'lastVisit', // v0.3.57 以前のURL互換
]
const FUKUOKA = '福岡県'
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

type Metrics = {
  totalSpent: number
  visitCount: number
  avgPerVisit: number
  lastVisitDate: string | null
  daysSinceLastVisit: number | null
  firstVisitDate: string | null
  visitPattern: CustomerVisitPattern
}

type SearchRow = Record<string, unknown> & {
  id: string | number
  metric_total_spent: number | string | null
  metric_visit_count: number | string | null
  metric_avg_per_visit: number | string | null
  metric_last_visit_date: string | null
  metric_first_visit_date: string | null
  metric_pattern_visit_count: number | string | null
  metric_pattern_weekday_codes: number[] | null
  metric_pattern_early_hour: number | string | null
  metric_pattern_early_hour_count: number | string | null
  metric_pattern_early_last_visit_date: string | null
  metric_pattern_usual_hour: number | string | null
  metric_pattern_usual_hour_count: number | string | null
}

type FollowUpMeta = {
  customer_id: string | number
  next_actions: string[]
  return_visit_deadline: string | null
  last_contacted_at: string | null
}

function parseList(raw: string | null): string[] | null {
  if (raw === null || raw === '') return null
  return Array.from(new Set(raw.split(',').map(value => value.trim()).filter(Boolean)))
}

function parseNonNegInt(raw: string | null): number | null {
  if (raw === null || raw === '') return null
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return Number.NaN
  return parsed
}

function parsePositiveInt(raw: string | null, fallback: number): number | null {
  if (raw === null || raw === '') return fallback
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

function dateDaysAgo(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await getCurrentProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile?.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.閲覧')
      if (!allowed) {
        return NextResponse.json({ error: '顧客.閲覧 の権限がありません' }, { status: 403 })
      }
    }
    const { searchParams } = new URL(request.url)
    const keywordRaw = searchParams.get('keyword')
    if (keywordRaw !== null && keywordRaw.length > 100) {
      return NextResponse.json({ error: 'keyword は 100 文字以内で指定してください' }, { status: 400 })
    }
    const keyword = keywordRaw?.trim() || null
    const area = searchParams.get('area')
    if (area !== null && !AREA_VALUES.includes(area)) {
      return NextResponse.json({ error: `不正な area: ${area}` }, { status: 400 })
    }
    const nomination = parseList(searchParams.get('nomination'))
    if (nomination?.some(value => !NOMINATION_VALUES.includes(value))) {
      return NextResponse.json({ error: '不正な nomination' }, { status: 400 })
    }
    const ranks = parseList(searchParams.get('ranks'))
    if (ranks?.some(value => !RANK_VALUES.includes(value))) {
      return NextResponse.json({ error: '不正な ranks' }, { status: 400 })
    }
    const castName = searchParams.get('castName')
    if (castName !== null && (castName === '' || castName.length > 100)) {
      return NextResponse.json({ error: '不正な castName' }, { status: 400 })
    }
    const customerScope = resolveCustomerQueryScope(profile, castName)
    if (!customerScope.ok) {
      return NextResponse.json({ error: '担当キャスト名が設定されていません' }, { status: 403 })
    }

    const minAvgSpend = parseNonNegInt(searchParams.get('minAvgSpend'))
    const minTotalSpent = parseNonNegInt(searchParams.get('minTotalSpent'))
    const minDaysSinceLastVisit = parseNonNegInt(searchParams.get('minDaysSinceLastVisit'))
    if ([minAvgSpend, minTotalSpent, minDaysSinceLastVisit].some(Number.isNaN)) {
      return NextResponse.json({ error: '金額・日数は 0 以上の整数で指定してください' }, { status: 400 })
    }

    const staff = searchParams.get('staff') ?? ''
    const incomplete = searchParams.get('incomplete') ?? ''
    const contactDays = searchParams.get('contactDays') ?? ''
    const sort = searchParams.get('sort') ?? 'name'
    if (staff && !STAFF_VALUES.includes(staff)) {
      return NextResponse.json({ error: '不正な staff' }, { status: 400 })
    }
    if (incomplete && !INCOMPLETE_VALUES.includes(incomplete)) {
      return NextResponse.json({ error: '不正な incomplete' }, { status: 400 })
    }
    if (contactDays && !CONTACT_DAYS_VALUES.includes(contactDays)) {
      return NextResponse.json({ error: '不正な contactDays' }, { status: 400 })
    }
    if (!SORT_VALUES.includes(sort)) {
      return NextResponse.json({ error: '不正な sort' }, { status: 400 })
    }

    const page = parsePositiveInt(searchParams.get('page'), 1)
    const requestedPageSize = parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)
    if (page === null || requestedPageSize === null) {
      return NextResponse.json({ error: 'ページ指定が正しくありません' }, { status: 400 })
    }
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE)
    const today = getJstDateString()

    // customer_search_metrics は来店傾向の window 集計を含み、RLS関数を各行で
    // 評価すると数秒かかる。APIで本人確認・権限確認を終えた後、集計だけを
    // service_role で実行し、下記で従来と同じ担当範囲を明示する。
    const metricsClient = createAdminClient()
    let query = metricsClient
      .from('customer_search_metrics_with_bottles')
      .select(SEARCH_COLUMNS, { count: 'exact' })

    if (keyword) {
      query = query.ilike('search_text_with_bottles', `%${escapeLikePattern(keyword)}%`)
    }
    if (area === 'fukuoka') query = query.eq('region', FUKUOKA)
    if (area === 'outside') {
      query = query.not('region', 'is', null).neq('region', '').neq('region', FUKUOKA)
    }
    if (area === 'unset') query = query.or('region.is.null,region.eq.""')
    if (nomination) query = query.in('nomination_status', nomination)
    if (ranks) {
      const realRanks = ranks.filter(rank => rank !== '未設定')
      const includesUnset = ranks.includes('未設定')
      if (includesUnset && realRanks.length > 0) {
        query = query.or(
          `customer_rank.in.(${realRanks.map(rank => `"${rank}"`).join(',')}),customer_rank.is.null`,
        )
      } else if (includesUnset) {
        query = query.is('customer_rank', null)
      } else {
        query = query.in('customer_rank', realRanks)
      }
    }
    // 同じ列へ複数条件を付けることで、キャストがURLを書き換えた場合も
    // 従来の「本人担当 AND 指定担当」= 0件という挙動を維持する。
    for (const scopedCastName of customerScope.castNames) {
      query = query.eq('cast_name', scopedCastName)
    }
    if (minAvgSpend !== null) {
      query = query.gt('metric_visit_count', 0).gte('metric_avg_per_visit', minAvgSpend)
    }
    if (minTotalSpent !== null) {
      query = query.gte('metric_total_spent', minTotalSpent)
    }
    if (minDaysSinceLastVisit !== null) {
      const cutoff = dateDaysAgo(today, minDaysSinceLastVisit)
      query = query.or(`metric_last_visit_date.is.null,metric_last_visit_date.lte.${cutoff}`)
    }
    if (staff === 'yes') query = query.eq('has_customer_staff', true)
    if (staff === 'no') query = query.eq('has_customer_staff', false)
    if (incomplete === 'incomplete') query = query.eq('has_incomplete_profile', true)
    if (incomplete === 'complete') query = query.eq('has_incomplete_profile', false)
    if (contactDays === 'none') query = query.is('last_contact_date', null)
    if (contactDays && contactDays !== 'none') {
      const days = contactDays === '30+' ? 30 : Number(contactDays)
      query = query.lte('last_contact_date', dateDaysAgo(today, days))
    }

    const weekdaySortCode = getWeekdaySortCode(sort as CustomerSortKey)
    if (sort === 'rank') {
      query = query.order('rank_sort', { ascending: true })
    } else if (sort === 'lastVisit' || sort === 'lastContact') {
      query = query.order('last_contact_date', { ascending: false, nullsFirst: false })
    } else if (sort === 'nomination') {
      query = query.order('nomination_sort', { ascending: true })
    } else if (sort === 'earlyTime') {
      query = query
        .order('metric_early_time_sort', { ascending: true })
        .order('metric_pattern_early_hour_count', { ascending: false })
        .order('metric_pattern_early_last_visit_date', { ascending: false, nullsFirst: false })
    } else if (weekdaySortCode !== null) {
      query = query
        .order(`metric_pattern_weekday_${weekdaySortCode}_count`, { ascending: false })
        .order(`metric_pattern_weekday_${weekdaySortCode}_last_visit_date`, {
          ascending: false,
          nullsFirst: false,
        })
    } else if (sort === 'lastVisitOldest') {
      query = query.order('metric_last_visit_date', { ascending: true, nullsFirst: true })
    } else if (sort === 'lastVisitNewest') {
      query = query.order('metric_last_visit_date', { ascending: false, nullsFirst: false })
    } else if (sort === 'totalSpent') {
      query = query.order('metric_total_spent', { ascending: false })
    } else if (sort === 'visitCount') {
      query = query.order('metric_visit_count', { ascending: false })
    } else if (sort === 'avgSpend') {
      query = query.order('metric_avg_per_visit', { ascending: false })
    } else {
      query = query.order('customer_name', { ascending: true, nullsFirst: true })
    }
    query = query
      .order('metric_total_spent', { ascending: false })
      .order('id', { ascending: true })

    const from = (page - 1) * pageSize
    const { data, error, count } = await query.range(from, from + pageSize - 1)
    if (error) {
      console.error('GET /api/customers/search query error:', error)
      return NextResponse.json({ error: '顧客の検索に失敗しました' }, { status: 500 })
    }

    const now = Date.now()
    const dayMs = 1000 * 60 * 60 * 24
    const rows = (data as unknown as SearchRow[] | null) ?? []
    const customersWithMetrics: Array<Record<string, unknown> & { metrics: Metrics }> = rows.map(row => {
      const lastVisitDate = row.metric_last_visit_date
      const weekdayStats: NonNullable<CustomerVisitPattern['weekdayStats']> = {}
      for (const weekdayCode of SORTABLE_VISIT_WEEKDAY_CODES) {
        const count = Number(row[`metric_pattern_weekday_${weekdayCode}_count`] ?? 0)
        const lastDateValue = row[`metric_pattern_weekday_${weekdayCode}_last_visit_date`]
        const lastVisitDateForWeekday = typeof lastDateValue === 'string' ? lastDateValue : null
        if (count > 0 || lastVisitDateForWeekday !== null) {
          weekdayStats[weekdayCode] = {
            count,
            lastVisitDate: lastVisitDateForWeekday,
          }
        }
      }
      const metrics: Metrics = {
        totalSpent: Number(row.metric_total_spent ?? 0),
        visitCount: Number(row.metric_visit_count ?? 0),
        avgPerVisit: Number(row.metric_avg_per_visit ?? 0),
        lastVisitDate,
        daysSinceLastVisit: lastVisitDate
          ? Math.floor((now - new Date(lastVisitDate).getTime()) / dayMs)
          : null,
        firstVisitDate: row.metric_first_visit_date,
        visitPattern: {
          sampleVisitCount: Number(row.metric_pattern_visit_count ?? 0),
          weekdayCodes: Array.isArray(row.metric_pattern_weekday_codes)
            ? row.metric_pattern_weekday_codes.map(Number).filter(Number.isFinite)
            : [],
          weekdayStats,
          earlyHour: row.metric_pattern_early_hour == null
            ? null
            : Number(row.metric_pattern_early_hour) as VisitPatternHour,
          earlyHourCount: Number(row.metric_pattern_early_hour_count ?? 0),
          earlyHourLastVisitDate: row.metric_pattern_early_last_visit_date,
          usualHour: row.metric_pattern_usual_hour == null
            ? null
            : Number(row.metric_pattern_usual_hour) as VisitPatternHour,
          usualHourCount: Number(row.metric_pattern_usual_hour_count ?? 0),
        },
      }
      const customer: Record<string, unknown> = { ...row }
      delete customer.metric_total_spent
      delete customer.metric_visit_count
      delete customer.metric_avg_per_visit
      delete customer.metric_last_visit_date
      delete customer.metric_first_visit_date
      delete customer.metric_pattern_visit_count
      delete customer.metric_pattern_weekday_codes
      delete customer.metric_pattern_early_hour
      delete customer.metric_pattern_early_hour_count
      delete customer.metric_pattern_early_last_visit_date
      delete customer.metric_pattern_usual_hour
      delete customer.metric_pattern_usual_hour_count
      delete customer.metric_early_time_sort
      for (const weekdayCode of SORTABLE_VISIT_WEEKDAY_CODES) {
        delete customer[`metric_pattern_weekday_${weekdayCode}_count`]
        delete customer[`metric_pattern_weekday_${weekdayCode}_last_visit_date`]
      }
      return { ...customer, metrics }
    })

    const followUpByCustomerId = new Map<string, Omit<FollowUpMeta, 'customer_id'>>()
    const ids = customersWithMetrics.map(row => String(row.id))
    if (ids.length > 0) {
      const { data: followUps, error: followUpError } = await supabase
        .from('customer_follow_ups')
        .select('customer_id, next_actions, return_visit_deadline, last_contacted_at')
        .eq('is_active', true)
        .in('customer_id', ids)
      if (followUpError) {
        console.error('GET /api/customers/search follow-up error:', followUpError)
      } else {
        for (const followUp of (followUps as FollowUpMeta[] | null) ?? []) {
          followUpByCustomerId.set(String(followUp.customer_id), {
            next_actions: followUp.next_actions,
            return_visit_deadline: followUp.return_visit_deadline,
            last_contacted_at: followUp.last_contacted_at,
          })
        }
      }
    }

    const customers = customersWithMetrics.map(row => ({
      ...row,
      followUp: followUpByCustomerId.get(String(row.id)) ?? null,
    }))
    const total = count ?? 0
    const pageCount = Math.max(1, Math.ceil(total / pageSize))

    return NextResponse.json({
      conditions: {
        keyword,
        area: area ?? null,
        nomination,
        ranks,
        castName: castName ?? null,
        minAvgSpend,
        minTotalSpent,
        minDaysSinceLastVisit,
        staff: staff || null,
        incomplete: incomplete || null,
        contactDays: contactDays || null,
        sort,
      },
      total,
      page,
      pageSize,
      pageCount,
      customers,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        'Vary': 'Cookie',
      },
    })
  } catch (error) {
    console.error('GET /api/customers/search unexpected error:', error)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
