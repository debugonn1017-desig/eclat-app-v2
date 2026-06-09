'use client'

// ─────────────────────────────────────────────────────────────────────
//  /announcements – お知らせ全件一覧ページ
//  - NotificationBell ドロップダウンの「すべて見る」のリンク先
//  - 過去のお知らせも遡って閲覧できる
//  - ヘッダーにロゴ＋ベル＋ユーザーチップ、フッターに BottomNav
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'
import type { Announcement } from '@/types'
import BottomNav from '@/components/BottomNav'
import UserChip from '@/components/UserChip'
import NotificationBell from '@/components/NotificationBell'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'
// v0.3.43-A: ログイン確認のみ fetchMe に置換 (announcements 取得は supabase で残す)
import { fetchMe } from '@/lib/authCache'

export default function AnnouncementsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<Announcement[]>([])
  const [loaded, setLoaded] = useState(false)
  useScrollTopOnMount()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // v0.3.43-A: ログイン確認のみ fetchMe で代替
      const me = await fetchMe()
      if (!me) {
        router.replace('/login')
        return
      }
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        if (data) setItems(data as Announcement[])
        setLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, router])

  return (
    <div style={{
      minHeight: '100vh',
      background:
        'radial-gradient(at 20% 10%, rgba(255,224,235,0.4) 0%, transparent 42%),' +
        'radial-gradient(at 80% 92%, rgba(255,240,245,0.4) 0%, transparent 42%),' +
        'linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 50%, #FFF8FA 100%)',
      // v0.3.38: paddingBottom 統一 (96 → 60px + safe-area)。BottomNav 常時表示
      paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
      fontFamily: 'var(--font-zen-maru), -apple-system, "Hiragino Sans", sans-serif',
    }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: 'linear-gradient(160deg, #FFF1F4 0%, #FFFAFC 60%, #FFFFFF 100%)',
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
        boxShadow: '0 4px 14px rgba(232,135,154,0.06)',
      }}>
        <div style={{
          maxWidth: 720, margin: '0 auto',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/home" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} aria-label="ホームへ">
            <Image
              src="/logo.png" alt="Éclat" width={110} height={33}
              priority
              className="object-contain"
              style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NotificationBell />
            <UserChip />
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: 720, margin: '0 auto',
        padding: '24px 20px 0',
      }}>
        {/* ─── タイトル ─── */}
        <div style={{ marginBottom: 22, padding: '0 4px' }}>
          <div style={{
            fontSize: 10.5, letterSpacing: '0.28em', color: C.pink,
            fontWeight: 700, marginBottom: 6,
          }}>
            ＊ NOTIFICATIONS
          </div>
          <div style={{
            fontSize: 24, fontWeight: 600,
            background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            letterSpacing: '0.04em',
          }}>
            お知らせ一覧
          </div>
          <div style={{
            fontSize: 12, color: C.pinkMuted, letterSpacing: '0.1em',
            marginTop: 4,
          }}>
            店舗からのご連絡・通知の履歴
          </div>
        </div>

        {/* ─── 戻るリンク ─── */}
        <Link
          href="/home"
          prefetch={false}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: C.pink, textDecoration: 'none',
            marginBottom: 16, padding: '6px 12px',
            background: 'rgba(255,255,255,0.7)',
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            letterSpacing: '0.05em',
          }}
        >
          <span style={{ fontSize: 14 }}>←</span> ホームへ戻る
        </Link>

        {/* ─── リスト ─── */}
        {!loaded ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '60px 0',
          }}>
            <div style={{
              width: 28, height: 28,
              border: `1px solid ${C.pink}`, borderTopColor: 'transparent',
              borderRadius: '50%', animation: 'spin 1s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : items.length === 0 ? (
          <div style={{
            padding: '60px 20px', textAlign: 'center',
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 18,
            color: C.pinkMuted,
            fontSize: 13, letterSpacing: '0.1em',
          }}>
            まだお知らせはありません
          </div>
        ) : (
          <div style={{
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(232,135,154,0.08)',
          }}>
            {items.map((a, idx) => (
              <div
                key={a.id}
                style={{
                  padding: '16px 18px',
                  borderBottom: idx === items.length - 1 ? 'none' : `1px solid ${C.border}`,
                  background: a.priority === 'important' ? C.bgLight : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {a.priority === 'important' && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
                      color: '#FFF',
                      background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                      padding: '3px 8px', borderRadius: 5,
                      flexShrink: 0, lineHeight: 1.2, marginTop: 2,
                    }}>
                      重要
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', gap: 10,
                    }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: C.dark,
                        lineHeight: 1.45, letterSpacing: '0.03em',
                      }}>
                        {a.title}
                      </div>
                      <div style={{
                        fontSize: 10, color: C.pinkMuted, flexShrink: 0,
                        letterSpacing: '0.05em',
                      }}>
                        {a.created_at?.slice(0, 10).replace(/-/g, '/')}
                      </div>
                    </div>
                    {a.body && (
                      <div style={{
                        fontSize: 12, color: '#5A4A55', marginTop: 6,
                        lineHeight: 1.65, whiteSpace: 'pre-wrap',
                      }}>
                        {a.body}
                      </div>
                    )}
                    {a.target_type === 'individual' && (
                      <div style={{
                        fontSize: 9, color: C.pink, marginTop: 6,
                        fontWeight: 600, letterSpacing: '0.12em',
                      }}>
                        ◆ あなた宛
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
