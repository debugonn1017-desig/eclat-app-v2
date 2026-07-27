import { NextResponse } from 'next/server'
import { checkPermission, requireUser } from '@/lib/auth'
import {
  CORE_CUSTOMER_FIELDS,
  type CoreCustomerFieldKey,
} from '@/lib/coreCustomerFields'
import { createClient } from '@/lib/supabase/server'

type QualityRow = {
  id: number | string
  customer_name: string | null
  nickname: string | null
  nomination_status: string | null
  customer_rank: string | null
  cast_name: string | null
  missing_fields: CoreCustomerFieldKey[]
}

// フリーは画面の選択肢から外すが、旧URLとの互換性のため入力値としては受理する。
// view 側で判定対象外になるため、指定された場合も不足顧客は0件になる。
const NOMINATION_FILTERS = new Set(['本指名', '場内', 'フリー', '未設定'])
const FIELD_KEYS = new Set<CoreCustomerFieldKey>(
  CORE_CUSTOMER_FIELDS.map(field => field.key),
)
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

function parsePositiveInteger(value: string | null, fallback: number): number | null {
  if (value === null || value === '') return fallback
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

export async function GET(request: Request) {
  try {
    const profile = await requireUser()
    const isAdmin = profile.role === 'admin'
    if (isAdmin && !profile.is_owner && !(await checkPermission('顧客.閲覧'))) {
      return NextResponse.json({ error: '顧客.閲覧の権限がありません' }, { status: 403 })
    }
    if (!isAdmin && !profile.cast_name) {
      return NextResponse.json({ error: '担当キャスト名が設定されていません' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parsePositiveInteger(searchParams.get('page'), 1)
    const requestedPageSize = parsePositiveInteger(
      searchParams.get('pageSize'),
      DEFAULT_PAGE_SIZE,
    )
    if (page === null || requestedPageSize === null) {
      return NextResponse.json({ error: 'ページ指定が正しくありません' }, { status: 400 })
    }
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE)
    const keyword = (searchParams.get('keyword') ?? '').trim()
    // キャストはURLを書き換えても自分の担当以外を指定できないよう、API側で担当名に固定する。
    // customer_core_quality のRLSと合わせた二重防御。
    const castName = isAdmin
      ? (searchParams.get('castName') ?? '')
      : profile.cast_name!
    const nomination = searchParams.get('nomination') ?? ''
    const missingField = searchParams.get('missingField') ?? ''

    if (keyword.length > 100) {
      return NextResponse.json({ error: '検索文字は100文字以内で入力してください' }, { status: 400 })
    }
    if (nomination && !NOMINATION_FILTERS.has(nomination)) {
      return NextResponse.json({ error: '指名状況の指定が正しくありません' }, { status: 400 })
    }
    if (missingField && !FIELD_KEYS.has(missingField as CoreCustomerFieldKey)) {
      return NextResponse.json({ error: '不足項目の指定が正しくありません' }, { status: 400 })
    }

    const supabase = await createClient()
    let itemsQuery = supabase
      .from('customer_core_quality')
      .select(
        'id, customer_name, nickname, nomination_status, customer_rank, cast_name, missing_fields',
        { count: 'exact' },
      )
      .eq('is_incomplete', true)

    if (castName === '__unassigned__') {
      itemsQuery = itemsQuery.or('cast_name.is.null,cast_name.eq.')
    } else if (castName) {
      itemsQuery = itemsQuery.eq('cast_name', castName)
    }
    if (nomination === '未設定') {
      itemsQuery = itemsQuery.or('nomination_status.is.null,nomination_status.eq.')
    } else if (nomination) {
      itemsQuery = itemsQuery.eq('nomination_status', nomination)
    }
    if (missingField) {
      itemsQuery = itemsQuery.contains(
        'missing_fields',
        [missingField as CoreCustomerFieldKey],
      )
    }
    if (keyword) {
      itemsQuery = itemsQuery.ilike(
        'search_text',
        `%${escapeLikePattern(keyword)}%`,
      )
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    let castsQuery = supabase
      .from('profiles')
      .select('cast_name, display_name')
      .eq('role', 'cast')
      .eq('is_active', true)
      .order('cast_name', { ascending: true })
    if (!isAdmin) {
      castsQuery = castsQuery.eq('id', profile.id)
    }

    const [countsResult, castsResult, itemsResult] = await Promise.all([
      supabase.rpc('get_customer_core_quality_counts').single(),
      castsQuery,
      itemsQuery
        .order('id', { ascending: true })
        .range(from, to),
    ])

    if (countsResult.error) throw new Error(countsResult.error.message)
    if (castsResult.error) throw new Error(castsResult.error.message)
    if (itemsResult.error) throw new Error(itemsResult.error.message)

    const countRow = countsResult.data as {
      total_customers?: number | string | null
      incomplete_customers?: number | string | null
      missing_counts?: Partial<Record<CoreCustomerFieldKey, number | string>> | null
    } | null
    const totalCustomers = Number(countRow?.total_customers ?? 0)
    const incompleteCustomers = Number(countRow?.incomplete_customers ?? 0)
    const missingCounts = Object.fromEntries(
      CORE_CUSTOMER_FIELDS.map(field => [
        field.key,
        Number(countRow?.missing_counts?.[field.key] ?? 0),
      ]),
    ) as Record<CoreCustomerFieldKey, number>
    const labelByKey = new Map(
      CORE_CUSTOMER_FIELDS.map(field => [field.key, field.label]),
    )
    const items = (itemsResult.data as QualityRow[] | null ?? []).map(customer => ({
      ...customer,
      id: String(customer.id),
      missing_labels: customer.missing_fields.map(field => labelByKey.get(field) ?? field),
    }))
    const filteredTotal = itemsResult.count ?? 0
    const pageCount = Math.max(1, Math.ceil(filteredTotal / pageSize))

    return NextResponse.json({
      is_admin: isAdmin,
      can_filter_casts: isAdmin,
      total_customers: totalCustomers,
      incomplete_customers: incompleteCustomers,
      complete_customers: totalCustomers - incompleteCustomers,
      missing_counts: missingCounts,
      fields: CORE_CUSTOMER_FIELDS,
      casts: (castsResult.data ?? [])
        .filter(cast => cast.cast_name)
        .map(cast => ({
          cast_name: cast.cast_name,
          display_name: cast.display_name,
        })),
      filtered_total: filteredTotal,
      page,
      page_size: pageSize,
      page_count: pageCount,
      items,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '取得に失敗しました'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    console.error('GET /api/data-quality error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
