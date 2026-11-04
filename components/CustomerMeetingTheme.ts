import type { CSSProperties } from 'react'
import { C } from '@/lib/colors'

export const customerMeetingColors = {
  '--meeting-navy': C.meetingNavy,
  '--meeting-blue-band': C.meetingBlueBand,
  '--meeting-purple': C.meetingPurple,
  '--meeting-purple-bg': C.meetingPurpleBg,
  '--meeting-purple-band': C.meetingPurpleBand,
  '--meeting-text': C.meetingInk,
  '--meeting-muted': C.meetingMuted,
  '--meeting-border': C.meetingRule,
  '--meeting-money': C.meetingMoneyBg,
  '--meeting-hon': C.meetingHonBg,
  '--meeting-ban': C.meetingBanBg,
  '--meeting-after': C.meetingAfterBg,
  '--meeting-soft': C.meetingSoft,
  '--meeting-white': C.white,
  '--meeting-pink': C.goalAccent,
  '--meeting-error': C.dangerDeep,
  '--meeting-error-bg': C.dangerBg,
  '--meeting-success': C.successDeep,
} as CSSProperties

export function meetingMoney(value: number | null | undefined) {
  return value == null ? '未入力' : `¥${value.toLocaleString('ja-JP')}`
}

export function meetingDate(value: string) {
  return value.replace(/-/g, '/')
}

export function meetingSavedAt(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '日時未確認'
}
