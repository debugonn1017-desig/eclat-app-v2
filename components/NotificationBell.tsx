'use client'

// ─────────────────────────────────────────────────────────────────────
//  NotificationBell – ヘッダー右上に常駐するお知らせドロップダウン
//  - 既存の AnnouncementBanner のデータ取得ロジックを移植
//  - 未読件数は localStorage(`eclat_read_announcement_ids`) で管理
//  - クリックで最新5件のパネルを開く
//  - 「すべて見る」リンクは将来の /announcements ページ用（無ければ無視）
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { C } from '@/lib/colors'
import type { Announcement } from '@/types'
import { createClient } from '@/lib/supabase/client'

const READ_KEY = 'eclat_read_announcement_ids'

function loadReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(READ_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    /* noop */
  }
  return new Set()
}

function saveReadIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify([...ids]))
  } catch {
    /* noop */
  }
}

export default function NotificationBell() {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds())
  const rootRef = useRef<HTMLDivElement | null>(null)

  // データ取得（AnnouncementBanner と同一ロジック）
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (!cancelled && data) setAnnouncements(data as Announcement[])
    }
    load()
    return () => { cancelled = true }
  }, [supabase])

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unreadCount = useMemo(
    () => announcements.filter(a => !readIds.has(a.id)).length,
    [announcements, readIds]
  )

  const togglePanel = () => {
    setOpen(prev => {
      const next = !prev
      // 開いた瞬間に「見たもの扱い」にする
      if (next && announcements.length > 0) {
        const all = new Set(readIds)
        announcements.forEach(a => all.add(a.id))
        setReadIds(all)
        saveReadIds(all)
      }
      return next
    })
  }

  const latest = announcements.slice(0, 5)

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={unreadCount > 0 ? `お知らせ ${unreadCount}件の未読` : 'お知らせ'}
        onClick={togglePanel}
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          border: `1px solid ${C.border}`,
          background: open
            ? `linear-gradient(135deg, #FFF1F5, #FFFFFF)`
            : 'rgba(255,255,255,0.85)',
          color: C.pink,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          boxShadow: '0 2px 8px rgba(232,135,154,0.12)',
          transition: 'all 0.2s ease',
          fontFamily: 'inherit',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 9,
              background: `linear-gradient(135deg, ${C.danger}, #F08090)`,
              color: '#FFF',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #FFF',
              boxShadow: '0 2px 6px rgba(212,80,96,0.35)',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            width: 320,
            maxWidth: 'calc(100vw - 32px)',
            background: '#FFFFFF',
            border: `1px solid ${C.border}`,
            borderRadius: 18,
            boxShadow: '0 16px 40px rgba(232,135,154,0.22), 0 4px 12px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            zIndex: 60,
            animation: 'eclat-bell-fade 0.18s ease-out',
          }}
        >
          {/* 上部ヘッダ */}
          <div style={{
            padding: '14px 16px 10px',
            background: 'linear-gradient(135deg, #FFF6F9 0%, #FFFFFF 100%)',
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{
              fontSize: 10, letterSpacing: '0.28em', fontWeight: 700, color: C.pink,
            }}>
              NOTIFICATIONS
            </div>
            <div style={{
              fontSize: 14, fontWeight: 600, color: C.dark, marginTop: 2, letterSpacing: '0.05em',
            }}>
              お知らせ
            </div>
          </div>

          {/* 一覧 */}
          {latest.length === 0 ? (
            <div style={{
              padding: '26px 16px',
              textAlign: 'center',
              fontSize: 12,
              color: C.pinkMuted,
              letterSpacing: '0.08em',
            }}>
              新しいお知らせはありません
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {latest.map((a, idx) => (
                <div
                  key={a.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: idx === latest.length - 1 ? 'none' : `1px solid ${C.border}`,
                    background: a.priority === 'important' ? '#FFF8FA' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    {a.priority === 'important' && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
                        color: '#FFF',
                        background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                        padding: '2px 6px', borderRadius: 4,
                        flexShrink: 0,
                      }}>
                        重要
                      </span>
                    )}
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: C.dark, flex: 1, lineHeight: 1.45,
                    }}>
                      {a.title}
                    </div>
                    <div style={{ fontSize: 10, color: C.pinkMuted, flexShrink: 0 }}>
                      {a.created_at?.slice(5, 10).replace('-', '/')}
                    </div>
                  </div>
                  {a.body && (
                    <div style={{
                      fontSize: 11, color: '#5A4A55', marginTop: 5,
                      lineHeight: 1.6,
                      // 長文は2行で省略
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {a.body}
                    </div>
                  )}
                  {a.target_type === 'individual' && (
                    <div style={{
                      fontSize: 9, color: C.pink, marginTop: 4, fontWeight: 600, letterSpacing: '0.1em',
                    }}>
                      ◆ あなた宛
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* フッタ */}
          {announcements.length > 0 && (
            <Link
              href="/announcements"
              prefetch={false}
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                padding: '12px 16px',
                background: '#FFFAFC',
                borderTop: `1px solid ${C.border}`,
                color: C.pink,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              すべて見る
            </Link>
          )}
        </div>
      )}

      <style>{`
        @keyframes eclat-bell-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
