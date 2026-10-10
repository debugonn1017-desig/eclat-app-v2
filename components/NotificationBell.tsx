'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { C } from '@/lib/colors'
import { useAnnouncements } from '@/hooks/useAnnouncements'

export default function NotificationBell() {
  const { userId, items, loaded, error, refresh, markRead, isUnread, unreadCount } = useAnnouncements()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const titleId = useId()
  const latest = items.slice(0, 5)
  if (!userId) return null

  return <>
    <button type="button" aria-label={`お知らせ${unreadCount ? `、未読${unreadCount}件` : ''}`}
      aria-haspopup="dialog" aria-expanded={open} title="お知らせ"
      onClick={() => { dialog.current?.showModal(); setOpen(true); void refresh() }}
      style={{ position: 'relative', width: 32, height: 32, flexShrink: 0, padding: 0,
        border: `1px solid ${C.border}`, borderRadius: '50%', color: C.pinkDeep,
        background: C.white, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
      <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      {unreadCount > 0 && <span aria-hidden style={{ position: 'absolute', right: -4, top: -4,
        minWidth: 15, height: 15, padding: '0 2px', boxSizing: 'border-box', borderRadius: 10,
        background: C.pinkDeep, color: C.white, border: `1px solid ${C.white}`,
        fontSize: 10, lineHeight: '13px', fontWeight: 700 }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} onClose={() => { setOpen(false); setExpandedId(null) }}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}
      style={{ position: 'fixed', top: 'calc(56px + env(safe-area-inset-top, 0px))', right: 12, left: 'auto',
        margin: 0, width: 'min(360px, calc(100vw - 24px))', maxHeight: '75dvh', boxSizing: 'border-box',
        padding: 0, border: `1px solid ${C.border}`, borderRadius: 16, color: C.dark,
        background: C.white, boxShadow: `0 12px 40px ${C.dark}26`, fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <h2 id={titleId} style={{ margin: 0, fontSize: 14, flex: 1 }}>お知らせ <span style={{ fontSize: 10, color: C.dark2 }}>{unreadCount ? `未読 ${unreadCount}件` : ''}</span></h2>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="お知らせを閉じる"
          style={{ width: 32, height: 32, border: 0, background: 'transparent', fontSize: 22, color: C.dark2, cursor: 'pointer' }}>×</button>
      </div>
      {!loaded ? <p style={{ padding: 12, fontSize: 12 }}>読み込み中…</p> : error ?
        <div role="alert" style={{ padding: 12, fontSize: 12 }}><p>{error}</p><button type="button" onClick={() => void refresh()}>再読み込み</button></div> :
        latest.length === 0 ? <p style={{ padding: '16px 12px', fontSize: 12, color: C.dark2 }}>今のお知らせはありません。</p> :
        latest.map(item => <article key={item.id} style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
          <button type="button" aria-expanded={expandedId === item.id}
            onClick={() => { markRead([item]); setExpandedId(expandedId === item.id ? null : item.id) }}
            style={{ display: 'block', textAlign: 'left', width: '100%', padding: 0, border: 0,
              background: 'transparent', color: C.dark, fontFamily: 'inherit', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, fontSize: 10, color: C.dark2 }}>
              {isUnread(item) && <span style={{ color: C.pinkDeep, fontWeight: 700 }}>未読</span>}
              {item.priority === 'important' && <span style={{ color: C.pinkDeep, background: C.pinkBg, padding: '1px 5px', borderRadius: 4 }}>重要</span>}
              <span>{new Date(item.created_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })}</span>
              {item.target_type === 'individual' && <span>個人宛</span>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{item.title}</div>
            <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.65, color: C.dark2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              ...(expandedId !== item.id ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}) }}>{item.body}</div>
          </button>
        </article>)}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: 12 }}>
        <button type="button" disabled={!latest.some(isUnread)} onClick={() => markRead(latest)}
          style={{ padding: '6px 8px', minHeight: 32, fontSize: 11, background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.dark2, fontFamily: 'inherit', cursor: 'pointer' }}>表示中を既読にする</button>
        <Link href="/announcements" prefetch={false} onClick={() => dialog.current?.close()}
          style={{ fontSize: 12, color: C.pinkDeep, padding: '8px 0' }}>すべて見る →</Link>
      </div>
    </dialog>
  </>
}
