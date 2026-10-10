'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchMe } from '@/lib/authCache'
import { createClient } from '@/lib/supabase/client'
import { ANNOUNCEMENT_READ_EVENT, announcementReadKey, announcementReadToken, parseAnnouncementReads } from '@/lib/announcementReadState'
import type { Announcement } from '@/types'

export function useAnnouncements() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<Announcement[]>([])
  const [reads, setReads] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const identity = useRef<string | null>(null)
  const mounted = useRef(false)

  const refresh = useCallback(async () => {
    if (!mounted.current) return
    const run = ++generation.current
    try {
      const me = await fetchMe()
      if (!mounted.current || run !== generation.current) return
      if (identity.current !== (me?.id ?? null)) {
        identity.current = me?.id ?? null
        setUserId(identity.current)
        setItems([])
        setReads(new Set())
        setLoaded(false)
      }
      if (!me) { setError(null); setLoaded(true); return }
      let stored = new Set<string>()
      try { stored = parseAnnouncementReads(localStorage.getItem(announcementReadKey(me.id))) } catch { /* 端末保存不可 */ }
      setReads(stored)
      // セッションクライアントの既存RLSで、キャストは全体・自分宛だけ取得。
      const { data, error: queryError } = await supabase.from('announcements').select('*')
        .eq('is_active', true).order('created_at', { ascending: false }).order('id', { ascending: false })
      if (!mounted.current || run !== generation.current) return
      if (queryError) throw new Error('load failed')
      setItems((data ?? []).map(item => ({ ...item, id: String(item.id) })) as Announcement[])
      setError(null)
      setLoaded(true)
    } catch {
      if (!mounted.current || run !== generation.current) return
      setError('お知らせを取得できませんでした。もう一度お試しください。')
      setLoaded(true)
    }
  }, [supabase])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const focus = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = window.setInterval(focus, 60_000)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        // Auth callback内で別Auth呼び出しを待たない。
        queueMicrotask(() => { void refresh() })
      }
    })
    return () => {
      mounted.current = false
      window.clearInterval(interval)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', focus)
      subscription.unsubscribe()
    }
  }, [refresh, supabase])

  useEffect(() => {
    if (!userId) return
    const sync = () => {
      try { setReads(parseAnnouncementReads(localStorage.getItem(announcementReadKey(userId)))) } catch { /* 端末保存不可 */ }
    }
    window.addEventListener(ANNOUNCEMENT_READ_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(ANNOUNCEMENT_READ_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [userId])

  const markRead = useCallback((visibleItems: Announcement[]) => {
    if (!userId || identity.current !== userId) return
    let next = new Set(reads)
    try {
      for (const token of parseAnnouncementReads(localStorage.getItem(announcementReadKey(userId)))) next.add(token)
    } catch { /* 端末保存不可 */ }
    for (const item of visibleItems) next.add(announcementReadToken(item))
    next = new Set([...next].slice(-500))
    setReads(next)
    try {
      localStorage.setItem(announcementReadKey(userId), JSON.stringify([...next]))
      window.dispatchEvent(new Event(ANNOUNCEMENT_READ_EVENT))
    } catch { /* 保存不可でも開いている画面の既読は維持 */ }
  }, [reads, userId])

  const isUnread = (item: Announcement) => !reads.has(announcementReadToken(item))
  return { userId, items, loaded, error, refresh, markRead, isUnread, unreadCount: items.filter(isUnread).length }
}
