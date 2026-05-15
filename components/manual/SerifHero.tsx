'use client'

// ─────────────────────────────────────────────────────────────────────
//  SerifHero v0.2.9
//  セリフテキストを自動パースして、
//   - 「：」で終わる行 → 指示文（小さく薄く）
//   - 「○○」or『○○』で囲まれた行 → セリフ本体（大文字・引用カード風）
//   - それ以外 → 通常段落
//  純粋関数コンポーネント（useState/useMemo/useEffect一切なし）
// ─────────────────────────────────────────────────────────────────────

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'

type Props = {
  serif: string
  prelude?: string
}

// テキストを行ブロックに分類
type Block =
  | { kind: 'instruction'; text: string }   // 「：」で終わる指示行
  | { kind: 'quote'; text: string }         // 「」or『』で囲まれたセリフ
  | { kind: 'para'; text: string }          // 普通の段落

function parseSerif(raw: string): Block[] {
  // 空行で段落に分割
  const paras = raw.split(/\n\n+/)
  const blocks: Block[] = []

  for (const para of paras) {
    const text = para.trim()
    if (!text) continue

    // 段落内の行を処理。連続するセリフ行は1つの quote にまとめる
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    // この段落全体が「」or『』のみで囲まれてる → 1つのquote
    const fullQuoteMatch = text.match(/^[「『]([\s\S]+?)[」』]$/)
    if (fullQuoteMatch) {
      blocks.push({ kind: 'quote', text: fullQuoteMatch[1]!.trim() })
      continue
    }

    // 指示行（末尾が「：」or「:」）が単独なら instruction
    if (lines.length === 1 && /[：:]$/.test(lines[0]!)) {
      blocks.push({ kind: 'instruction', text: lines[0]!.replace(/[：:]$/, '：') })
      continue
    }

    // 複数行の場合、行ごとに判定
    // 連続するセリフ行・連続する非セリフ行をまとめる
    let buf: { kind: 'instruction' | 'quote' | 'para'; texts: string[] } | null = null
    const flush = () => {
      if (!buf) return
      blocks.push({ kind: buf.kind, text: buf.texts.join('\n') } as Block)
      buf = null
    }

    for (const line of lines) {
      const isFullQuote = /^[「『][\s\S]+[」』]$/.test(line)
      const isInstruction = /[：:]$/.test(line) && !isFullQuote

      // セリフ単独行
      if (isFullQuote) {
        flush()
        const m = line.match(/^[「『]([\s\S]+)[」』]$/)
        blocks.push({ kind: 'quote', text: m![1]!.trim() })
        continue
      }

      // 指示行
      if (isInstruction) {
        flush()
        blocks.push({ kind: 'instruction', text: line })
        continue
      }

      // 通常の段落（連続する場合はまとめる）
      if (buf && buf.kind === 'para') {
        buf.texts.push(line)
      } else {
        flush()
        buf = { kind: 'para', texts: [line] }
      }
    }
    flush()
  }
  return blocks
}

export default function SerifHero({ serif, prelude }: Props) {
  if (!serif || !serif.trim()) return null

  const blocks = parseSerif(serif)

  return (
    <div
      style={{
        position: 'relative',
        background: 'linear-gradient(135deg, #E8879A 0%, #F4B0BF 100%)',
        borderRadius: 18,
        padding: '20px 22px',
        boxShadow: '0 6px 20px rgba(232,135,154,0.30)',
        overflow: 'hidden',
        fontFamily: READ_FONT,
      }}
    >
      {/* 右上の白い円形ハイライト装飾 */}
      <div aria-hidden style={{
        position: 'absolute', top: -28, right: -28,
        width: 100, height: 100, borderRadius: '50%',
        background: 'rgba(255,255,255,0.18)', pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', top: 20, right: 36,
        width: 26, height: 26, borderRadius: '50%',
        background: 'rgba(255,255,255,0.28)', pointerEvents: 'none',
      }} />

      {/* ラベル */}
      <div style={{
        fontSize: 10, letterSpacing: '0.3em',
        color: '#FFFFFF', fontWeight: 700,
        marginBottom: 14, position: 'relative', zIndex: 1,
      }}>
        💗 SERIF（持ち上げの一言）
      </div>

      {/* prelude（前置きコンテキスト） */}
      {prelude && prelude.trim() ? (
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.85)',
          marginBottom: 12, lineHeight: 1.7,
          position: 'relative', zIndex: 1,
          whiteSpace: 'pre-wrap',
        }}>
          {prelude}
        </div>
      ) : null}

      {/* セリフ本体（パース結果を順に描画） */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {blocks.map((b, i) => {
          if (b.kind === 'instruction') {
            // 指示文：小さく、白の薄め、左に縦線アクセント
            return (
              <div key={i} style={{
                fontSize: 11.5,
                color: 'rgba(255,255,255,0.88)',
                lineHeight: 1.7,
                letterSpacing: '0.02em',
                paddingLeft: 12,
                borderLeft: '2px solid rgba(255,255,255,0.45)',
                whiteSpace: 'pre-wrap',
              }}>
                {b.text}
              </div>
            )
          }
          if (b.kind === 'quote') {
            // セリフ本体：白い半透明カード風、大きな文字
            return (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 12,
                padding: '14px 16px',
                fontSize: 16,
                color: '#FFFFFF',
                lineHeight: 1.8,
                fontWeight: 600,
                letterSpacing: '0.02em',
                textShadow: '0 1px 2px rgba(192,64,92,0.18)',
                whiteSpace: 'pre-wrap',
                position: 'relative',
              }}>
                <span aria-hidden style={{
                  position: 'absolute', top: 6, left: 8,
                  fontSize: 22, color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'serif', lineHeight: 1,
                }}>“</span>
                <span style={{ display: 'block', paddingLeft: 14, paddingRight: 14 }}>
                  {b.text}
                </span>
                <span aria-hidden style={{
                  position: 'absolute', bottom: 4, right: 12,
                  fontSize: 22, color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'serif', lineHeight: 1,
                }}>”</span>
              </div>
            )
          }
          // 通常段落
          return (
            <div key={i} style={{
              fontSize: 13.5,
              color: 'rgba(255,255,255,0.96)',
              lineHeight: 1.8,
              letterSpacing: '0.02em',
              whiteSpace: 'pre-wrap',
            }}>
              {b.text}
            </div>
          )
        })}
      </div>
    </div>
  )
}
