'use client'

// ─────────────────────────────────────────────────────────────────────
//  SectionHome – 教科書のホーム画面（v0.3.2）
//
//  構成（クエリが空のとき）：
//   - TodayQuote
//   - SearchBar（機能ON）
//   - お気に入りセクション（localStorage から取得して表示）
//   - 11セクションカードのグリッド
//
//  構成（クエリがあるとき）：
//   - TodayQuote
//   - SearchBar
//   - SearchResults（検索結果）
//
//  React #300 安全：
//   - useMemo 禁止 → 純粋関数で都度計算
//   - useState 初期値は静的（'', [], false）
//   - <details>/<summary> 禁止
//   - useSearchParams 禁止
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { SECTIONS, type SectionId } from './sections'
import TodayQuote from './TodayQuote'
import SearchBar from './SearchBar'
import SearchResults from './SearchResults'
import { useFavorites } from './FavoriteButton'
import { searchManualData } from '@/lib/manual-search'
import { normalizeStep } from '@/lib/manual-helpers'
import type { ManualData } from '@/types/manual'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const HEAD = '#3D2840'
const SUB = '#6B5560'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const BORDER = '#F0DDE2'

type Props = {
  onOpenSection: (id: SectionId) => void
  data: ManualData | null
  onOpenTheme: (key: string) => void
  onOpenManual: (id: string) => void
}

export default function SectionHome({
  onOpenSection,
  data,
  onOpenTheme,
  onOpenManual,
}: Props) {
  const [query, setQuery] = useState<string>('')
  const { favorites, toggle } = useFavorites()

  const trimmed = query.trim()
  const isSearching = trimmed.length > 0
  // 純粋関数で都度計算（useMemo は使わない）
  const hits = isSearching ? searchManualData(data, trimmed, 50) : []

  // お気に入りからカード表示用のデータを純粋計算で構築
  const favoriteCards = isSearching ? [] : buildFavoriteCards(favorites, data)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: READ_FONT,
      }}
    >
      <TodayQuote />
      <SearchBar value={query} onChange={setQuery} />

      {isSearching ? (
        <SearchResults
          query={trimmed}
          hits={hits}
          onOpenTheme={onOpenTheme}
          onOpenManual={onOpenManual}
          onOpenSection={(id) => onOpenSection(id)}
        />
      ) : (
        <>
          {/* ── お気に入りセクション ── */}
          <section data-manual-favorites>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.28em',
                color: PINK,
                fontWeight: 700,
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span aria-hidden="true">♥</span>
              <span>FAVORITES</span>
            </div>
            {favoriteCards.length === 0 ? (
              <div
                style={{
                  background: '#FFFAFC',
                  border: `1px dashed ${BORDER}`,
                  borderRadius: 14,
                  padding: '18px 16px',
                  fontSize: 12,
                  color: SUB,
                  lineHeight: 1.7,
                  textAlign: 'center',
                }}
              >
                お気に入りはまだありません。ハートマークで追加できます
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 10,
                }}
              >
                {favoriteCards.map((card) => (
                  <div
                    key={`${card.type}-${card.id}`}
                    style={{
                      background: '#FFFFFF',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 14,
                      padding: '12px 14px',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      boxShadow: '0 2px 8px rgba(232,135,154,0.08)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (card.type === 'theme') onOpenTheme(card.id)
                        else onOpenManual(card.id)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        padding: 0,
                        fontFamily: 'inherit',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        paddingRight: 28,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#FFFFFF',
                            background:
                              card.type === 'theme'
                                ? `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`
                                : 'linear-gradient(135deg, #B89968 0%, #D4B58A 100%)',
                            padding: '2px 8px',
                            borderRadius: 100,
                            letterSpacing: '0.08em',
                          }}
                        >
                          {card.type === 'theme' ? '💬 テーマ' : '📝 44項目'}
                        </span>
                        {card.stepLabel ? (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: SUB,
                              letterSpacing: '0.08em',
                            }}
                          >
                            {card.stepLabel}
                          </span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: HEAD,
                          lineHeight: 1.45,
                        }}
                      >
                        {card.title}
                      </div>
                    </button>
                    {/* 削除ボタン（×） */}
                    <button
                      type="button"
                      onClick={() => toggle(card.type, card.id)}
                      aria-label="お気に入りから削除"
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: '#FFF0F3',
                        border: `1px solid ${BORDER}`,
                        color: '#C0405C',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── 11セクション ── */}
          <section data-manual-steps>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.28em',
                color: PINK,
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
        </>
      )}
    </div>
  )
}

// ── お気に入りエントリ → 表示用カードに変換 ────────────────────────
type FavCard = {
  type: 'theme' | 'manual'
  id: string
  title: string
  stepLabel: string
}

function buildFavoriteCards(
  favorites: Array<{ type: 'theme' | 'manual'; id: string }>,
  data: ManualData | null
): FavCard[] {
  if (!data || favorites.length === 0) return []
  const out: FavCard[] = []
  for (const f of favorites) {
    if (f.type === 'theme') {
      const t = data.themes?.find((x) => x.key === f.id)
      if (t) {
        out.push({
          type: 'theme',
          id: t.key,
          title: t.title,
          stepLabel: normalizeStep(t.step),
        })
      }
    } else {
      const m = data.manuals?.find((x) => x.id === f.id)
      if (m) {
        out.push({
          type: 'manual',
          id: m.id,
          title: m.title,
          stepLabel: normalizeStep(m.step),
        })
      }
    }
  }
  return out
}
