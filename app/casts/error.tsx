'use client'

import { C } from '@/lib/colors'

export default function CastsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: C.danger, marginBottom: '8px' }}>
          ページの読み込みに失敗しました
        </p>
        <p style={{ fontSize: '10px', color: C.pinkMuted, marginBottom: '16px' }}>
          {error.message}
        </p>
        <button
          onClick={reset}
          style={{
            background: `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
            color: C.dark,
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.2em',
            padding: '10px 24px',
            border: `1px solid ${C.pink}`,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          再読み込み
        </button>
      </div>
    </div>
  )
}
