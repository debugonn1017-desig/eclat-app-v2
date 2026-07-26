'use client'

import { useEffect, useState } from 'react'
import { C } from '@/lib/colors'

export default function FollowUpNotificationSetting() {
  const [applicable, setApplicable] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/follow-ups/notification-settings', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json() as { applicable?: boolean; daily_enabled?: boolean }
        if (cancelled) return
        setApplicable(data.applicable === true)
        setEnabled(data.daily_enabled !== false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const toggle = async () => {
    if (saving) return
    const next = !enabled
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/follow-ups/notification-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyEnabled: next }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setMessage(data.error ?? '通知設定の保存に失敗しました')
        return
      }
      setEnabled(next)
      setMessage(next ? '毎日の追いかけ通知をオンにしました' : '毎日の追いかけ通知をオフにしました')
    } catch {
      setMessage('通知設定の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !applicable) return null

  return (
    <div style={{
      padding: '12px 14px',
      background: '#FFF',
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: C.dark, fontWeight: 700 }}>
            追いかけリストを毎日通知
          </div>
          <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 3, lineHeight: 1.5 }}>
            追いかけ中のお客様がいる日に、14時台にスマホへお知らせします
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          aria-pressed={enabled}
          aria-label={enabled ? '毎日の追いかけ通知をオフにする' : '毎日の追いかけ通知をオンにする'}
          style={{
            width: 52,
            height: 30,
            padding: 3,
            borderRadius: 18,
            border: 'none',
            background: enabled ? C.pink : '#D8D1D4',
            cursor: saving ? 'wait' : 'pointer',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <span style={{
            display: 'block',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#FFF',
            transform: enabled ? 'translateX(22px)' : 'translateX(0)',
            transition: 'transform 0.2s',
            boxShadow: '0 2px 5px rgba(0,0,0,0.16)',
          }} />
        </button>
      </div>
      {message && (
        <div style={{ fontSize: 10, color: message.includes('失敗') ? '#C53030' : C.pinkMuted }}>
          {message}
        </div>
      )}
    </div>
  )
}
