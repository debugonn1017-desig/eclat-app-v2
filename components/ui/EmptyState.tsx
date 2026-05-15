'use client'

import { C } from '@/lib/colors'

type Variant = 'info' | 'error' | 'warning' | 'empty'

type Props = {
  variant?: Variant            // 既定 'info'
  icon?: string                // 絵文字、未指定なら variant に応じてデフォルト
  title?: string
  message?: string
  action?: React.ReactNode     // 「再試行」「ホームへ」などのボタン
}

const VARIANT_STYLES: Record<Variant, { bg: string; border: string; iconDefault: string }> = {
  info:    { bg: C.bgPale, border: C.border, iconDefault: '🌸' },
  error:   { bg: C.dangerBg, border: C.dangerBorder, iconDefault: '⚠️' },
  warning: { bg: '#FFF8E0', border: '#F0DCA0', iconDefault: '⚠️' },
  empty:   { bg: '#FAFAFA', border: '#E0E0E0', iconDefault: '📭' },
}

export default function EmptyState({ variant = 'info', icon, title, message, action }: Props) {
  const v = VARIANT_STYLES[variant]
  return (
    <div style={{
      background: v.bg,
      border: `1px solid ${v.border}`,
      borderRadius: 14,
      padding: '24px 18px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      <div style={{ fontSize: 36 }}>{icon ?? v.iconDefault}</div>
      {title ? <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, letterSpacing: '0.02em' }}>{title}</div> : null}
      {message ? <div style={{ fontSize: 12.5, color: C.dark2, lineHeight: 1.7, marginTop: 2 }}>{message}</div> : null}
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  )
}
