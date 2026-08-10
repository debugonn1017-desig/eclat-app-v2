import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFollowUpTimeline,
  visitDateTimeToIso,
  type FollowUpActivityLogRow,
} from './followUpLog'

const activities: FollowUpActivityLogRow[] = [
  {
    id: 'start-1',
    follow_up_id: 'follow-1',
    cycle_id: 'cycle-1',
    event_type: 'started',
    check_result: null,
    note: null,
    actor_user_id: 'user-1',
    actor_display_name: '担当者',
    actor_role: 'admin',
    event_at: '2026-08-10T00:00:00.000Z',
    voided_at: null,
  },
  {
    id: 'check-1',
    follow_up_id: 'follow-1',
    cycle_id: 'cycle-1',
    event_type: 'check',
    check_result: '返信あり',
    note: '来週を確認中',
    actor_user_id: 'user-1',
    actor_display_name: '担当者',
    actor_role: 'admin',
    event_at: '2026-08-12T06:00:00.000Z',
    voided_at: null,
  },
]

test('実来店は追いかけ期間中だけ担当者チェックと同じタイムラインへ入る', () => {
  const timeline = buildFollowUpTimeline(activities, [
    { id: 'before', visit_date: '2026-08-09', visit_time: '21:00:00', amount_spent: 10000, has_douhan: false, has_after: false },
    { id: 'during', visit_date: '2026-08-13', visit_time: '22:00:00', amount_spent: 85000, has_douhan: true, has_after: false },
  ])
  assert.deepEqual(timeline.map(event => event.id), ['visit-during', 'check-1', 'start-1'])
  const visit = timeline[0]
  assert.equal(visit.kind, 'visit')
  if (visit.kind === 'visit') {
    assert.equal(visit.amountSpent, 85000)
    assert.equal(visit.cycleId, 'cycle-1')
  }
})

test('追いかけ終了後の来店は過去の追いかけログへ混ぜない', () => {
  const endedActivities: FollowUpActivityLogRow[] = [
    ...activities,
    { ...activities[0], id: 'end-1', event_type: 'ended', event_at: '2026-08-14T00:00:00.000Z' },
  ]
  const timeline = buildFollowUpTimeline(endedActivities, [
    { id: 'after', visit_date: '2026-08-15', visit_time: '20:00:00', amount_spent: 50000, has_douhan: false, has_after: false },
  ])
  assert.equal(timeline.some(event => event.id === 'visit-after'), false)
})

test('取り消した担当者チェックはタイムラインへ表示しない', () => {
  const timeline = buildFollowUpTimeline([
    ...activities,
    { ...activities[1], id: 'voided', check_result: '既読無視', voided_at: '2026-08-12T07:00:00.000Z' },
  ], [])
  assert.equal(timeline.some(event => event.id === 'voided'), false)
})

test('来店時刻未登録はJST当日の末尾として扱う', () => {
  assert.equal(visitDateTimeToIso('2026-08-13', null), '2026-08-13T14:59:59.000Z')
})

test('追いかけ期間中のLINE送受信を来店・チェックと同じタイムラインへ入れる', () => {
  const timeline = buildFollowUpTimeline(activities, [], [
    { id: 'before', contact_date: '2026-08-09', direction: 'sent', channel: 'LINE', memo: null },
    { id: 'during', contact_date: '2026-08-11', direction: 'received', channel: 'LINE', memo: '来週行けそう' },
  ])
  assert.equal(timeline.some(event => event.id === 'contact-before'), false)
  const contact = timeline.find(event => event.id === 'contact-during')
  assert.equal(contact?.kind, 'contact')
  if (contact?.kind === 'contact') {
    assert.equal(contact.direction, 'received')
    assert.equal(contact.memo, '来週行けそう')
  }
})

test('時刻のない連絡履歴は追いかけ開始と同じJST日ならログへ入れる', () => {
  const timeline = buildFollowUpTimeline([
    {
      ...activities[0],
      id: 'same-day-start',
      event_at: '2026-08-11T09:00:00.000Z', // JST 18:00
    },
  ], [], [
    { id: 'same-day', contact_date: '2026-08-11', direction: 'sent', channel: 'LINE', memo: null },
  ])

  assert.equal(timeline.some(event => event.id === 'contact-same-day'), true)
})
