import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { parseCastMeetingLogInput, type CastMeetingLog } from '@/lib/castMeetingLog'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
}

const authErrorResponse = (error: unknown) => {
  if (!(error instanceof Error)) return null
  if (error.message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  if (error.message === 'FORBIDDEN') {
    return NextResponse.json({ error: 'MTログは黒服のみ閲覧できます' }, { status: 403 })
  }
  return null
}

const getTargetCast = async (castId: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, cast_name, display_name')
    .eq('id', castId)
    .eq('role', 'cast')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function GET(request: Request) {
  try {
    const profile = await requireAdmin()
    const castId = new URL(request.url).searchParams.get('castId')?.trim() ?? ''
    if (!UUID_PATTERN.test(castId)) {
      return NextResponse.json({ error: 'キャストを指定してください' }, { status: 400 })
    }

    const targetCast = await getTargetCast(castId)
    if (!targetCast) {
      return NextResponse.json({ error: 'キャストが見つかりません' }, { status: 404 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('cast_meeting_logs')
      .select('id, cast_id, meeting_date, title, staff_name, transcript, created_by, created_by_name, created_at')
      .eq('cast_id', castId)
      .order('meeting_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error

    const defaultStaffName = (
      profile.display_name?.trim()
      || profile.cast_name?.trim()
      || '管理者'
    ).slice(0, 80)

    return NextResponse.json({
      cast: targetCast,
      default_staff_name: defaultStaffName,
      items: (data ?? []) as CastMeetingLog[],
    }, { headers: privateHeaders })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('GET /api/cast-meeting-logs error:', error)
    return NextResponse.json({ error: 'MTログの取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireAdmin()
    const parsed = parseCastMeetingLogInput(await request.json().catch(() => null))
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    if (!UUID_PATTERN.test(parsed.value.castId)) {
      return NextResponse.json({ error: 'キャストを指定してください' }, { status: 400 })
    }

    const targetCast = await getTargetCast(parsed.value.castId)
    if (!targetCast) {
      return NextResponse.json({ error: 'キャストが見つかりません' }, { status: 404 })
    }

    const createdByName = (
      profile.display_name?.trim()
      || profile.cast_name?.trim()
      || '管理者'
    ).slice(0, 120)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('cast_meeting_logs')
      .insert({
        cast_id: parsed.value.castId,
        meeting_date: parsed.value.meetingDate,
        title: parsed.value.title,
        staff_name: parsed.value.staffName,
        transcript: parsed.value.transcript,
        created_by: profile.id,
        created_by_name: createdByName,
      })
      .select('id, cast_id, meeting_date, title, staff_name, transcript, created_by, created_by_name, created_at')
      .single()
    if (error) throw error

    return NextResponse.json({ item: data as CastMeetingLog }, {
      status: 201,
      headers: privateHeaders,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('POST /api/cast-meeting-logs error:', error)
    return NextResponse.json({ error: 'MTログの保存に失敗しました' }, { status: 500 })
  }
}
