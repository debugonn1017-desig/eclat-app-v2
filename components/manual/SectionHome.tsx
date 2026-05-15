'use client'

// ─────────────────────────────────────────────────────────────────────
//  SectionHome – 教科書のホーム画面
//  - 上段：TodayQuote
//  - 中段：SearchBar
//  - 下段：11セクションカードのグリッド
//  - useMemo 禁止、CSS でレスポンシブ
// ─────────────────────────────────────────────────────────────────────
import { SECTIONS, type SectionId } from './sections'
import TodayQuote from './TodayQuote'
import SearchBar from './SearchBar'

type Props = {
  onOpenSection: (id: SectionId) => void
}

export default function SectionHome({ onOpenSection }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
      }}
    >
      <TodayQuote />
      <SearchBar />

      <section>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.28em',
            color: '#E8879A',
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          LEARN BY CHAPTER
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenSection(s.id)}
              style={{
                background: s.gradient,
                border: 'none',
                borderRadius: 18,
                padding: '16px 14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                color: '#FFFFFF',
                minHeight: 110,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 8px 22px rgba(232,135,154,0.22)',
              }}
            >
              <div style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">
                {s.emoji}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: 1.3,
                    textShadow: '0 1px 2px rgba(120,40,60,0.18)',
                  }}
                >
                  {s.title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    marginTop: 4,
                    lineHeight: 1.4,
                    color: 'rgba(255,255,255,0.95)',
                    textShadow: '0 1px 2px rgba(120,40,60,0.18)',
                  }}
                >
                  {s.sub}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
