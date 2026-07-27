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
import {
  FOLLOW_UP_NEXT_ACTIONS,
  classifyFollowUpTiming,
  getJstDateString,
  type FollowUpNextAction,
  type FollowUpTiming,
} from '@/lib/followUpWorkflow'

type FollowUpTab = 'active' | 'candidates' | 'history'

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
  next_action: FollowUpNextAction | null
  next_contact_date: string | null
  is_active: boolean
  last_contacted_at: string | null
  removed_at: string | null
  activated_at: string
  assignment_current: boolean
  customer: CustomerSummary
  cast: { id: string; cast_name: string | null; display_name: string | null } | null
}

type ActiveFilter = 'all' | FollowUpTiming

const TIMING_META: Record<FollowUpTiming, { label: string; color: string; background: string }> = {
  overdue: { label: '期限超過', color: '#A62D47', background: '#FBE3E8' },
  today: { label: '今日', color: '#9A5D00', background: '#FFF0CC' },
  thisWeek: { label: '今週', color: '#356A52', background: '#E2F4EA' },
  later: { label: 'それ以降', color: '#5B6F87', background: '#E8F0F7' },
  unscheduled: { label: '日付なし', color: C.pinkMuted, background: '#F4EEF0' },
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

function TimingBadge({ timing }: { timing: FollowUpTiming }) {
  const meta = TIMING_META[timing]
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
      {meta.label}
    </span>
  )
}

function CustomerName({ customer }: { customer: CustomerSummary | Candidate }) {
  const name = customer.customer_name?.trim() || customer.nickname?.trim() || 'お名前未登録'
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 15, color: C.dark, fontWeight: 700 }}>
        {name}
        {customer.nickname && customer.nickname !== name && (
          <span style={{ fontSize: 10, color: C.pinkMuted, marginLeft: 6 }}>
            ({customer.nickname})
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
        <span style={{
          fontSize: 9,
          color: C.pink,
          border: `1px solid ${C.pink}`,
          borderRadius: 8,
          padding: '2px 7px',
        }}>
          {customer.customer_rank === '切れた' ? '切れた' : `${customer.customer_rank ?? '未設定'}ランク`}
        </span>
        {customer.nomination_status && (
          <span style={{ fontSize: 9, color: C.pinkMuted, padding: '2px 2px' }}>
            {customer.nomination_status}
          </span>
        )}
        {customer.region && (
          <span style={{ fontSize: 9, color: C.pinkMuted, padding: '2px 2px' }}>
            {customer.region}
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
  onPatch: (id: string, payload: Record<string, unknown>) => Promise<void>
}) {
  const [nextDate, setNextDate] = useState(item.next_contact_date ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const [nextAction, setNextAction] = useState<FollowUpNextAction | ''>(item.next_action ?? '')
  const timing = classifyFollowUpTiming(item.next_contact_date, getJstDateString())

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
          <CustomerName customer={item.customer} />
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
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginTop: 9 }}>
          <TimingBadge timing={timing} />
          <span style={{ fontSize: 10, color: C.dark2, fontWeight: 700 }}>
            次にすること：{item.next_action ?? '未設定'}
          </span>
          {item.next_contact_date && (
            <span style={{ fontSize: 9.5, color: C.pinkMuted }}>
              {item.next_contact_date.replaceAll('-', '/')}
            </span>
          )}
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
            <label style={{ fontSize: 9.5, color: C.pinkMuted }}>
              次の行動
              <select
                value={nextAction}
                onChange={event => setNextAction(event.target.value as FollowUpNextAction | '')}
                style={{
                  width: '100%',
                  height: 38,
                  marginTop: 5,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '0 8px',
                  color: nextAction ? C.dark : C.pinkMuted,
                  background: '#FFFAFC',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              >
                <option value="">未設定</option>
                {FOLLOW_UP_NEXT_ACTIONS.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </label>
            <div style={{ fontSize: 9.5, color: C.pinkMuted }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <label htmlFor={`follow-up-date-${item.id}`}>次回連絡日</label>
                <button
                  type="button"
                  disabled={busy || !nextDate}
                  onClick={() => setNextDate('')}
                  style={{
                    minHeight: 28,
                    border: 'none',
                    background: 'transparent',
                    color: nextDate ? C.pink : C.pinkMuted,
                    fontSize: 9.5,
                    fontWeight: 700,
                    cursor: busy || !nextDate ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    padding: '2px 0 2px 8px',
                    opacity: nextDate ? 1 : 0.55,
                  }}
                >
                  日付を取り消す
                </button>
              </div>
              <input
                id={`follow-up-date-${item.id}`}
                type="date"
                value={nextDate}
                onChange={event => setNextDate(event.target.value)}
                style={{
                  width: '100%',
                  height: 38,
                  marginTop: 5,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '0 8px',
                  color: C.dark,
                  background: '#FFFAFC',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>
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
                nextAction: nextAction || null,
                nextContactDate: nextDate || null,
                note,
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
                nextAction: nextAction || null,
                nextContactDate: nextDate || null,
                note,
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
              予定・メモを保存
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
            「連絡した」を押しても追いかけ中のまま残ります。
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
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
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

  const patch = async (id: string, payload: Record<string, unknown>) => {
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新に失敗しました')
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
  const activeCounts = useMemo(() => {
    const counts: Record<FollowUpTiming, number> = {
      overdue: 0,
      today: 0,
      thisWeek: 0,
      later: 0,
      unscheduled: 0,
    }
    const today = getJstDateString()
    for (const item of activeItems) {
      counts[classifyFollowUpTiming(item.next_contact_date, today)] += 1
    }
    return counts
  }, [activeItems])
  const visibleActiveItems = useMemo(() => {
    const today = getJstDateString()
    const timingOrder: Record<FollowUpTiming, number> = {
      overdue: 0,
      today: 1,
      thisWeek: 2,
      later: 3,
      unscheduled: 4,
    }
    return activeItems
      .filter(item => activeFilter === 'all'
        || classifyFollowUpTiming(item.next_contact_date, today) === activeFilter)
      .sort((a, b) => {
        const aTiming = classifyFollowUpTiming(a.next_contact_date, today)
        const bTiming = classifyFollowUpTiming(b.next_contact_date, today)
        if (timingOrder[aTiming] !== timingOrder[bTiming]) {
          return timingOrder[aTiming] - timingOrder[bTiming]
        }
        return (a.next_contact_date ?? '9999-12-31').localeCompare(b.next_contact_date ?? '9999-12-31')
      })
  }, [activeFilter, activeItems])
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

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '18px 14px 36px' }}>
        <div>
          <div style={{ fontSize: 10, color: C.pink, fontWeight: 700, letterSpacing: '0.2em' }}>
            追いかけリスト
          </div>
          <h1 style={{ fontSize: 22, color: C.dark, margin: '5px 0 0' }}>
            忘れずに連絡したいお客様
          </h1>
          <p style={{ fontSize: 10.5, color: C.pinkMuted, lineHeight: 1.7, margin: '8px 0 0' }}>
            連絡した後も、あなたが外すまで追いかけ中に残ります。候補は提案だけで、自動追加されません。
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
                    ['all', 'すべて', activeItems.length],
                    ['overdue', '期限超過', activeCounts.overdue],
                    ['today', '今日', activeCounts.today],
                    ['thisWeek', '今週', activeCounts.thisWeek],
                    ['unscheduled', '日付なし', activeCounts.unscheduled],
                  ] as Array<[ActiveFilter, string, number]>).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveFilter(key)}
                      style={{
                        height: 34,
                        padding: '0 11px',
                        borderRadius: 17,
                        border: `1px solid ${activeFilter === key ? C.pink : C.border}`,
                        background: activeFilter === key ? '#FFF0F4' : '#FFF',
                        color: activeFilter === key ? C.pinkDeep : C.pinkMuted,
                        fontFamily: 'inherit',
                        fontSize: 9.5,
                        fontWeight: activeFilter === key ? 700 : 500,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                    >
                      {label} {count}
                    </button>
                  ))}
                </div>
                {visibleActiveItems.length > 0
                ? visibleActiveItems.map(item => (
                    <FollowUpCard
                      key={item.id}
                      item={item}
                      mode="active"
                      busy={busyId === item.id}
                      onPatch={patch}
                    />
                  ))
                : <EmptyText>{activeItems.length > 0 ? 'この条件のお客様はいません' : '追いかけ中のお客様はいません'}</EmptyText>}
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
