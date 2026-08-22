export const CAST_MEETING_LOG_TITLE_MAX = 120
export const CAST_MEETING_LOG_STAFF_NAME_MAX = 80
export const CAST_MEETING_LOG_TRANSCRIPT_MAX = 100_000

export type CastMeetingLog = {
  id: string
  cast_id: string
  meeting_date: string
  title: string
  staff_name: string
  transcript: string
  created_by: string
  created_by_name: string
  created_at: string
}

export type CastMeetingLogInput = {
  castId: string
  meetingDate: string
  title: string
  staffName: string
  transcript: string
}

export type CastMeetingLogParseResult =
  | { ok: true; value: CastMeetingLogInput }
  | { ok: false; error: string }

const isRealDateOnly = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

const normalizeSingleLine = (value: unknown) => (
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
)

const normalizeTranscript = (value: unknown) => (
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
)

export function parseCastMeetingLogInput(input: unknown): CastMeetingLogParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: '入力内容を確認してください' }
  }

  const body = input as Record<string, unknown>
  const castId = normalizeSingleLine(body.castId)
  const meetingDate = normalizeSingleLine(body.meetingDate)
  const title = normalizeSingleLine(body.title)
  const staffName = normalizeSingleLine(body.staffName)
  const transcript = normalizeTranscript(body.transcript)

  if (!castId) return { ok: false, error: 'キャストを指定してください' }
  if (!isRealDateOnly(meetingDate)) return { ok: false, error: 'MT日を選び直してください' }
  if (!title) return { ok: false, error: '題名を入力してください' }
  if (title.length > CAST_MEETING_LOG_TITLE_MAX) {
    return { ok: false, error: `題名は${CAST_MEETING_LOG_TITLE_MAX}文字以内で入力してください` }
  }
  if (!staffName) return { ok: false, error: '担当者を入力してください' }
  if (staffName.length > CAST_MEETING_LOG_STAFF_NAME_MAX) {
    return { ok: false, error: `担当者は${CAST_MEETING_LOG_STAFF_NAME_MAX}文字以内で入力してください` }
  }
  if (!transcript) return { ok: false, error: '文字起こし全文を入力してください' }
  if (transcript.length > CAST_MEETING_LOG_TRANSCRIPT_MAX) {
    return { ok: false, error: `文字起こし全文は${CAST_MEETING_LOG_TRANSCRIPT_MAX.toLocaleString()}文字以内で入力してください` }
  }

  return {
    ok: true,
    value: { castId, meetingDate, title, staffName, transcript },
  }
}
