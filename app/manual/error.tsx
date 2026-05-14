'use client'

// ─────────────────────────────────────────────────────────────────────
//  /manual の Next.js Error Boundary
//  本番でクラッシュした際、エラー詳細を画面に表示するためのデバッグ用。
//  原因特定後は撤去または抽象化する。
// ─────────────────────────────────────────────────────────────────────
import { useEffect } from 'react'

export default function ManualError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[/manual ERROR]', error)
  }, [error])

  return (
    <div style={{
      minHeight: '100vh',
      padding: '40px 20px',
      background: '#FFF8FA',
      fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
      color: '#3D2D38',
      maxWidth: 760,
      margin: '0 auto',
    }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        🌸 教科書ページでエラーが発生しました
      </h1>
      <p style={{ fontSize: 13, marginBottom: 18, color: '#6B5060' }}>
        以下のエラー情報を Claude（または開発者）に共有してください。
      </p>

      <div style={{
        background: '#FFFFFF',
        border: '1px solid #F0DDE2',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#D45060', letterSpacing: '0.2em', marginBottom: 6 }}>
          MESSAGE
        </div>
        <pre style={{
          fontSize: 12,
          fontFamily: 'ui-monospace, "SF Mono", monospace',
          whiteSpace: 'pre-wrap',
          margin: 0,
          color: '#3D2D38',
        }}>{error?.message ?? '(no message)'}</pre>
      </div>

      {error?.digest && (
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #F0DDE2',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#D45060', letterSpacing: '0.2em', marginBottom: 6 }}>
            DIGEST
          </div>
          <pre style={{
            fontSize: 12,
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            whiteSpace: 'pre-wrap',
            margin: 0,
            color: '#3D2D38',
          }}>{error.digest}</pre>
        </div>
      )}

      {error?.stack && (
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #F0DDE2',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#D45060', letterSpacing: '0.2em', marginBottom: 6 }}>
            STACK
          </div>
          <pre style={{
            fontSize: 11,
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            whiteSpace: 'pre-wrap',
            margin: 0,
            color: '#6B5060',
            maxHeight: 360,
            overflow: 'auto',
          }}>{error.stack}</pre>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button
          onClick={reset}
          style={{
            background: 'linear-gradient(135deg, #E8879A 0%, #F4B0BF 100%)',
            color: '#FFF',
            border: 'none',
            padding: '12px 20px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          🔄 もう一度試す
        </button>
        <a
          href="/home"
          style={{
            background: '#FFFFFF',
            border: '1px solid #F0DDE2',
            color: '#E8879A',
            padding: '12px 20px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          ← ホームへ戻る
        </a>
      </div>
    </div>
  )
}
