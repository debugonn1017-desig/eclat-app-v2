'use client'

import { useState, useEffect, useMemo } from 'react'
import { C } from '@/lib/colors'
import { Announcement } from '@/types'
import { createClient } from '@/lib/supabase/client'

export default function AnnouncementBanner() {
  const supabase = useMemo(() => createClient(), [])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (data) setAnnouncements(data as Announcement[])
    }
    fetch()
  }, [supabase])

  if (announcements.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
      {announcements.map(a => (
        <div key={a.id} style={a.priority === 'important' ? {
          background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
          padding: '12px 14px',
          borderRadius: '6px',
        } : {
          background: '#FFF5F7',
          border: `1px solid ${C.pinkLight}`,
          padding: '10px 14px',
          borderRadius: '6px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              {a.priority === 'important' && (
                <div style={{
                  fontSize: '8px', letterSpacing: '0.15em',
                  color: 'rgba(255,255,255,0.8)',
                  marginBottom: '3px',
                }}>ANNOUNCEMENT</div>
              )}
              <div style={{
                fontSize: '13px', fontWeight: 500,
                color: a.priority === 'important' ? '#FFF' : C.dark,
              }}>{a.title}</div>
              {a.body && (
                <div style={{
                  fontSize: '11px', lineHeight: 1.5, marginTop: '4px',
                  color: a.priority === 'important' ? 'rgba(255,255,255,0.85)' : '#5A4A55',
                }}>{a.body}</div>
              )}
            </div>
            <span style={{
              fontSize: '10px', flexShrink: 0, marginLeft: '8px',
              color: a.priority === 'important' ? 'rgba(255,255,255,0.7)' : C.pinkMuted,
            }}>
              {a.created_at?.slice(5, 10).replace('-', '/')}
            </span>
          </div>
          {a.target_type === 'individual' && (
            <div style={{
              fontSize: '9px', marginTop: '4px',
              color: a.priority === 'important' ? 'rgba(255,255,255,0.6)' : C.pinkMuted,
            }}>あなた宛</div>
          )}
        </div>
      ))}
    </div>
  )
}
