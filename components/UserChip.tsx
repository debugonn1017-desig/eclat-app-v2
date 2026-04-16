'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  display_name: string | null
  role: 'admin' | 'cast'
}

/**
 * Small chip shown in the header: current user's name/role + logout.
 * Tolerates being mounted before the session is fully hydrated.
 * For admins, the dropdown also includes a link to the cast management page.
 */
export default function UserChip() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data } = await supabase
        .from('profiles')
        .select('display_name, role')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled && data) setProfile(data as Profile)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (!profile) return null

  const label =
    profile.role === 'admin'
      ? `${profile.display_name ?? '管理者'} / 管理者`
      : `${profile.display_name ?? 'キャスト'}`

  const menuItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '10px 14px',
    fontSize: 12,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textDecoration: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: '1px solid rgba(201, 168, 76, 0.5)',
          color: '#E8C98A',
          fontSize: 10,
          letterSpacing: '0.15em',
          padding: '6px 12px',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {label}
      </button>
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: '#FFF',
            border: '1px solid #E8D8CC',
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            minWidth: 160,
            zIndex: 30,
          }}
        >
          {profile.role === 'admin' && (
            <Link
              href="/admin/casts"
              onClick={() => setMenuOpen(false)}
              style={{
                ...menuItemStyle,
                color: '#1A0F0A',
                borderBottom: '1px solid #E8D8CC',
              }}
            >
              キャスト管理
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              ...menuItemStyle,
              color: '#B85A48',
            }}
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  )
}
