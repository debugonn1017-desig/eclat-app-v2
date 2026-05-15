'use client'

// ─────────────────────────────────────────────────────────────────────
//  SearchResults – 教科書検索結果リスト（v0.3.2）
//  - 件数表示
//  - 各ヒットをカード表示（タイプアイコン + タイトル + snippet）
//  - タップで対応画面に遷移
//  - 0件のときは「該当する内容が見つかりません」
//  React #300 安全：useState / useMemo / useEffect なし
// ─────────────────────────────────────────────────────────────────────

import type { SearchHit } from '@/lib/manual-search'
import { normalizeStep } from '@/lib/manual-helpers'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const HEAD = '#3D2840'
const SUB = '#6B5560'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const BORDER = '#F0DDE2'

type Props = {
  query: string
  hits: SearchHit[]
  onOpenTheme: (key: string) => void
  onOpenManual: (id: string) => void
}

export default function SearchResults({ query, hits, onOpenTheme, onOpenManual }: Props) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: READ_FONT,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '0 4px',
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.28em',
            color: PINK,
            fontWeight: 700,
          }}
        >
          SEARCH RESULTS
        </div>
        <div
          style={{
            fontSize: 11,
            color: SUB,
            letterSpacing: '0.04em',
          }}
        >
          「{query}」 / {hits.length}件
        </div>
      </div>

      {hits.length === 0 ? (
        <div
          style={{
            background: '#FFFAFC',
            border: `1px dashed ${BORDER}`,
            borderRadius: 14,
            padding: '28px 18px',
            textAlign: 'center',
            color: SUB,
            fontSize: 13,
            lineHeight: 1.8,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }} aria-hidden="true">
            🌸
          </div>
          該当する内容が見つかりません
          <div style={{ fontSize: 11, color: '#B0909A', marginTop: 6 }}>
            別のキーワードでも試してみてください
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {hits.map((hit, i) => {
            if (hit.kind === 'theme') {
              const t = hit.theme
              return (
                <button
                  key={`theme-${t.key}-${i}`}
                  type="button"
                  onClick={() => onOpenTheme(t.key)}
                  style={{
                    background: '#FFFFFF',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 14,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(232,135,154,0.06)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#FFFFFF',
                        background: `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`,
                        padding: '3px 9px',
                        borderRadius: 100,
                        letterSpacing: '0.08em',
                      }}
                    >
                      💬 テーマ
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: SUB,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {normalizeStep(t.step)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: HEAD,
                      lineHeight: 1.45,
                    }}
                  >
                    {t.title}
                  </div>
                  {hit.snippet ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: SUB,
                        lineHeight: 1.6,
                      }}
                    >
                      {hit.snippet}
                    </div>
                  ) : null}
                </button>
              )
            }

            const m = hit.manual
            return (
              <button
                key={`manual-${m.id}-${i}`}
                type="button"
                onClick={() => onOpenManual(m.id)}
                style={{
                  background: '#FFFFFF',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 14,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(232,135,154,0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#FFFFFF',
                      background: 'linear-gradient(135deg, #B89968 0%, #D4B58A 100%)',
                      padding: '3px 9px',
                      borderRadius: 100,
                      letterSpacing: '0.08em',
                    }}
                  >
                    📝 44項目
                  </span>
                  {m.step ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: SUB,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {normalizeStep(m.step)}
                    </span>
                  ) : null}
                  {m.group ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: SUB,
                        background: '#FFFAFC',
                        border: `1px solid ${BORDER}`,
                        padding: '2px 8px',
                        borderRadius: 100,
                      }}
                    >
                      {m.group}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: HEAD,
                    lineHeight: 1.45,
                  }}
                >
                  {m.title}
                </div>
                {hit.snippet ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: SUB,
                      lineHeight: 1.6,
                    }}
                  >
                    {hit.snippet}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
