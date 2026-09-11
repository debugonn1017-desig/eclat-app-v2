import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import {
  CAST_TRAINING_ELIGIBLE_SHIFT_STATUSES,
  getCastTrainingMonthBounds,
  parseCastTrainingScheduleDeleteInput,
  parseCastTrainingScheduleInput,
  type CastTrainingSchedule,
} from '@/lib/castTrainingSchedule'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
}

const scheduleColumns = 'id, cast_id, schedule_date, category, topic, memo, assigned_staff_id, is_completed, completed_at, completed_by, created_by, updated_by, created_at, updated_at'

function authErrorResponse(error: unknown) {
  if (!(error instanceof Error)) return null
  if (error.message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401, headers: privateHeaders })
  }
  if (error.message === 'FORBIDDEN') {
    return NextResponse.json({ error: '新人教育スケジュール表は黒服・オーナーのみ利用できます' }, { status: 403, headers: privateHeaders })
  }
  return null
}

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const month = new URL(request.url).searchParams.get('month')?.trim() ?? ''
    const bounds = getCastTrainingMonthBounds(month)
    if (!bounds) {
      return NextResponse.json({ error: '対象月を正しく指定してください' }, { status: 400, headers: privateHeaders })
    }

    // ユーザーセッションクライアントを使い、API認証に加えてRLSも実防壁にする。
    const supabase = await createClient()
    const [castsResult, staffResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, cast_name, display_name, cast_tier, created_at')
        .eq('role', 'cast')
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, cast_name, display_name, is_owner, created_at')
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
    ])

    if (castsResult.error) throw castsResult.error
    if (staffResult.error) throw staffResult.error
    const castIds = (castsResult.data ?? []).map(cast => cast.id)
    const [shifts, schedules] = castIds.length > 0 ? await Promise.all([
      fetchAllPaginated<{ cast_id: string; shift_date: string; status: string }>((from, to) => supabase
        .from('cast_shifts')
        .select('cast_id, shift_date, status')
        .in('cast_id', castIds)
        .gte('shift_date', bounds.start)
        .lte('shift_date', bounds.end)
        .in('status', CAST_TRAINING_ELIGIBLE_SHIFT_STATUSES)
        .order('shift_date', { ascending: true })
        .order('cast_id', { ascending: true })
        .range(from, to)),
      fetchAllPaginated<CastTrainingSchedule>((from, to) => supabase
        .from('cast_training_schedules')
        .select(scheduleColumns)
        .in('cast_id', castIds)
        .gte('schedule_date', bounds.start)
        .lte('schedule_date', bounds.end)
        .order('schedule_date', { ascending: true })
        .order('cast_id', { ascending: true })
        .range(from, to)),
    ]) : [[], []]

    return NextResponse.json({
      month,
      casts: castsResult.data ?? [],
      staff: staffResult.data ?? [],
      shifts,
      schedules,
    }, { headers: privateHeaders })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('GET /api/admin/training-schedules error:', error)
    return NextResponse.json({ error: '新人教育スケジュールの取得に失敗しました' }, { status: 500, headers: privateHeaders })
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireAdmin()
    const parsed = parseCastTrainingScheduleInput(await request.json().catch(() => null))
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400, headers: privateHeaders })
    }

    const supabase = await createClient()
    const [castsResult, staffResult, shiftsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id')
        .in('id', parsed.value.castIds)
        .eq('role', 'cast')
        .eq('is_active', true),
      supabase
        .from('profiles')
        .select('id')
        .eq('id', parsed.value.assignedStaffId)
        .eq('role', 'admin')
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('cast_shifts')
        .select('cast_id')
        .in('cast_id', parsed.value.castIds)
        .eq('shift_date', parsed.value.scheduleDate)
        .in('status', CAST_TRAINING_ELIGIBLE_SHIFT_STATUSES),
    ])

    if (castsResult.error) throw castsResult.error
    if (staffResult.error) throw staffResult.error
    if (shiftsResult.error) throw shiftsResult.error
    if ((castsResult.data ?? []).length !== parsed.value.castIds.length) {
      return NextResponse.json({ error: '対象にできないキャストが含まれています' }, { status: 400, headers: privateHeaders })
    }
    if (!staffResult.data) {
      return NextResponse.json({ error: '担当者を選び直してください' }, { status: 400, headers: privateHeaders })
    }
    const eligibleCastIds = new Set((shiftsResult.data ?? []).map(row => String(row.cast_id)))
    if (parsed.value.castIds.some(castId => !eligibleCastIds.has(castId))) {
      return NextResponse.json({ error: '出勤・来客出勤・希望出勤ではないキャストが含まれています' }, { status: 409, headers: privateHeaders })
    }

    const rows = parsed.value.castIds.map(castId => ({
      cast_id: castId,
      schedule_date: parsed.value.scheduleDate,
      category: parsed.value.category,
      topic: parsed.value.topic,
      memo: parsed.value.memo,
      assigned_staff_id: parsed.value.assignedStaffId,
      is_completed: parsed.value.isCompleted,
      created_by: profile.id,
      updated_by: profile.id,
    }))
    const { data, error } = await supabase
      .from('cast_training_schedules')
      .upsert(rows, { onConflict: 'cast_id,schedule_date' })
      .select(scheduleColumns)
    if (error) throw error

    return NextResponse.json({ items: (data ?? []) as CastTrainingSchedule[] }, {
      status: 200,
      headers: privateHeaders,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('POST /api/admin/training-schedules error:', error)
    return NextResponse.json({ error: '新人教育スケジュールの保存に失敗しました' }, { status: 500, headers: privateHeaders })
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin()
    const parsed = parseCastTrainingScheduleDeleteInput(await request.json().catch(() => null))
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400, headers: privateHeaders })
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('cast_training_schedules')
      .delete()
      .in('cast_id', parsed.value.castIds)
      .eq('schedule_date', parsed.value.scheduleDate)
    if (error) throw error

    return NextResponse.json({ deleted: parsed.value.castIds }, { headers: privateHeaders })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('DELETE /api/admin/training-schedules error:', error)
    return NextResponse.json({ error: '新人教育スケジュールの削除に失敗しました' }, { status: 500, headers: privateHeaders })
  }
}
