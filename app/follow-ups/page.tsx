'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import BottomNav from '@/components/BottomNav'
import NotificationBell from '@/components/NotificationBell'
import UserChip from '@/components/UserChip'
import Spinner from '@/components/ui/Spinner'
import { fetchMe } from '@/lib/authCache'
import { C } from '@/lib/colors'
import { useCasts } from '@/hooks/useCasts'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'
import { useUndoToast } from '@/hooks/useUndoToast'
import styles from './follow-ups.module.css'
import {
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_SORT_OPTIONS,
  RETURN_VISIT_DEADLINE_PRESETS,
  SALES_CONTACT_INTERVALS,
  calculateReturnVisitDeadline,
  classifyFollowUpRegion,
  getDeadlineInfo,
  getSalesContactDeadline,
  sortFollowUpItems,
  type FollowUpActionItem,
  type FollowUpRegionGroup,
  type FollowUpSortKey,
  type ReturnVisitDeadlinePreset,
  type SalesContactIntervalDays,
} from '@/lib/followUpWorkflow'

type FollowUpTab = 'active' | 'candidates' | 'history'
type NominationCategory = '本指名' | '場内' | 'フリー' | 'その他'
type NominationGroup = '全て' | NominationCategory
type RegionFilter = 'all' | FollowUpRegionGroup

type CustomerSummary = {
  id: string
  customer_name: string | null
  nickname: string | null
  cast_name: string | null
  customer_rank: string | null
  nomination_status: string | null
  region: string | null
  phase: string | null
}

type FollowUpItem = {
  id: string
  customer_id: string
  cast_id: string
  note: string | null
  next_actions: FollowUpActionItem[]
  return_visit_deadline: string | null
  return_visit_deadline_preset: ReturnVisitDeadlinePreset | null
  sales_contact_interval_days: SalesContactIntervalDays | null
  is_active: boolean
  last_contacted_at: string | null
  removed_at: string | null
  activated_at: string
  assignment_current: boolean
  customer: CustomerSummary
  cast: { id: string; cast_name: string | null; display_name: string | null } | null
}

const DEADLINE_META = {
  overdue: { color: '#A62D47', background: '#FBE3E8' },
  today: { color: '#9A5D00', background: '#FFF0CC' },
  upcoming: { color: '#356A52', background: '#E2F4EA' },
  unscheduled: { color: C.pinkMuted, background: '#F4EEF0' },
}

type Candidate = Omit<CustomerSummary, 'phase' | 'cast_name'> & {
  reasons: string[]
  days_since_last_visit: number | null
  typical_interval_days: number | null
}

type FollowUpResponse = {
  items: FollowUpItem[]
  candidates: Candidate[]
  selected_cast_id: string | null
  candidate_scope_required: boolean
}

function formatDateTime(value: string | null): string {
  if (!value) return 'まだ連絡記録はありません'
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function DeadlineBadge({
  label,
  status,
}: {
  label: string
  status: keyof typeof DEADLINE_META
}) {
  const meta = DEADLINE_META[status]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 10,
      padding: '3px 8px',
      fontSize: 9,
      fontWeight: 700,
      color: meta.color,
      background: meta.background,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function MultiActionSelect({
  value,
  onChange,
  disabled,
}: {
  value: FollowUpActionItem[]
  onChange: (value: FollowUpActionItem[]) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const toggle = (action: FollowUpActionItem) => {
    onChange(value.includes(action)
      ? value.filter(item => item !== action)
      : [...value, action])
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(previous => !previous)}
        style={{
          width: '100%',
          minHeight: 38,
          marginTop: 5,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '7px 10px',
          color: value.length > 0 ? C.dark : C.pinkMuted,
          background: '#FFFAFC',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          fontSize: 10.5,
          textAlign: 'left',
          cursor: disabled ? 'wait' : 'pointer',
        }}
      >
        {value.length > 0 ? `${value.length}項目を選択中` : '選択してください'}
        <span style={{ float: 'right' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{
          marginTop: 5,
          padding: 6,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          background: '#FFF',
          boxShadow: '0 8px 22px rgba(85, 43, 58, 0.12)',
        }}>
          {FOLLOW_UP_ACTIONS.map(action => (
            <label
              key={action}
              style={{
                minHeight: 36,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 6px',
                color: C.dark2,
                fontSize: 10.5,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={value.includes(action)}
                onChange={() => toggle(action)}
                style={{ width: 17, height: 17, accentColor: C.pink }}
              />
              {action}
            </label>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              width: '100%',
              height: 32,
              marginTop: 4,
              border: 'none',
              borderRadius: 8,
              background: '#FFF0F4',
              color: C.pinkDeep,
              fontFamily: 'inherit',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            選択を閉じる
          </button>
        </div>
      )}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
          {value.map(action => (
            <span
              key={action}
              style={{
                padding: '3px 7px',
                borderRadius: 9,
                background: '#FFF0F4',
                color: C.pinkDeep,
                fontSize: 9,
              }}
            >
              {action}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function CustomerName({
  customer,
  assignedCastLabel,
}: {
  customer: CustomerSummary | Candidate
  assignedCastLabel?: string
}) {
  const name = customer.customer_name?.trim() || customer.nickname?.trim() || 'お名前未登録'
  return (
    <div className={styles.customerIdentity}>
      <div className={styles.customerName}>
        {name}
        {customer.nickname && customer.nickname !== name && (
          <span className={styles.customerNickname}>
            ({customer.nickname})
          </span>
        )}
      </div>
      <div className={styles.identityBadges}>
        <span className={`${styles.identityBadge} ${styles.rankBadge}`}>
          ランク：{customer.customer_rank ?? '未設定'}
        </span>
        <span className={`${styles.identityBadge} ${styles.nominationBadge}`}>
          指名状況：{customer.nomination_status || '未設定'}
        </span>
        <span className={styles.identityBadge}>
          地域：{customer.region?.trim() || '未設定'}
        </span>
        {assignedCastLabel && (
          <span className={`${styles.identityBadge} ${styles.castBadge}`}>
            担当キャスト：{assignedCastLabel}
          </span>
        )}
      </div>
    </div>
  )
}

function FollowUpCard({
  item,
  mode,
  busy,
  onPatch,
}: {
  item: FollowUpItem
  mode: 'active' | 'history'
  busy: boolean
  onPatch: (id: string, payload: Record<string, unknown>) => Promise<boolean>
}) {
  const [note, setNote] = useState(item.note ?? '')
  const [nextActions, setNextActions] = useState<FollowUpActionItem[]>(item.next_actions ?? [])
  const [returnPreset, setReturnPreset] = useState<ReturnVisitDeadlinePreset | ''>(
    item.return_visit_deadline_preset ?? '',
  )
  const [returnDeadline, setReturnDeadline] = useState(item.return_visit_deadline ?? '')
  const [salesInterval, setSalesInterval] = useState<SalesContactIntervalDays | ''>(
    item.sales_contact_interval_days ?? '',
  )
  const returnDeadlineInfo = getDeadlineInfo(returnDeadline || null)
  const salesContactDeadline = getSalesContactDeadline(
    item.last_contacted_at,
    item.activated_at,
    salesInterval || null,
  )
  const salesContactInfo = getDeadlineInfo(salesContactDeadline)
  const updateReturnPreset = (value: ReturnVisitDeadlinePreset | '') => {
    setReturnPreset(value)
    setReturnDeadline(value ? calculateReturnVisitDeadline(value) : '')
  }
  const updatePayload = {
    nextActions,
    returnVisitDeadlinePreset: returnPreset || null,
    salesContactIntervalDays: salesInterval || null,
    note,
  }

  return (
    <article style={{
      background: '#FFF',
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      boxShadow: '0 6px 18px rgba(232,135,154,0.07)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <Link href={`/customer/${item.customer_id}`} style={{ textDecoration: 'none', minWidth: 0, flex: 1 }}>
          <CustomerName
            customer={item.customer}
            assignedCastLabel={
              item.cast?.display_name
              || item.cast?.cast_name
              || item.customer.cast_name
              || '未設定'
            }
          />
        </Link>
        {item.customer.customer_rank === '切れた' && (
          <span style={{
            alignSelf: 'flex-start',
            fontSize: 9,
            color: '#8A3248',
            background: '#FBE3E8',
            borderRadius: 9,
            padding: '3px 7px',
            whiteSpace: 'nowrap',
          }}>
            切れた
          </span>
        )}
      </div>

      {mode === 'active' && (
        <div style={{ display: 'grid', gap: 6, marginTop: 9 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, color: C.dark2, fontWeight: 700 }}>再来店期限</span>
            <DeadlineBadge
              label={returnDeadlineInfo.label}
              status={returnDeadlineInfo.status}
            />
            {returnDeadline && (
              <span style={{ fontSize: 9.5, color: C.pinkMuted }}>
                {returnDeadline.replaceAll('-', '/')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, color: C.dark2, fontWeight: 700 }}>営業連絡</span>
            <DeadlineBadge
              label={salesInterval ? salesContactInfo.label : '間隔未設定'}
              status={salesInterval ? salesContactInfo.status : 'unscheduled'}
            />
            {salesContactDeadline && (
              <span style={{ fontSize: 9.5, color: C.pinkMuted }}>
                次の期限 {salesContactDeadline.replaceAll('-', '/')}
              </span>
            )}
          </div>
        </div>
      )}

      {item.cast && (
        <div style={{ fontSize: 9.5, color: C.pinkMuted, marginTop: 8 }}>
          担当：{item.cast.display_name || item.cast.cast_name || '未設定'}
        </div>
      )}
      {!item.assignment_current && (
        <div style={{
          display: 'inline-flex',
          width: 'fit-content',
          marginTop: 7,
          padding: '3px 8px',
          borderRadius: 8,
          background: '#FFF4E0',
          color: '#8A5A18',
          fontSize: 9,
          fontWeight: 700,
        }}>
          担当変更あり・旧キャストへの通知対象外
        </div>
      )}

      {mode === 'active' ? (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
            marginTop: 12,
          }}>
            <div style={{ fontSize: 9.5, color: C.pinkMuted, gridColumn: '1 / -1' }}>
              次の行動（複数選択）
              <MultiActionSelect
                value={nextActions}
                onChange={setNextActions}
                disabled={busy}
              />
            </div>
            <label style={{ fontSize: 9.5, color: C.pinkMuted }}>
              再来店期限
              <select
                value={returnPreset}
                onChange={event => updateReturnPreset(
                  event.target.value as ReturnVisitDeadlinePreset | '',
                )}
                style={{
                  width: '100%',
                  height: 38,
                  marginTop: 5,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '0 8px',
                  color: returnPreset ? C.dark : C.pinkMuted,
                  background: '#FFFAFC',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              >
                <option value="">未設定</option>
                {RETURN_VISIT_DEADLINE_PRESETS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span style={{
                display: 'block',
                marginTop: 5,
                color: DEADLINE_META[returnDeadlineInfo.status].color,
                fontWeight: 700,
              }}>
                {returnDeadlineInfo.label}
                {returnDeadline ? `（${returnDeadline.replaceAll('-', '/')}）` : ''}
              </span>
            </label>
            <label style={{ fontSize: 9.5, color: C.pinkMuted }}>
              営業連絡間隔
              <select
                value={salesInterval}
                onChange={event => setSalesInterval(
                  event.target.value
                    ? Number(event.target.value) as SalesContactIntervalDays
                    : '',
                )}
                style={{
                  width: '100%',
                  height: 38,
                  marginTop: 5,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '0 8px',
                  color: salesInterval ? C.dark : C.pinkMuted,
                  background: '#FFFAFC',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              >
                <option value="">未設定</option>
                {SALES_CONTACT_INTERVALS.map(option => (
                  <option key={option.days} value={option.days}>{option.label}</option>
                ))}
              </select>
              <span style={{
                display: 'block',
                marginTop: 5,
                color: DEADLINE_META[salesInterval ? salesContactInfo.status : 'unscheduled'].color,
                fontWeight: 700,
              }}>
                {salesInterval
                  ? `${salesContactInfo.label}${salesContactDeadline ? `（${salesContactDeadline.replaceAll('-', '/')}）` : ''}`
                  : '間隔未設定'}
              </span>
            </label>
            <label style={{ fontSize: 9.5, color: C.pinkMuted, gridColumn: '1 / -1' }}>
              追いかけメモ
              <input
                type="text"
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="次に話すことなど"
                style={{
                  width: '100%',
                  height: 38,
                  marginTop: 5,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '0 10px',
                  color: C.dark,
                  background: '#FFFAFC',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  fontSize: 11,
                }}
              />
            </label>
          </div>
          <div style={{ fontSize: 9.5, color: C.pinkMuted, marginTop: 8 }}>
            最終連絡：{formatDateTime(item.last_contacted_at)}
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPatch(item.id, {
                action: 'contact',
                ...updatePayload,
              })}
              style={{
                flex: 1,
                minWidth: 100,
                height: 38,
                border: 'none',
                borderRadius: 12,
                background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                color: '#FFF',
                fontSize: 11,
                fontWeight: 700,
                cursor: busy ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              連絡した
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPatch(item.id, {
                action: 'update',
                ...updatePayload,
              })}
              style={{
                height: 38,
                padding: '0 14px',
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                background: '#FFF',
                color: C.dark,
                fontSize: 10,
                cursor: busy ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              設定・メモを保存
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPatch(item.id, { action: 'remove' })}
              style={{
                height: 38,
                padding: '0 12px',
                border: 'none',
                borderRadius: 12,
                background: '#F4EEF0',
                color: C.pinkMuted,
                fontSize: 10,
                cursor: busy ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              リストから外す
            </button>
          </div>
          <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 8, lineHeight: 1.5 }}>
            「連絡した」を押すと、営業連絡間隔を今日から数え直します。追いかけ中からは外れません。
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 10 }}>
            外した日時：{formatDateTime(item.removed_at)}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatch(item.id, { action: 'reactivate' })}
            style={{
              width: '100%',
              height: 38,
              marginTop: 12,
              border: `1px solid ${C.pink}`,
              borderRadius: 12,
              background: '#FFF',
              color: C.pink,
              fontSize: 11,
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            もう一度追いかける
          </button>
        </>
      )}
    </article>
  )
}

function ActiveFollowUpCard({
  item,
  busy,
  onPatch,
}: {
  item: FollowUpItem
  busy: boolean
  onPatch: (id: string, payload: Record<string, unknown>) => Promise<boolean>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [note, setNote] = useState(item.note ?? '')
  const [nextActions, setNextActions] = useState<FollowUpActionItem[]>(item.next_actions ?? [])
  const [returnPreset, setReturnPreset] = useState<ReturnVisitDeadlinePreset | ''>(
    item.return_visit_deadline_preset ?? '',
  )
  const [returnDeadline, setReturnDeadline] = useState(item.return_visit_deadline ?? '')
  const [salesInterval, setSalesInterval] = useState<SalesContactIntervalDays | ''>(
    item.sales_contact_interval_days ?? '',
  )

  const persistedSalesDeadline = getSalesContactDeadline(
    item.last_contacted_at,
    item.activated_at,
    item.sales_contact_interval_days,
  )
  const persistedReturnInfo = getDeadlineInfo(item.return_visit_deadline)
  const persistedSalesInfo = getDeadlineInfo(persistedSalesDeadline)
  const urgency = [
    item.return_visit_deadline
      ? { deadline: item.return_visit_deadline, info: persistedReturnInfo }
      : null,
    persistedSalesDeadline
      ? { deadline: persistedSalesDeadline, info: persistedSalesInfo }
      : null,
  ]
    .filter((value): value is {
      deadline: string
      info: ReturnType<typeof getDeadlineInfo>
    } => value !== null)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))[0]
    ?.info ?? getDeadlineInfo(null)

  const draftReturnInfo = getDeadlineInfo(returnDeadline || null)
  const draftSalesDeadline = getSalesContactDeadline(
    item.last_contacted_at,
    item.activated_at,
    salesInterval || null,
  )
  const draftSalesInfo = getDeadlineInfo(draftSalesDeadline)

  const beginEditing = () => {
    setNote(item.note ?? '')
    setNextActions(item.next_actions ?? [])
    setReturnPreset(item.return_visit_deadline_preset ?? '')
    setReturnDeadline(item.return_visit_deadline ?? '')
    setSalesInterval(item.sales_contact_interval_days ?? '')
    setIsEditing(true)
  }

  const updateReturnPreset = (value: ReturnVisitDeadlinePreset | '') => {
    setReturnPreset(value)
    setReturnDeadline(value ? calculateReturnVisitDeadline(value) : '')
  }

  const saveEditing = async () => {
    const succeeded = await onPatch(item.id, {
      action: 'update',
      nextActions,
      returnVisitDeadlinePreset: returnPreset || null,
      salesContactIntervalDays: salesInterval || null,
      note,
    })
    if (succeeded) setIsEditing(false)
  }

  return (
    <article
      className={styles.followUpCard}
      style={{ borderLeftColor: DEADLINE_META[urgency.status].color }}
    >
      <div className={styles.cardHeader}>
        <Link href={`/customer/${item.customer_id}`} style={{ textDecoration: 'none', minWidth: 0, flex: 1 }}>
          <CustomerName
            customer={item.customer}
            assignedCastLabel={
              item.cast?.display_name
              || item.cast?.cast_name
              || item.customer.cast_name
              || '未設定'
            }
          />
        </Link>
        {!isEditing && (
          <button
            type="button"
            aria-expanded={isEditing}
            disabled={busy}
            onClick={beginEditing}
            className={styles.editButton}
          >
            <span aria-hidden="true">✎</span> 編集
          </button>
        )}
      </div>

      {!item.assignment_current && (
        <div className={styles.assignmentWarning}>
          担当変更あり・旧キャストへの通知対象外
        </div>
      )}

      {isEditing ? (
        <div className={styles.editPanel}>
          <div className={styles.editHeading}>
            <div>
              <div className={styles.sectionLabel}>編集モード</div>
              <div className={styles.editTitle}>行動・期限・メモを変更</div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setIsEditing(false)}
              className={styles.cancelTopButton}
            >
              キャンセル
            </button>
          </div>

          <div className={styles.editGrid}>
            <div className={styles.fullWidthField}>
              <div className={styles.editFieldLabel}>次の行動（複数選択）</div>
              <MultiActionSelect
                value={nextActions}
                onChange={setNextActions}
                disabled={busy}
              />
            </div>

            <label className={styles.editField}>
              再来店期限
              <select
                value={returnPreset}
                disabled={busy}
                onChange={event => updateReturnPreset(
                  event.target.value as ReturnVisitDeadlinePreset | '',
                )}
                className={styles.formControl}
              >
                <option value="">未設定</option>
                {RETURN_VISIT_DEADLINE_PRESETS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span
                className={styles.draftDeadline}
                style={{ color: DEADLINE_META[draftReturnInfo.status].color }}
              >
                {draftReturnInfo.label}
                {returnDeadline ? `（${returnDeadline.replaceAll('-', '/')}）` : ''}
              </span>
            </label>

            <label className={styles.editField}>
              営業連絡間隔
              <select
                value={salesInterval}
                disabled={busy}
                onChange={event => setSalesInterval(
                  event.target.value
                    ? Number(event.target.value) as SalesContactIntervalDays
                    : '',
                )}
                className={styles.formControl}
              >
                <option value="">未設定</option>
                {SALES_CONTACT_INTERVALS.map(option => (
                  <option key={option.days} value={option.days}>{option.label}</option>
                ))}
              </select>
              <span
                className={styles.draftDeadline}
                style={{
                  color: DEADLINE_META[salesInterval ? draftSalesInfo.status : 'unscheduled'].color,
                }}
              >
                {salesInterval
                  ? `${draftSalesInfo.label}${draftSalesDeadline ? `（${draftSalesDeadline.replaceAll('-', '/')}）` : ''}`
                  : '間隔未設定'}
              </span>
            </label>

            <label className={`${styles.editField} ${styles.fullWidthField}`}>
              追いかけメモ
              <textarea
                value={note}
                disabled={busy}
                onChange={event => setNote(event.target.value)}
                placeholder="次に話すことなど"
                rows={3}
                className={styles.memoInput}
              />
            </label>
          </div>

          <div className={styles.editActions}>
            <button
              type="button"
              disabled={busy}
              onClick={saveEditing}
              className={styles.saveButton}
            >
              変更を保存
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setIsEditing(false)}
              className={styles.cancelButton}
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPatch(item.id, { action: 'remove' })}
              className={styles.removeButton}
            >
              リストから外す
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.readOnlySummary}>
            <div className={styles.nextActionPanel}>
              <span className={styles.sectionLabel}>次にやること</span>
              <div className={styles.actionTags}>
                {item.next_actions.length > 0
                  ? item.next_actions.map(action => (
                      <span key={action} className={styles.actionTag}>{action}</span>
                    ))
                  : <span className={styles.emptyTag}>行動未設定</span>}
              </div>
            </div>

            <div className={styles.deadlineGrid}>
              <div
                className={styles.deadlineTile}
                style={{ background: DEADLINE_META[persistedSalesInfo.status].background }}
              >
                <span className={styles.sectionLabel}>営業連絡</span>
                <strong style={{ color: DEADLINE_META[persistedSalesInfo.status].color }}>
                  {item.sales_contact_interval_days ? persistedSalesInfo.label : '間隔未設定'}
                </strong>
                <small>{persistedSalesDeadline?.replaceAll('-', '/') ?? '期限なし'}</small>
              </div>
              <div
                className={styles.deadlineTile}
                style={{ background: DEADLINE_META[persistedReturnInfo.status].background }}
              >
                <span className={styles.sectionLabel}>再来店期限</span>
                <strong style={{ color: DEADLINE_META[persistedReturnInfo.status].color }}>
                  {persistedReturnInfo.label}
                </strong>
                <small>{item.return_visit_deadline?.replaceAll('-', '/') ?? '期限なし'}</small>
              </div>
            </div>

            <div className={styles.notePanel}>
              <span className={styles.sectionLabel}>追いかけメモ</span>
              <p>{item.note?.trim() || 'メモはまだありません'}</p>
              <div className={styles.lastContact}>
                最終連絡：{formatDateTime(item.last_contacted_at)}
              </div>
            </div>
          </div>

          <div className={styles.viewActions}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPatch(item.id, { action: 'contact' })}
              className={styles.contactButton}
            >
              連絡した
            </button>
            <Link href={`/customer/${item.customer_id}`} className={styles.detailButton}>
              お客様詳細
            </Link>
          </div>
          <div className={styles.contactHint}>
            「連絡した」を押すと、営業連絡間隔を今日から数え直します。追いかけ中からは外れません。
          </div>
        </>
      )}
    </article>
  )
}

export default function FollowUpsPage() {
  useScrollTopOnMount()
  const { casts, isLoaded: castsLoaded } = useCasts()
  const [role, setRole] = useState<string | null>(null)
  const [selectedCastId, setSelectedCastId] = useState('')
  const [tab, setTab] = useState<FollowUpTab>('active')
  const [data, setData] = useState<FollowUpResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [nominationGroup, setNominationGroup] = useState<NominationGroup>('全て')
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all')
  const [followUpSort, setFollowUpSort] = useState<FollowUpSortKey>('priority')
  const undoToast = useUndoToast()

  useEffect(() => {
    let cancelled = false
    const loadMe = async () => {
      const me = await fetchMe()
      if (cancelled || !me) return
      setRole(me.role)
      if (me.role === 'cast') setSelectedCastId(me.id)
    }
    loadMe()
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async () => {
    if (!role) return
    setLoading(true)
    setMessage(null)
    try {
      const query = selectedCastId ? `?castId=${encodeURIComponent(selectedCastId)}` : ''
      const response = await fetch(`/api/follow-ups${query}`, { cache: 'no-store' })
      const json = await response.json() as FollowUpResponse & { error?: string }
      if (!response.ok) throw new Error(json.error ?? '追いかけリストの取得に失敗しました')
      setData(json)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '追いかけリストの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [role, selectedCastId])

  useEffect(() => {
    load()
  }, [load])

  const requestPatch = async (id: string, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/follow-ups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(json.error ?? '更新に失敗しました')
  }

  const patch = async (id: string, payload: Record<string, unknown>): Promise<boolean> => {
    setBusyId(id)
    setMessage(null)
    try {
      await requestPatch(id, payload)
      const action = payload.action
      setMessage(payload.action === 'contact'
        ? '連絡日時を記録しました。お客様は追いかけ中に残っています。'
        : '追いかけリストを更新しました')
      await load()
      if (action === 'remove') {
        undoToast.show('追いかけリストから外しました', async () => {
          await requestPatch(id, { action: 'reactivate' })
          setMessage('追いかけ中へ戻しました')
          await load()
        })
      }
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新に失敗しました')
      return false
    } finally {
      setBusyId(null)
    }
  }

  const addCandidate = async (customerId: string) => {
    setBusyId(`candidate-${customerId}`)
    setMessage(null)
    try {
      const response = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      })
      const json = await response.json().catch(() => ({})) as {
        id?: string
        error?: string
        wasAlreadyActive?: boolean
      }
      if (!response.ok) throw new Error(json.error ?? '追いかけリストへの追加に失敗しました')
      setMessage(json.wasAlreadyActive
        ? 'すでに追いかけリストに入っています'
        : '追いかけリストに追加しました')
      const addedCandidate = data?.candidates.find(candidate => candidate.id === customerId)
      const addedNomination = addedCandidate?.nomination_status
      if (addedNomination === '本指名' || addedNomination === '場内' || addedNomination === 'フリー') {
        setNominationGroup(addedNomination)
      } else if (addedCandidate) {
        setNominationGroup('その他')
      }
      setRegionFilter('all')
      setTab('active')
      await load()
      if (json.id && !json.wasAlreadyActive) {
        undoToast.show('追いかけリストに追加しました', async () => {
          await requestPatch(json.id!, { action: 'remove' })
          setMessage('追加を取り消しました')
          await load()
        })
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '追加に失敗しました')
    } finally {
      setBusyId(null)
    }
  }

  const activeItems = useMemo(() => data?.items.filter(item => item.is_active) ?? [], [data])
  const historyItems = useMemo(() => data?.items.filter(item => !item.is_active) ?? [], [data])
  const nominationCounts = useMemo(() => {
    const counts: Record<NominationCategory, number> = {
      本指名: 0,
      場内: 0,
      フリー: 0,
      その他: 0,
    }
    for (const item of activeItems) {
      const status = item.customer.nomination_status
      if (status === '本指名' || status === '場内' || status === 'フリー') counts[status] += 1
      else counts.その他 += 1
    }
    return counts
  }, [activeItems])
  const nominationItems = useMemo(() => activeItems.filter(item => {
    if (nominationGroup === '全て') return true
    const status = item.customer.nomination_status
    if (nominationGroup === 'その他') {
      return status !== '本指名' && status !== '場内' && status !== 'フリー'
    }
    return status === nominationGroup
  }), [activeItems, nominationGroup])
  const regionCounts = useMemo(() => {
    const counts: Record<FollowUpRegionGroup, number> = {
      fukuoka: 0,
      outside: 0,
      unset: 0,
    }
    for (const item of nominationItems) {
      counts[classifyFollowUpRegion(item.customer.region)] += 1
    }
    return counts
  }, [nominationItems])
  const visibleActiveItems = useMemo(() => {
    const filteredItems = nominationItems
      .filter(item => regionFilter === 'all'
        || classifyFollowUpRegion(item.customer.region) === regionFilter)
    return sortFollowUpItems(filteredItems, followUpSort)
  }, [nominationItems, regionFilter, followUpSort])
  const tabs: Array<{ key: FollowUpTab; label: string; count: number }> = [
    { key: 'active', label: '追いかけ中', count: activeItems.length },
    { key: 'candidates', label: '候補', count: data?.candidates.length ?? 0 },
    { key: 'history', label: '履歴', count: historyItems.length },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      paddingBottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
    }}>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: C.headerBg,
        borderBottom: `1px solid ${C.border}`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <div style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}>
          <Link href="/home" style={{ display: 'inline-flex' }}>
            <Image
              src="/logo.png"
              alt="Éclat"
              width={96}
              height={29}
              priority
              style={{ objectFit: 'contain', filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell />
            <UserChip />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '18px 14px 36px' }}>
        <div>
          <div style={{ fontSize: 10, color: C.pink, fontWeight: 700, letterSpacing: '0.2em' }}>
            追いかけリスト
          </div>
          <h1 style={{ fontSize: 22, color: C.dark, margin: '5px 0 0' }}>
            次に動くお客様
          </h1>
          <p style={{ fontSize: 10.5, color: C.pinkMuted, lineHeight: 1.7, margin: '8px 0 0' }}>
            やることと期限が近い順に確認できます。編集を押すと、行動・期限・メモを変更できます。
          </p>
        </div>

        {role === 'admin' && (
          <label style={{ display: 'block', marginTop: 16, fontSize: 10, color: C.pinkMuted }}>
            表示するキャスト
            <select
              value={selectedCastId}
              onChange={event => setSelectedCastId(event.target.value)}
              disabled={!castsLoaded}
              style={{
                width: '100%',
                height: 44,
                marginTop: 6,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                background: '#FFF',
                color: C.dark,
                padding: '0 12px',
                fontFamily: 'inherit',
              }}
            >
              <option value="">全キャスト</option>
              {casts.filter(cast => cast.is_active).map(cast => (
                <option key={cast.id} value={cast.id}>
                  {cast.display_name || cast.cast_name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          marginTop: 18,
          borderBottom: `1px solid ${C.border}`,
        }}>
          {tabs.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              style={{
                height: 44,
                border: 'none',
                borderBottom: tab === item.key ? `3px solid ${C.pink}` : '3px solid transparent',
                background: 'transparent',
                color: tab === item.key ? C.pink : C.pinkMuted,
                fontSize: 11,
                fontWeight: tab === item.key ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {item.label} <span style={{ fontSize: 9 }}>({item.count})</span>
            </button>
          ))}
        </div>

        {message && (
          <div style={{
            marginTop: 12,
            padding: '9px 12px',
            borderRadius: 10,
            background: message.includes('失敗') || message.includes('権限') ? '#FBE3E8' : '#FFF2F6',
            color: message.includes('失敗') || message.includes('権限') ? '#9B2C42' : C.dark2,
            fontSize: 10.5,
            lineHeight: 1.6,
          }}>
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 48 }}>
            <Spinner size="md" label="追いかけリストを読み込み中…" />
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {tab === 'active' && (
              <>
                <div style={{
                  display: 'flex',
                  gap: 6,
                  overflowX: 'auto',
                  paddingBottom: 2,
                  scrollbarWidth: 'none',
                }}>
                  {([
                    ['全て', '全て', activeItems.length],
                    ['本指名', '本指名', nominationCounts.本指名],
                    ['場内', '場内', nominationCounts.場内],
                    ['フリー', 'フリー', nominationCounts.フリー],
                    ...(nominationCounts.その他 > 0
                      ? [['その他', '未設定・その他', nominationCounts.その他] as const]
                      : []),
                  ] as Array<[NominationGroup, string, number]>).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setNominationGroup(key)
                        setRegionFilter('all')
                      }}
                      style={{
                        height: 34,
                        padding: '0 11px',
                        borderRadius: 17,
                        border: `1px solid ${nominationGroup === key ? C.pink : C.border}`,
                        background: nominationGroup === key ? '#FFF0F4' : '#FFF',
                        color: nominationGroup === key ? C.pinkDeep : C.pinkMuted,
                        fontFamily: 'inherit',
                        fontSize: 9.5,
                        fontWeight: nominationGroup === key ? 700 : 500,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                    >
                      {label} {count}
                    </button>
                  ))}
                </div>
                <div style={{
                  padding: '9px 10px',
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  background: '#FFF',
                }}>
                  <div style={{
                    marginBottom: 7,
                    color: C.pinkMuted,
                    fontSize: 9,
                    fontWeight: 700,
                  }}>
                    {nominationGroup === '全て'
                      ? '全てのお客様を地域で分ける'
                      : `${nominationGroup}を地域で分ける`}
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: 6,
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                  }}>
                    {([
                      ['all', 'すべて', nominationItems.length],
                      ['fukuoka', '福岡県', regionCounts.fukuoka],
                      ['outside', '県外', regionCounts.outside],
                      ['unset', '地域未設定', regionCounts.unset],
                    ] as Array<[RegionFilter, string, number]>).map(([key, label, count]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRegionFilter(key)}
                        style={{
                          height: 32,
                          padding: '0 10px',
                          borderRadius: 16,
                          border: `1px solid ${regionFilter === key ? C.pink : C.border}`,
                          background: regionFilter === key ? '#FFF0F4' : '#FFF',
                          color: regionFilter === key ? C.pinkDeep : C.pinkMuted,
                          fontFamily: 'inherit',
                          fontSize: 9.5,
                          fontWeight: regionFilter === key ? 700 : 500,
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                      >
                        {label} {count}
                      </button>
                    ))}
                  </div>
                </div>
                <label style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr)',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  color: C.pinkMuted,
                  background: '#FFF',
                  fontSize: 9.5,
                  fontWeight: 700,
                }}>
                  並び替え
                  <select
                    aria-label="追いかけ中のお客様の並び替え"
                    value={followUpSort}
                    onChange={event => setFollowUpSort(event.target.value as FollowUpSortKey)}
                    style={{
                      width: '100%',
                      minWidth: 0,
                      height: 36,
                      padding: '0 34px 0 11px',
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      color: C.dark2,
                      background: '#FFF',
                      fontFamily: 'inherit',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {FOLLOW_UP_SORT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {visibleActiveItems.length > 0
                ? visibleActiveItems.map(item => (
                    <ActiveFollowUpCard
                      key={item.id}
                      item={item}
                      busy={busyId === item.id}
                      onPatch={patch}
                    />
                  ))
                : <EmptyText>{activeItems.length > 0
                  ? `${nominationGroup}のこの地域にお客様はいません`
                  : '追いかけ中のお客様はいません'}</EmptyText>}
              </>
            )}

            {tab === 'candidates' && (
              data?.candidate_scope_required
                ? <EmptyText>候補を見るキャストを上から選んでください</EmptyText>
                : data && data.candidates.length > 0
                  ? data.candidates.map(candidate => (
                      <article key={candidate.id} style={{
                        background: '#FFF',
                        border: `1px solid ${C.border}`,
                        borderRadius: 16,
                        padding: 14,
                      }}>
                        <Link href={`/customer/${candidate.id}`} style={{ textDecoration: 'none' }}>
                          <CustomerName customer={candidate} />
                        </Link>
                        <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: C.dark2 }}>
                          {candidate.reasons.map(reason => (
                            <li key={reason} style={{ fontSize: 10.5, lineHeight: 1.7 }}>{reason}</li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          disabled={busyId === `candidate-${candidate.id}`}
                          onClick={() => addCandidate(candidate.id)}
                          style={{
                            width: '100%',
                            height: 40,
                            marginTop: 12,
                            border: `1px solid ${C.pink}`,
                            borderRadius: 12,
                            background: '#FFF',
                            color: C.pink,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: busyId ? 'wait' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          追いかけリストに追加
                        </button>
                      </article>
                    ))
                  : <EmptyText>今の基準に当てはまる候補はいません</EmptyText>
            )}

            {tab === 'history' && (
              historyItems.length > 0
                ? historyItems.map(item => (
                    <FollowUpCard
                      key={item.id}
                      item={item}
                      mode="history"
                      busy={busyId === item.id}
                      onPatch={patch}
                    />
                  ))
                : <EmptyText>リストから外した履歴はありません</EmptyText>
            )}
          </div>
        )}
      </main>
      <BottomNav />
      {undoToast.ToastView}
    </div>
  )
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '42px 16px',
      textAlign: 'center',
      color: C.pinkMuted,
      fontSize: 11,
      background: '#FFF',
      border: `1px dashed ${C.border}`,
      borderRadius: 14,
    }}>
      {children}
    </div>
  )
}
