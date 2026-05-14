'use client'

// 🔮 おすすめキャスト診断（マッチング）— スタッフ向け公開ページ
//   /cast-matching
//
//   閲覧可能: ログイン済みなら誰でも（オーナー・スタッフ・キャスト全員）
//
//   現場で「このお客様にどのキャストが合いそう？」を即診断できるシンプルなUI。

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useViewMode } from '@/hooks/useViewMode'
import { C } from '@/lib/colors'
import BottomNav from '@/components/BottomNav'
import ViewModeToggle from '@/components/ViewModeToggle'
import { CastMatchingTab } from '@/components/CastMatchingTab'

export default function CastMatchingPage() {
  const router = useRouter()
  const { isPC } = useViewMode()
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  // 認証ガード — ログイン済みなら誰でも OK（権限不要）
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        setAuthorized(true)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])

  useEffect(() => {
    if (authorized === false) {
      const t = setTimeout(() => router.push('/login'), 1500)
      return () => clearTimeout(t)
    }
  }, [authorized, router])

  if (authorized === null) {
    return <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#888' }}>読み込み中...</div>
  }
  if (!authorized) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontSize: 13 }}>
        <p style={{ color: '#5A2840', fontWeight: 600, marginBottom: 8 }}>ログインが必要です</p>
        <p style={{ color: '#888', fontSize: 11 }}>ログイン画面へ移動します...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: !isPC ? 60 : 0 }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: isPC ? '12px 20px' : '10px 12px',
        borderBottom: `1px solid ${C.border}`, background: C.headerBg,
      }}>
        <button onClick={() => router.push('/')} style={{
          background: 'transparent', border: 'none', color: C.pink,
          fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
        }}>← ホーム</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
          🔮 おすすめキャスト診断
        </span>
        <span style={{ fontSize: 10, color: C.pinkMuted, marginLeft: 'auto' }}>
          属性入力で相性のいいキャストを推定
        </span>
        <ViewModeToggle />
      </div>

      {/* 本体（既存の CastMatchingTab を使い回し）
          PC 時は中央 1100px に制限して、入力フォームの 3列 grid が広く使えるようにする */}
      <div style={{
        padding: isPC ? '16px 20px' : '12px 10px',
        maxWidth: isPC ? 1100 : '100%',
        margin: '0 auto',
      }}>
        <CastMatchingTab isPC={isPC} />
      </div>

      {!isPC && <BottomNav />}
    </div>
  )
}
