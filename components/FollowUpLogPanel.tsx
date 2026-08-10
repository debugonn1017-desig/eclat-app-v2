'use client'

import { useCallback, useEffect, useState } from 'react'
import { useUndoToast } from '@/hooks/useUndoToast'
import type { FollowUpTimelineEvent } from '@/lib/followUpLog'
import {
  FOLLOW_UP_CHECK_RESULTS,
  type FollowUpCheckResult,
} from '@/lib/followUpWorkflow'
import Spinner from '@/components/ui/Spinner'
import styles from './FollowUpLogPanel.module.css'

type FollowUpLogResponse = {
  status: 'never' | 'active' | 'inactive'
  follow_up: { id: string; is_active: boolean } | null
  timeline: FollowUpTimelineEvent[]
  can_check: boolean
  can_edit: boolean
  error?: string
}

type Props = {
  customerId: string
  followUpId?: string | null
  initialCheckOpen?: boolean
  onChanged?: () => void | Promise<void>
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function formatEventDay(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo',
  }).format(new Date(value))
}

function formatYen(value: number) {
  return `${Math.round(value).toLocaleString('ja-JP')}円`
}

function roleLabel(role: string | null) {
  if (role === 'cast') return 'キャスト'
  if (role === 'admin') return '管理者・黒服'
  return role || '役割未設定'
}

export default function FollowUpLogPanel({
  customerId,
  followUpId,
  initialCheckOpen = false,
  onChanged,
}: Props) {
  const [data, setData] = useState<FollowUpLogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [checkOpen, setCheckOpen] = useState(initialCheckOpen)
  const [result, setResult] = useState<FollowUpCheckResult | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const undoToast = useUndoToast()

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const query = followUpId
        ? `followUpId=${encodeURIComponent(followUpId)}`
        : `customerId=${encodeURIComponent(customerId)}`
      const response = await fetch(`/api/follow-ups/log?${query}`, { cache: 'no-store' })
      const json = await response.json() as FollowUpLogResponse
      if (!response.ok) throw new Error(json.error ?? '追いかけログを取得できませんでした')
      setData(json)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '追いかけログを取得できませんでした')
    } finally {
      setLoading(false)
    }
  }, [customerId, followUpId])

  useEffect(() => { load() }, [load])

  const addOrReactivate = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const isInactive = data?.status === 'inactive' && data.follow_up
      const response = isInactive
        ? await fetch(`/api/follow-ups/${data.follow_up!.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reactivate' }),
        })
        : await fetch('/api/follow-ups', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId }),
        })
      const json = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(json.error ?? '追いかけを開始できませんでした')
      await load()
      await onChanged?.()
      setMessage('追いかけを開始しました')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '追いかけを開始できませんでした')
    } finally {
      setBusy(false)
    }
  }

  const saveCheck = async () => {
    if (!data?.follow_up || !result) {
      setMessage('担当者チェックの結果を選んでください')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/follow-ups/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpId: data.follow_up.id, result, note }),
      })
      const json = await response.json().catch(() => ({})) as { id?: string; error?: string }
      if (!response.ok || !json.id) throw new Error(json.error ?? '担当者チェックを保存できませんでした')
      setResult(null)
      setNote('')
      setCheckOpen(false)
      await load()
      await onChanged?.()
      undoToast.show('担当者チェックを保存しました', async () => {
        const undoResponse = await fetch(`/api/follow-ups/log/${json.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'void' }),
        })
        const undoJson = await undoResponse.json().catch(() => ({})) as { error?: string }
        if (!undoResponse.ok) throw new Error(undoJson.error ?? '担当者チェックを取り消せませんでした')
        await load()
        await onChanged?.()
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '担当者チェックを保存できませんでした')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div style={{ padding: 28 }}><Spinner size="sm" label="追いかけログを読み込み中…" /></div>

  if (!data?.follow_up) {
    return (
      <div className={styles.panel}>
        {message && <div className={styles.message}>{message}</div>}
        <div className={styles.emptyCard}>
          <p>現在、追いかけリストには入っていません。<br />追いかけを始めると、連絡結果から再来店まで確認できます。</p>
          {data?.can_edit && (
            <button type="button" className={styles.primaryButton} disabled={busy} onClick={addOrReactivate}>
              追いかけに追加
            </button>
          )}
        </div>
        {undoToast.ToastView}
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {message && <div className={styles.message}>{message}</div>}
      <div className={styles.statusCard}>
        <div className={styles.statusRow}>
          <span className={styles.statusBadge}>
            {data.status === 'active' ? '追いかけ中' : '現在は追いかけていません'}
          </span>
          {data.status === 'active' && data.can_check && (
            <button type="button" className={styles.primaryButton} onClick={() => setCheckOpen(value => !value)}>
              担当者チェック
            </button>
          )}
          {data.status === 'inactive' && data.can_edit && (
            <button type="button" className={styles.primaryButton} disabled={busy} onClick={addOrReactivate}>
              もう一度追いかける
            </button>
          )}
        </div>
      </div>

      {checkOpen && data.status === 'active' && data.can_check && (
        <div className={styles.checkForm}>
          <strong style={{ fontSize: 12 }}>今回の確認結果</strong>
          <div className={styles.checkOptions}>
            {FOLLOW_UP_CHECK_RESULTS.map(option => (
              <button
                key={option}
                type="button"
                className={`${styles.checkOption} ${result === option ? styles.checkOptionSelected : ''}`}
                onClick={() => setResult(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <textarea
            className={styles.memo}
            value={note}
            maxLength={1000}
            onChange={event => setNote(event.target.value)}
            placeholder="確認内容のメモ（任意）"
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 9 }}>
            <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setCheckOpen(false)}>
              キャンセル
            </button>
            <button type="button" className={styles.primaryButton} disabled={busy || !result} onClick={saveCheck}>
              {busy ? '保存中…' : 'チェックを保存'}
            </button>
          </div>
        </div>
      )}

      {data.timeline.length === 0 ? (
        <div className={styles.emptyCard}><p>追いかけログはまだありません。</p></div>
      ) : (
        <div className={styles.timeline}>
          {data.timeline.map(event => {
            if (event.kind === 'visit') {
              const hour = event.visitTime ? `${Number(event.visitTime.slice(0, 2))}時台` : '時間未登録'
              return (
                <div key={event.id} className={`${styles.event} ${styles.visitEvent}`}>
                  <div className={styles.eventHeader}>
                    <strong>追いかけ後に再来店</strong>
                    <time>{formatEventDate(event.occurredAt)}</time>
                  </div>
                  <div className={styles.eventMeta}>
                    {hour}・{formatYen(event.amountSpent)}
                    {event.hasDouhan ? '・同伴' : ''}
                    {event.hasAfter ? '・アフター' : ''}
                  </div>
                </div>
              )
            }
            if (event.kind === 'contact') {
              return (
                <div key={event.id} className={`${styles.event} ${styles.contactEvent}`}>
                  <div className={styles.eventHeader}>
                    <strong>{event.direction === 'sent' ? '連絡を送信' : 'お客様から返信'}</strong>
                    <time>{formatEventDay(event.occurredAt)}</time>
                  </div>
                  <div className={styles.eventMeta}>
                    {event.channel}{event.memo ? `・${event.memo}` : ''}
                  </div>
                </div>
              )
            }
            const label = event.eventType === 'started'
              ? '追いかけ開始'
              : event.eventType === 'ended'
                ? '追いかけ終了'
                : event.checkResult ?? '担当者チェック'
            return (
              <div key={event.id} className={styles.event}>
                <div className={styles.eventHeader}>
                  <strong>{label}</strong>
                  <time>{formatEventDate(event.occurredAt)}</time>
                </div>
                {event.note && <div className={styles.eventMeta}>{event.note}</div>}
                {event.eventType === 'check' && (
                  <details className={styles.auditDetails}>
                    <summary>ログ詳細</summary>
                    <div style={{ marginTop: 5 }}>
                      確認者：{event.actor.displayName || '記録なし'}（{roleLabel(event.actor.role)}）
                    </div>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}
      {undoToast.ToastView}
    </div>
  )
}
