'use client'
// ─────────────────────────────────────────────────────────────────
//  SakuraAnimation — 桜の花びらアニメーション (ON/OFF 切替対応)
//
//  仕様:
//    - 画面右上から左下に floating する 12 枚の花びら
//    - パフォーマンス重視: CSS transform + will-change のみ、JS タイマー無し
//    - prefers-reduced-motion 対応 (OS 設定で動きを減らす場合は自動 OFF)
//    - z-index は最背面 (-1) — UI 操作を絶対邪魔しない
//
//  ON/OFF 優先順位:
//    (A) 個別 localStorage 'eclat.sakuraAnimation' = 'off'  → OFF
//    (B) app_settings.sakura_animation_enabled = false      → OFF
//    (C) prefers-reduced-motion: reduce                     → OFF
//    (D) それ以外                                            → ON
//
//  使い方:
//    // app/layout.tsx の <body> 直下に配置
//    <SakuraAnimation globalEnabled={appSettings.sakura_animation_enabled} />
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'

type Props = {
  /** app_settings.sakura_animation_enabled の値 (SSR で渡す) */
  globalEnabled?: boolean
}

const PETAL_COUNT = 12

export default function SakuraAnimation({ globalEnabled = true }: Props) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    // (A) localStorage 個別 OFF
    let userOff = false
    try {
      userOff = window.localStorage.getItem('eclat.sakuraAnimation') === 'off'
    } catch {
      /* SSR or storage disabled — ignore */
    }
    if (userOff) { setEnabled(false); return }

    // (B) グローバル OFF
    if (!globalEnabled) { setEnabled(false); return }

    // (C) prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia) {
      const m = window.matchMedia('(prefers-reduced-motion: reduce)')
      if (m.matches) { setEnabled(false); return }
    }

    // (D) ON
    setEnabled(true)
  }, [globalEnabled])

  if (!enabled) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0,
        pointerEvents: 'none',
        zIndex: -1,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: PETAL_COUNT }).map((_, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: `${-10 - Math.random() * 20}%`,
            left: `${Math.random() * 100}%`,
            width: 12 + Math.random() * 10,
            height: 12 + Math.random() * 10,
            background: 'radial-gradient(circle at 30% 30%, #FFD6E0, #F4A5B8)',
            borderRadius: '50% 0 50% 50%',
            opacity: 0.7,
            animation: `sakura-fall ${12 + Math.random() * 10}s linear ${-Math.random() * 12}s infinite`,
            transform: `rotate(${Math.random() * 360}deg)`,
            willChange: 'transform, opacity',
          }}
        />
      ))}
      {/* keyframes は global.css に書いてもよいが、コンポーネント完結のため style 内に */}
      <style jsx>{`
        @keyframes sakura-fall {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0.7; }
          50%  { transform: translate3d(-40px, 50vh, 0) rotate(180deg); opacity: 0.5; }
          100% { transform: translate3d(-80px, 110vh, 0) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
//  ユーティリティ: 個別ユーザーの ON/OFF を切り替える
// ─────────────────────────────────────────────────────────────────
export function setSakuraAnimationPreference(on: boolean) {
  try {
    window.localStorage.setItem('eclat.sakuraAnimation', on ? 'on' : 'off')
    // 反映には再読込が必要 (アニメ DOM の有無を切り替えるため)
    window.location.reload()
  } catch {
    /* ignore */
  }
}

export function getSakuraAnimationPreference(): 'on' | 'off' | null {
  try {
    const v = window.localStorage.getItem('eclat.sakuraAnimation')
    return v === 'on' || v === 'off' ? v : null
  } catch {
    return null
  }
}
