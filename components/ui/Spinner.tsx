'use client'

import { C } from '@/lib/colors'

type Props = {
  size?: 'sm' | 'md' | 'lg'  // 既定 'md'
  color?: string              // 既定 C.pink
  label?: string              // 既定なし、あれば下に表示
  center?: boolean            // 既定 true、中央寄せ
}

const SIZE_MAP = {
  sm: 16,
  md: 28,
  lg: 44,
} as const

export default function Spinner({ size = 'md', color, label, center = true }: Props) {
  const px = SIZE_MAP[size]
  const c = color ?? C.pink
  const wrapperStyle: React.CSSProperties = center
    ? {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: 20,
      }
    : { display: 'inline-flex', alignItems: 'center', gap: 8 }
  return (
    <div style={wrapperStyle}>
      <div
        style={{
          width: px,
          height: px,
          border: `2px solid ${c}`,
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'eclat-spin 0.85s linear infinite',
        }}
      />
      {label ? (
        <div style={{
          fontSize: 12,
          color: C.pinkMuted,
          letterSpacing: '0.05em',
          textAlign: 'center',
        }}>{label}</div>
      ) : null}
      <style dangerouslySetInnerHTML={{
        __html: '@keyframes eclat-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
      }} />
    </div>
  )
}
