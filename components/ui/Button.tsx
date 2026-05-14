'use client'
// ─────────────────────────────────────────────────────────────────
//  Button — 3 バリエーション統一ボタン
//   - primary  : ピンクグラデ (主要 CTA)
//   - outline  : 枠線のみ (副 CTA)
//   - ghost    : 背景なし (テキストボタン的)
//
//  使い方:
//    <Button onClick={save}>保存</Button>
//    <Button variant="outline" onClick={cancel}>キャンセル</Button>
//    <Button variant="ghost" size="sm" onClick={...}>もっと見る</Button>
//
//  既存からの移行:
//    各種ピンクボタンを順次置き換え。
// ─────────────────────────────────────────────────────────────────

import { C } from '@/lib/colors'
import type { CSSProperties, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

type Props = {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  disabled?: boolean
  /** type="submit" 等を渡せる */
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  /** 左に icon を入れる (任意) */
  icon?: ReactNode
  /** 緊急用、なるべく避ける */
  style?: CSSProperties
  children: ReactNode
}

const SIZE_MAP: Record<ButtonSize, { padding: string; fontSize: number; borderRadius: number }> = {
  sm: { padding: '5px 12px', fontSize: 11, borderRadius: 14 },
  md: { padding: '8px 18px', fontSize: 12, borderRadius: 18 },
  lg: { padding: '12px 24px', fontSize: 13, borderRadius: 22 },
}

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  type = 'button',
  onClick,
  icon,
  style,
  children,
}: Props) {
  const dim = SIZE_MAP[size]

  let bg = ''
  let color = ''
  let border = `1px solid transparent`
  switch (variant) {
    case 'primary':
      bg = disabled ? '#DDD' : `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
      color = '#FFF'
      break
    case 'outline':
      bg = 'transparent'
      color = disabled ? C.pinkMuted : C.pink
      border = `1px solid ${disabled ? C.border : C.pink}`
      break
    case 'ghost':
      bg = 'transparent'
      color = disabled ? C.pinkMuted : C.pink
      break
    case 'danger':
      bg = disabled ? '#DDD' : C.danger
      color = '#FFF'
      break
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', gap: 6,
        width: fullWidth ? '100%' : 'auto',
        padding: dim.padding,
        fontSize: dim.fontSize,
        fontWeight: 600,
        letterSpacing: '0.05em',
        borderRadius: dim.borderRadius,
        background: bg, color, border,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.15s, transform 0.05s',
        ...style,
      }}
    >
      {icon && <span style={{ display: 'inline-flex', fontSize: dim.fontSize + 2 }}>{icon}</span>}
      {children}
    </button>
  )
}
