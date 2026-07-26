'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
// v0.3.39: ログアウト時に sessionStorage の me キャッシュをクリアして
//   次のログインで他ユーザーの権限がキャッシュヒットしないようにする。
// v0.3.43-A: 初期 profile 取得も fetchMe (sessionStorage キャッシュ) 経由に統一
import { fetchMe, invalidateMe } from '@/lib/authCache'
import { invalidateAllCache } from '@/lib/cache'
import { useViewMode } from '@/hooks/useViewMode'

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
  const { isPC, toggle: toggleView, ready: viewModeReady } = useViewMode()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // v0.3.43-A: fetchMe() で sessionStorage キャッシュ経由
      const me = await fetchMe()
      if (!me || cancelled) return
      setProfile({ display_name: me.display_name, role: me.role as 'admin' | 'cast' })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogout() {
    // v0.3.39: auth cache を先に無効化 (signOut で 401 化する前にやる)
    invalidateMe()
    invalidateAllCache()
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
        className="eclat-user-chip-button"
        type="button"
        aria-label={`${label}のメニュー`}
        title={`${label}のメニュー`}
        onClick={() => setMenuOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: '1px solid rgba(232, 135, 155, 0.5)',
          color: '#F2A8B8',
          fontSize: 10,
          letterSpacing: '0.15em',
          padding: '6px 12px',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span className="eclat-user-chip-label">{label}</span>
        <svg
          className="eclat-user-chip-icon"
          aria-hidden
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: '#FFF',
            border: '1px solid #F0D4DA',
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            minWidth: 160,
            zIndex: 30,
          }}
        >
          <div style={{
            padding: '10px 14px',
            fontSize: 10,
            color: '#6B5060',
            borderBottom: '1px solid #F0D4DA',
            background: '#FFF9FA',
          }}>
            {label}
          </div>
          <Link
            href="/home"
            prefetch={false}
            onClick={() => setMenuOpen(false)}
            style={{
              ...menuItemStyle,
              color: '#3D2B3A',
              borderBottom: '1px solid #F0D4DA',
            }}
          >
            ホーム
          </Link>
          {viewModeReady && (
            <button
              type="button"
              onClick={() => {
                toggleView()
                setMenuOpen(false)
              }}
              style={{
                ...menuItemStyle,
                color: '#3D2B3A',
                borderBottom: '1px solid #F0D4DA',
              }}
            >
              {isPC ? 'スマホ表示に切り替える' : 'パソコン表示に切り替える'}
            </button>
          )}
          {profile.role === 'admin' && (
            <Link
              href="/admin/casts"
              prefetch={false}
              onClick={() => setMenuOpen(false)}
              style={{
                ...menuItemStyle,
                color: '#3D2B3A',
                borderBottom: '1px solid #F0D4DA',
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
              color: '#C44040',
            }}
          >
            ログアウト
          </button>
        </div>
      )}
      <style>{`
        .eclat-user-chip-icon {
          display: none;
        }
        @media (max-width: 640px) {
          .eclat-user-chip-button {
            width: 38px;
            height: 38px;
            padding: 0 !important;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.88) !important;
            color: #E8879B !important;
            border-color: #F0D4DA !important;
          }
          .eclat-user-chip-label {
            display: none;
          }
          .eclat-user-chip-icon {
            display: block;
          }
        }
      `}</style>
    </div>
  )
}
