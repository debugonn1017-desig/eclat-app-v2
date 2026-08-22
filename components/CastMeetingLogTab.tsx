'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  CAST_MEETING_LOG_STAFF_NAME_MAX,
  CAST_MEETING_LOG_TITLE_MAX,
  CAST_MEETING_LOG_TRANSCRIPT_MAX,
  type CastMeetingLog,
} from '@/lib/castMeetingLog'
import styles from './CastMeetingLogTab.module.css'

type Props = {
  castId: string
  castName: string
}

type ApiResponse = {
  default_staff_name?: string
  items?: CastMeetingLog[]
  error?: string
}

const getTodayJst = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const formatMeetingDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : value
}

const formatCreatedAt = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export default function CastMeetingLogTab({ castId, castName }: Props) {
  const [items, setItems] = useState<CastMeetingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [meetingDate, setMeetingDate] = useState(getTodayJst)
  const [title, setTitle] = useState('')
  const [staffName, setStaffName] = useState('')
  const [transcript, setTranscript] = useState('')
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [selectedLog, setSelectedLog] = useState<CastMeetingLog | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch(
        `/api/cast-meeting-logs?castId=${encodeURIComponent(castId)}`,
        { cache: 'no-store' },
      )
      const data = await response.json().catch(() => ({})) as ApiResponse
      if (!response.ok) throw new Error(data.error ?? 'MTログの取得に失敗しました')
      setItems(data.items ?? [])
      setStaffName(current => current || data.default_staff_name || '')
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'MTログの取得に失敗しました' })
    } finally {
      setLoading(false)
    }
  }, [castId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedLog) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedLog(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedLog])

  const openForm = () => {
    setMeetingDate(getTodayJst())
    setTitle('')
    setTranscript('')
    setMessage(null)
    setFormOpen(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/cast-meeting-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ castId, meetingDate, title, staffName, transcript }),
      })
      const data = await response.json().catch(() => ({})) as ApiResponse
      if (!response.ok) throw new Error(data.error ?? 'MTログの保存に失敗しました')
      setFormOpen(false)
      await load()
      setMessage({ kind: 'success', text: 'MTログを保存しました' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'MTログの保存に失敗しました' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>MT LOG</span>
          <h2>{castName}さんのMTログ</h2>
          <p>面談の文字起こしを残し、話した内容を時系列で振り返れます。</p>
        </div>
        {!formOpen && (
          <button type="button" className={styles.addButton} onClick={openForm}>
            ＋ MTログを記録
          </button>
        )}
      </header>

      <div className={styles.privateNotice}>
        🔒 この内容は黒服アカウントだけに表示され、キャスト本人には表示されません。
      </div>

      {message && (
        <div className={message.kind === 'error' ? styles.errorMessage : styles.successMessage} role="status">
          {message.text}
        </div>
      )}

      {formOpen && (
        <form className={styles.formCard} onSubmit={handleSubmit}>
          <div className={styles.formHeading}>
            <div>
              <span>新しい記録</span>
              <h3>MT内容を登録</h3>
            </div>
            <button type="button" className={styles.closeFormButton} onClick={() => setFormOpen(false)} disabled={busy}>
              閉じる
            </button>
          </div>

          <div className={styles.formGrid}>
            <label>
              <span>MT日</span>
              <input type="date" value={meetingDate} onChange={event => setMeetingDate(event.target.value)} required />
            </label>
            <label>
              <span>担当者</span>
              <input
                value={staffName}
                onChange={event => setStaffName(event.target.value)}
                maxLength={CAST_MEETING_LOG_STAFF_NAME_MAX}
                placeholder="MTを担当した黒服名"
                required
              />
            </label>
          </div>
          <label className={styles.fullField}>
            <span>題名</span>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={CAST_MEETING_LOG_TITLE_MAX}
              placeholder="例：8月の振り返りと来月の行動"
              required
            />
          </label>
          <label className={styles.fullField}>
            <span>文字起こし全文</span>
            <textarea
              value={transcript}
              onChange={event => setTranscript(event.target.value)}
              maxLength={CAST_MEETING_LOG_TRANSCRIPT_MAX}
              placeholder="AIボイスレコーダーで文字起こしした全文を、そのまま貼り付けてください"
              rows={12}
              required
            />
            <small>{transcript.length.toLocaleString()} / {CAST_MEETING_LOG_TRANSCRIPT_MAX.toLocaleString()}文字</small>
          </label>
          <div className={styles.formActions}>
            <button type="button" className={styles.cancelButton} onClick={() => setFormOpen(false)} disabled={busy}>
              キャンセル
            </button>
            <button type="submit" className={styles.saveButton} disabled={busy}>
              {busy ? '保存中…' : 'MTログを保存'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={styles.stateCard}>読み込み中…</div>
      ) : items.length === 0 ? (
        <div className={styles.emptyCard}>
          <span>📝</span>
          <h3>MTログはまだありません</h3>
          <p>MT後に文字起こしを貼り付けると、ここに時系列で残ります。</p>
          {!formOpen && <button type="button" onClick={openForm}>最初のMTログを記録</button>}
        </div>
      ) : (
        <div className={styles.timeline} aria-label="MTログのタイムライン">
          {items.map(item => (
            <article key={item.id} className={styles.timelineItem}>
              <div className={styles.timelineDot} aria-hidden="true" />
              <button type="button" className={styles.logCard} onClick={() => setSelectedLog(item)}>
                <div className={styles.cardTop}>
                  <time dateTime={item.meeting_date}>{formatMeetingDate(item.meeting_date)}</time>
                  <span>全文を見る →</span>
                </div>
                <h3>{item.title}</h3>
                <div className={styles.cardMeta}>
                  <span>担当者：{item.staff_name}</span>
                  <span>登録：{item.created_by_name}</span>
                </div>
                <p>{item.transcript}</p>
              </button>
            </article>
          ))}
        </div>
      )}

      {selectedLog && (
        <div className={styles.overlay} role="presentation" onMouseDown={() => setSelectedLog(null)}>
          <section
            className={styles.overlayPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cast-meeting-log-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <header className={styles.overlayHeader}>
              <div>
                <span>{formatMeetingDate(selectedLog.meeting_date)}</span>
                <h2 id="cast-meeting-log-title">{selectedLog.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedLog(null)} aria-label="MTログを閉じる">×</button>
            </header>
            <div className={styles.overlayMeta}>
              <span>担当者：{selectedLog.staff_name}</span>
              <span>登録アカウント：{selectedLog.created_by_name}</span>
              <span>登録日時：{formatCreatedAt(selectedLog.created_at)}</span>
            </div>
            <div className={styles.transcriptHeading}>文字起こし全文</div>
            <div className={styles.transcript}>{selectedLog.transcript}</div>
            <button type="button" className={styles.overlayCloseButton} onClick={() => setSelectedLog(null)}>
              閉じる
            </button>
          </section>
        </div>
      )}
    </section>
  )
}
