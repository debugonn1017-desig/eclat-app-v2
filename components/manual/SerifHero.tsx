'use client'

// ─────────────────────────────────────────────────────────────────────
//  SerifHero
//  「持ち上げの一言」セリフを大きく強調表示するピンクグラデのヒーローカード
//  純粋関数コンポーネント（useState/useMemo/useEffect一切なし）
// ─────────────────────────────────────────────────────────────────────

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'

type Props = {
  serif: string
  prelude?: string
}

export default function SerifHero({ serif, prelude }: Props) {
  if (!serif || !serif.trim()) return null

  return (
    <div
      style={{
        position: 'relative',
        background: 'linear-gradient(135deg, #E8879A 0%, #F4B0BF 100%)',
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 6px 18px rgba(232,135,154,0.28)',
        overflow: 'hidden',
        fontFamily: READ_FONT,
      }}
    >
      {/* 右上の白い円形ハイライト装飾 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -28,
          right: -28,
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 20,
          right: 36,
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.28)',
          pointerEvents: 'none',
        }}
      />

      {/* ラベル */}
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.3em',
          color: '#FFFFFF',
          fontWeight: 700,
          marginBottom: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
        💗 SERIF（持ち上げの一言）
      </div>

      {/* prelude（前置きコンテキスト） */}
      {prelude && prelude.trim() ? (
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.85)',
            marginBottom: 8,
            lineHeight: 1.6,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {prelude}
        </div>
      ) : null}

      {/* セリフ本体 */}
      <div
        style={{
          fontSize: 16,
          color: '#FFFFFF',
          lineHeight: 1.7,
          fontWeight: 600,
          letterSpacing: '0.02em',
          position: 'relative',
          zIndex: 1,
          textShadow: '0 1px 2px rgba(192,64,92,0.15)',
        }}
      >
        「{serif}」
      </div>
    </div>
  )
}
