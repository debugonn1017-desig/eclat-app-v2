import type { FollowUpCheckResult } from './followUpWorkflow'

export type FollowUpActivityEventType = 'started' | 'ended' | 'check'

export type FollowUpActivityLogRow = {
  id: string
  follow_up_id: string
  cycle_id: string
  event_type: FollowUpActivityEventType
  check_result: FollowUpCheckResult | null
  note: string | null
  actor_user_id: string | null
  actor_display_name: string | null
  actor_role: string | null
  event_at: string
  voided_at: string | null
}

export type FollowUpVisitLogRow = {
  id: string
  visit_date: string
  visit_time: string | null
  amount_spent: number | null
  has_douhan: boolean | null
  has_after: boolean | null
}

export type FollowUpContactLogRow = {
  id: string
  contact_date: string
  direction: 'sent' | 'received'
  channel: string
  memo: string | null
}

export type FollowUpTimelineEvent =
  | {
    kind: 'activity'
    id: string
    cycleId: string
    occurredAt: string
    eventType: FollowUpActivityEventType
    checkResult: FollowUpCheckResult | null
    note: string | null
    actor: {
      userId: string | null
      displayName: string | null
      role: string | null
    }
  }
  | {
    kind: 'visit'
    id: string
    cycleId: string
    occurredAt: string
    visitDate: string
    visitTime: string | null
    amountSpent: number
    hasDouhan: boolean
    hasAfter: boolean
  }
  | {
    kind: 'contact'
    id: string
    cycleId: string
    occurredAt: string
    direction: 'sent' | 'received'
    channel: string
    memo: string | null
  }

type CycleWindow = {
  cycleId: string
  start: string
  end: string | null
}

function isoToJstDate(value: string): string {
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function visitDateTimeToIso(visitDate: string, visitTime: string | null): string {
  const normalizedTime = visitTime?.slice(0, 8) || '23:59:59'
  return new Date(`${visitDate}T${normalizedTime}+09:00`).toISOString()
}

export function buildFollowUpTimeline(
  activityRows: readonly FollowUpActivityLogRow[],
  visitRows: readonly FollowUpVisitLogRow[],
  contactRows: readonly FollowUpContactLogRow[] = [],
): FollowUpTimelineEvent[] {
  const validActivities = activityRows.filter(row => !row.voided_at)
  const starts = validActivities.filter(row => row.event_type === 'started')
  const cycleWindows: CycleWindow[] = starts.map(start => ({
    cycleId: start.cycle_id,
    start: start.event_at,
    end: validActivities
      .filter(row => row.cycle_id === start.cycle_id && row.event_type === 'ended')
      .map(row => row.event_at)
      .sort()[0] ?? null,
  }))

  const activityEvents: FollowUpTimelineEvent[] = validActivities.map(row => ({
    kind: 'activity',
    id: row.id,
    cycleId: row.cycle_id,
    occurredAt: row.event_at,
    eventType: row.event_type,
    checkResult: row.check_result,
    note: row.note,
    actor: {
      userId: row.actor_user_id,
      displayName: row.actor_display_name,
      role: row.actor_role,
    },
  }))

  const visitEvents: FollowUpTimelineEvent[] = []
  for (const visit of visitRows) {
    const occurredAt = visitDateTimeToIso(visit.visit_date, visit.visit_time)
    const matchingCycle = cycleWindows
      .filter(cycle => occurredAt >= cycle.start && (!cycle.end || occurredAt <= cycle.end))
      .sort((left, right) => right.start.localeCompare(left.start))[0]
    if (!matchingCycle) continue
    visitEvents.push({
      kind: 'visit',
      id: `visit-${visit.id}`,
      cycleId: matchingCycle.cycleId,
      occurredAt,
      visitDate: visit.visit_date,
      visitTime: visit.visit_time,
      amountSpent: Number(visit.amount_spent ?? 0),
      hasDouhan: visit.has_douhan === true,
      hasAfter: visit.has_after === true,
    })
  }

  const contactEvents: FollowUpTimelineEvent[] = []
  for (const contact of contactRows) {
    // 既存の連絡履歴は時刻を持たないため、追いかけ開始・終了と同じJST日なら期間内とみなす。
    // 正午の仮時刻だけで判定すると、開始当日の有効な連絡を誤って落とすため日付で比較する。
    const contactDate = contact.contact_date.slice(0, 10)
    const occurredAt = new Date(
      contact.contact_date.length === 10
        ? `${contact.contact_date}T12:00:00+09:00`
        : contact.contact_date,
    ).toISOString()
    const matchingCycle = cycleWindows
      .filter(cycle => (
        contactDate >= isoToJstDate(cycle.start)
        && (!cycle.end || contactDate <= isoToJstDate(cycle.end))
      ))
      .sort((left, right) => right.start.localeCompare(left.start))[0]
    if (!matchingCycle) continue
    contactEvents.push({
      kind: 'contact',
      id: `contact-${contact.id}`,
      cycleId: matchingCycle.cycleId,
      occurredAt,
      direction: contact.direction,
      channel: contact.channel,
      memo: contact.memo,
    })
  }

  return [...activityEvents, ...visitEvents, ...contactEvents].sort((left, right) => {
    const byTime = right.occurredAt.localeCompare(left.occurredAt)
    if (byTime !== 0) return byTime
    return right.id.localeCompare(left.id)
  })
}
