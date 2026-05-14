'use client'
// ─────────────────────────────────────────────────────────────────
//  Card — リブランド版カード
//   既存の `<div style={{ background: C.white, border: ..., borderRadius: ... }}>`
//   パターンを置き換えていく汎用カード。
//
//  使い方:
//    <Card>...</Card>                           // デフォルト
//    <Card variant="raised" padding="lg">...    // 影付き
//    <Card variant="soft" borderHighlight="pink">...  // 桜色枠
//
//  既存からの移行:
//    `background: C.white, border: 1px solid C.border, borderRadius: 12, padding: '14px 16px'`
//    みたいなインラインを `<Card>` に置き換える。
// ─────────────────────────────────────────────────────────────────

import { C } from '@/lib/colors'
import type { CSSProperties, ReactNode, MouseEventHandler } from 'react'

export type CardVariant = 'default' | 'raised' | 'soft' | 'flat'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'
export type CardHighlight = 'pink' | 'gold' | 'danger' | 'success' | null

type Props = {
  variant?: CardVariant
  padding?: CardPadding
  /** 左/上の縁にアクセント色 (なくても OK) */
  borderHighlight?: CardHighlight
  /** クリッカブルにする (Link は外側で wrap) */
  onClick?: MouseEventHandler<HTMLDivElement>
  /** カードヘッダーをいれたければ */
  title?: ReactNode
  /** 追加スタイル */
  style?: CSSProperties
  children: ReactNode
}

const PADDING_MAP: Record<CardPadding, string> = {
  none: '0',
  sm: '8px 10px',
  md: '14px 16px',
  lg: '18px 20px',
}

const HIGHLIGHT_COLOR: Record<NonNullable<CardHighlight>, string> = {
  pink:   C.pink,
  gold:   '#D4A017',
  danger: C.danger,
  success: '#0F6E56',
}

export default function Card({
  variant = 'default',
  padding = 'md',
  borderHighlight,
  onClick,
  title,
  style,
  children,
}: Props) {
  const isClickable = !!onClick

  const baseStyle: CSSProperties = {
    background: variant === 'flat' ? 'transparent' : C.white,
    border: variant === 'flat' ? 'none' : `1px solid ${C.border}`,
    borderRadius: 12,
    padding: PADDING_MAP[padding],
    boxShadow: variant === 'raised' ? '0 2px 8px rgba(232,120,154,0.06)' : 'none',
    cursor: isClickable ? 'pointer' : 'default',
    transition: isClickable ? 'background 0.15s, border-color 0.15s' : undefined,
    position: 'relative',
    ...style,
  }

  // soft = 桜の薄いやさしい背景
  if (variant === 'soft') {
    baseStyle.background = 'linear-gradient(160deg, #FFF8FA 0%, #FFFFFF 100%)'
    baseStyle.border = `1px solid #F4DDE3`
  }

  return (
    <div
      onClick={onClick}
      style={baseStyle}
    >
      {/* 左縁アクセント (rounded を消す) */}
      {borderHighlight && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: HIGHLIGHT_COLOR[borderHighlight],
          borderRadius: '12px 0 0 12px',
        }} />
      )}
      {title && (
        <div style={{
          fontSize: 13, fontWeight: 600, color: C.dark,
          marginBottom: 8,
        }}>{title}</div>
      )}
      {children}
    </div>
  )
}
