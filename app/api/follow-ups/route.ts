import { NextResponse } from 'next/server'
import { checkPermission, getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import {
  buildFollowUpCandidates,
  type FollowUpCandidateCustomer,
  type FollowUpCandidateVisit,
} from '@/lib/followUpCandidates'
import {
  getJstDateString,
  isFollowUpActionItems,
  isFollowUpNextAction,
  isReturnVisitDeadlinePreset,
  isSalesContactIntervalDays,
  resolveReturnVisitDeadline,
  type FollowUpActionItem,
  type FollowUpNextAction,
  type ReturnVisitDeadlinePreset,
  type SalesContactIntervalDays,
} from '@/lib/followUpWorkflow'

type FollowUpRow = {
  id: string
  customer_id: number | string
  cast_id: string
  note: string | null
  next_action: FollowUpNextAction | null
  next_contact_date: string | null
  next_actions: FollowUpActionItem[]
  return_visit_deadline: string | null
  return_visit_deadline_preset: ReturnVisitDeadlinePreset | null
  sales_contact_interval_days: SalesContactIntervalDays | null
  is_active: boolean
  last_contacted_at: string | null
  last_contacted_by: string | null
  added_by: string | null
  activated_at: string
  activated_by: string | null
  removed_at: string | null
  removed_by: string | null
  created_at: string
  updated_at: string
}

type CustomerSummary = FollowUpCandidateCustomer & {
  phase: string | null
  cast_name: string | null
}

type CastSummary = {
  id: string
  cast_name: string | null
  display_name: string | null
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '予期しないエラーが発生しました'
  return NextResponse.json({ error: message }, { status: 500 })
}

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('次回連絡日は YYYY-MM-DD 形式で指定してください')
  }
  return value
}

function parseOptionalNextAction(value: unknown): FollowUpNextAction | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (!isFollowUpNextAction(value)) {
    throw new Error('次の行動を選び直してください')
  }
  return value
}

function parseOptionalActionItems(value: unknown): FollowUpActionItem[] | undefined {
  if (value === undefined) return undefined
  if (value === null) return []
  if (!isFollowUpActionItems(value)) {
    throw new Error('次の行動を選び直してください')
  }
  return value
}

function parseOptionalReturnVisitPreset(
  value: unknown,
): ReturnVisitDeadlinePreset | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (!isReturnVisitDeadlinePreset(value)) {
    throw new Error('再来店期限を選び直してください')
  }
  return value
}

function parseOptionalSalesInterval(
  value: unknown,
): SalesContactIntervalDays | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (!isSalesContactIntervalDays(value)) {
    throw new Error('営業連絡間隔を選び直してください')
  }
  return value
}

async function canUseFollowUps(edit: boolean): Promise<{
  profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>
} | { response: NextResponse }> {
  const profile = await getCurrentProfile()
  if (!profile) {
    return { response: NextResponse.json({ error: 'ログインが必要です' }, { status: 401 }) }
  }
  if (profile.role === 'admin' && !profile.is_owner) {
    const allowed = await checkPermission(edit ? '顧客.編集' : '顧客.閲覧')
    if (!allowed) {
      return {
        response: NextResponse.json(
          { error: edit ? '顧客.編集の権限がありません' : '顧客.閲覧の権限がありません' },
          { status: 403 },
        ),
      }
    }
  }
  return { profile }
}

async function loadCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  castName: string,
  activeCustomerIds: Set<string>,
) {
  const { data: customerData, error: customerError } = await supabase
    .from('customers')
    .select('id, customer_name, nickname, customer_rank, nomination_status, region')
    .eq('cast_name', castName)
    .in('customer_rank', ['A', 'B'])

  if (customerError) throw customerError
  const customers = (customerData ?? []).map(row => ({
    ...row,
    id: String(row.id),
  })) as FollowUpCandidateCustomer[]
  const customerIds = customers.map(customer => customer.id)
  if (customerIds.length === 0) return []

  const visits: FollowUpCandidateVisit[] = []
  const chunkSize = 200
  for (let index = 0; index < customerIds.length; index += chunkSize) {
    const ids = customerIds.slice(index, index + chunkSize)
    const chunk = await fetchAllPaginated<FollowUpCandidateVisit>((from, to) =>
      supabase
        .from('customer_visits')
        .select('customer_id, visit_date, amount_spent')
        .in('customer_id', ids)
        .order('visit_date', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
          data: FollowUpCandidateVisit[] | null
          error: { message?: string } | null
        }>,
    )
    visits.push(...chunk.map(visit => ({ ...visit, customer_id: String(visit.customer_id) })))
  }

  return buildFollowUpCandidates(customers, visits, activeCustomerIds)
}

export async function GET(request: Request) {
  try {
    const access = await canUseFollowUps(false)
    if ('response' in access) return access.response
    const { profile } = access
    const supabase = await createClient()
    const url = new URL(request.url)
    const requestedCastId = url.searchParams.get('castId')
    const includeCandidates = url.searchParams.get('includeCandidates') !== '0'

    let selectedCast: CastSummary | null = null
    if (profile.role === 'cast') {
      selectedCast = {
        id: profile.id,
        cast_name: profile.cast_name,
        display_name: profile.display_name,
      }
    } else if (requestedCastId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, cast_name, display_name')
        .eq('id', requestedCastId)
        .eq('role', 'cast')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        return NextResponse.json({ error: '指定したキャストが見つかりません' }, { status: 404 })
      }
      selectedCast = data as CastSummary
    }

    let followUpQuery = supabase
      .from('customer_follow_ups')
      .select('*')
      .order('is_active', { ascending: false })
      .order('return_visit_deadline', { ascending: true, nullsFirst: false })
      .order('activated_at', { ascending: false })

    if (selectedCast) followUpQuery = followUpQuery.eq('cast_id', selectedCast.id)
    const { data: followUpData, error: followUpError } = await followUpQuery
    if (followUpError) throw followUpError
    const rows = (followUpData ?? []) as FollowUpRow[]

    const customerIds = [...new Set(rows.map(row => String(row.customer_id)))]
    const castIds = [...new Set(rows.map(row => row.cast_id))]
    const customerMap = new Map<string, CustomerSummary>()
    const castMap = new Map<string, CastSummary>()

    if (customerIds.length > 0) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_name, nickname, customer_rank, nomination_status, region, phase, cast_name')
        .in('id', customerIds)
      if (error) throw error
      for (const customer of (data ?? []) as Array<Omit<CustomerSummary, 'id'> & { id: string | number }>) {
        customerMap.set(String(customer.id), { ...customer, id: String(customer.id) })
      }
    }

    if (castIds.length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, cast_name, display_name')
        .in('id', castIds)
      if (error) throw error
      for (const cast of (data ?? []) as CastSummary[]) castMap.set(cast.id, cast)
    }

    const items = rows
      .map(row => {
        const customer = customerMap.get(String(row.customer_id))
        if (!customer) return null
        const assignedCast = castMap.get(row.cast_id) ?? null
        return {
          ...row,
          customer_id: String(row.customer_id),
          customer,
          cast: assignedCast,
          assignment_current: Boolean(
            assignedCast?.cast_name
            && customer.cast_name
            && assignedCast.cast_name === customer.cast_name
          ),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    const activeCustomerIds = new Set(
      rows.filter(row => row.is_active).map(row => String(row.customer_id)),
    )
    const candidates = includeCandidates && selectedCast?.cast_name
      ? await loadCandidates(supabase, selectedCast.cast_name, activeCustomerIds)
      : []

    return NextResponse.json({
      items,
      candidates,
      selected_cast_id: selectedCast?.id ?? null,
      candidate_scope_required: profile.role === 'admin' && !selectedCast,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      },
    })
  } catch (error) {
    console.error('GET /api/follow-ups error:', error)
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const access = await canUseFollowUps(true)
    if ('response' in access) return access.response
    const { profile } = access
    const supabase = await createClient()
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '入力内容が不正です' }, { status: 400 })
    }

    const customerId = Number((body as { customerId?: unknown }).customerId)
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      return NextResponse.json({ error: 'お客様を選択してください' }, { status: 400 })
    }
    const noteValue = (body as { note?: unknown }).note
    const note = typeof noteValue === 'string' ? noteValue.trim().slice(0, 1000) || null : undefined
    const nextContactDate = parseOptionalDate((body as { nextContactDate?: unknown }).nextContactDate)
    const nextAction = parseOptionalNextAction((body as { nextAction?: unknown }).nextAction)
    const nextActions = parseOptionalActionItems((body as { nextActions?: unknown }).nextActions)
    const returnVisitDeadlinePreset = parseOptionalReturnVisitPreset(
      (body as { returnVisitDeadlinePreset?: unknown }).returnVisitDeadlinePreset,
    )
    const salesContactIntervalDays = parseOptionalSalesInterval(
      (body as { salesContactIntervalDays?: unknown }).salesContactIntervalDays,
    )

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, cast_name')
      .eq('id', customerId)
      .maybeSingle()
    if (customerError) throw customerError
    if (!customer?.cast_name) {
      return NextResponse.json({ error: '担当キャストが設定されていないお客様です' }, { status: 400 })
    }

    const { data: assignedCast, error: castError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'cast')
      .eq('cast_name', customer.cast_name)
      .eq('is_active', true)
      .maybeSingle()
    if (castError) throw castError
    if (!assignedCast) {
      return NextResponse.json({ error: '担当キャストが見つかりません' }, { status: 400 })
    }
    if (profile.role === 'cast' && assignedCast.id !== profile.id) {
      return NextResponse.json({ error: '自分の担当顧客だけ追加できます' }, { status: 403 })
    }

    const { data: existing, error: existingError } = await supabase
      .from('customer_follow_ups')
      .select('id, is_active, return_visit_deadline, return_visit_deadline_preset')
      .eq('customer_id', customerId)
      .eq('cast_id', assignedCast.id)
      .maybeSingle()
    if (existingError) throw existingError

    const now = new Date().toISOString()
    if (existing) {
      // すでにactiveで、追加情報もない「追加」リクエストは何も書き換えない。
      // activated_at等を更新せず、呼び出し側にはUndo対象外であることだけ返す。
      if (
        existing.is_active === true
        && note === undefined
        && nextContactDate === undefined
        && nextAction === undefined
        && nextActions === undefined
        && returnVisitDeadlinePreset === undefined
        && salesContactIntervalDays === undefined
      ) {
        const { data, error } = await supabase
          .from('customer_follow_ups')
          .select('*')
          .eq('id', existing.id)
          .single()
        if (error) throw error
        return NextResponse.json({ ...data, wasAlreadyActive: true })
      }

      const updatePayload: Record<string, unknown> = {
        is_active: true,
        activated_at: now,
        activated_by: profile.id,
        removed_at: null,
        removed_by: null,
      }
      if (note !== undefined) updatePayload.note = note
      if (nextContactDate !== undefined) updatePayload.next_contact_date = nextContactDate
      if (nextAction !== undefined) updatePayload.next_action = nextAction
      if (nextActions !== undefined) updatePayload.next_actions = nextActions
      if (returnVisitDeadlinePreset !== undefined) {
        updatePayload.return_visit_deadline_preset = returnVisitDeadlinePreset
        updatePayload.return_visit_deadline = resolveReturnVisitDeadline(
          returnVisitDeadlinePreset,
          existing.return_visit_deadline_preset as ReturnVisitDeadlinePreset | null,
          existing.return_visit_deadline,
          getJstDateString(),
        )
      }
      if (salesContactIntervalDays !== undefined) {
        updatePayload.sales_contact_interval_days = salesContactIntervalDays
      }
      const { data, error } = await supabase
        .from('customer_follow_ups')
        .update(updatePayload)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) throw error
      // 呼び出し側のUndoは「今回activeにした行」だけを外す必要がある。
      // 取得後〜POSTの間に別画面で追加された競合も、この印で安全に判別する。
      return NextResponse.json({ ...data, wasAlreadyActive: existing.is_active === true })
    }

    const { data, error } = await supabase
      .from('customer_follow_ups')
      .insert({
        customer_id: customerId,
        cast_id: assignedCast.id,
        note: note ?? null,
        next_action: nextAction ?? null,
        next_contact_date: nextContactDate ?? null,
        next_actions: nextActions ?? [],
        return_visit_deadline_preset: returnVisitDeadlinePreset ?? null,
        return_visit_deadline: resolveReturnVisitDeadline(
          returnVisitDeadlinePreset ?? null,
          null,
          null,
          getJstDateString(),
        ),
        sales_contact_interval_days: salesContactIntervalDays ?? null,
        added_by: profile.id,
        activated_by: profile.id,
      })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ ...data, wasAlreadyActive: false }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '追加に失敗しました'
    if (
      message.includes('YYYY-MM-DD')
      || message.includes('次の行動')
      || message.includes('再来店期限')
      || message.includes('営業連絡間隔')
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('POST /api/follow-ups error:', error)
    return errorResponse(error)
  }
}
