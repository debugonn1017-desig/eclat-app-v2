'use client'

// ─────────────────────────────────────────────────────────────────────
//  StepThemeList – あるSTEPのテーマ一覧 + 質問項目一覧
//
//  仕様：
//   - pickThemesByStep(data, step) でテーマ一覧
//   - pickManualsByStep(data, step) で質問項目一覧
//   - テーマには「🎤会話」「🏃行動」のバッジ（持っていれば）
//   - 両方0件なら「準備中」表示
//   - React #300 再発防止：useMemo 不使用、useState 不使用（純粋関数）
// ─────────────────────────────────────────────────────────────────────

import type { ManualData, ThemeDoc, ManualItem } from '@/types/manual'
import { pickThemesByStep, pickManualsByStep } from '@/lib/manual-helpers'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const HEAD = '#3D2840'
const MUTED = '#6B5560'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const PINK_DEEP = '#C0405C'
const BORDER = '#F0DDE2'

type Props = {
  step: string
  data: ManualData
  onOpenTheme: (key: string) => void
  onOpenManual: (id: string) => void
}

// 1テーマの行
function ThemeRow({
  theme,
  onOpen,
}: {
  theme: ThemeDoc
  onOpen: (key: string) => void
}) {
  const hasConv = !!theme.conv_id && !theme.no_conv
  const hasAction = !!theme.action_id
  return (
    <button
      type="button"
      onClick={() => onOpen(theme.key)}
      style={{
        width: '100%',
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: '11px 14px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: HEAD,
            letterSpacing: '0.02em',
            lineHeight: 1.5,
          }}
        >
          {theme.title}
        </span>
        {theme.subtitle ? (
          <span
            style={{
              fontSize: 11,
              color: MUTED,
              lineHeight: 1.6,
              letterSpacing: '0.02em',
            }}
          >
            {theme.subtitle}
          </span>
        ) : null}
        <span
          style={{
            display: 'flex',
            gap: 4,
            marginTop: 2,
            flexWrap: 'wrap',
          }}
        >
          {hasConv ? (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: '#FFFFFF',
                background: `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`,
                padding: '2px 7px',
                borderRadius: 100,
                letterSpacing: '0.04em',
              }}
            >
              🎤 会話
            </span>
          ) : null}
          {hasAction ? (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: '#3E6F95',
                background: '#E8F0F8',
                border: '1px solid #B8D0E0',
                padding: '2px 7px',
                borderRadius: 100,
                letterSpacing: '0.04em',
              }}
            >
              🏃 行動
            </span>
          ) : null}
        </span>
      </span>
      <span
        aria-hidden
        style={{
          fontSize: 13,
          color: PINK,
          flexShrink: 0,
        }}
      >
        →
      </span>
    </button>
  )
}

// 1項目の行
function ItemRow({
  item,
  onOpen,
}: {
  item: ManualItem
  onOpen: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      style={{
        width: '100%',
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: '10px 14px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
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
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
      >
        {item.id.toUpperCase()}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: HEAD,
            letterSpacing: '0.02em',
            lineHeight: 1.5,
          }}
        >
          {item.title}
        </span>
        {item.scene ? (
          <span
            style={{
              fontSize: 11,
              color: MUTED,
              lineHeight: 1.6,
              letterSpacing: '0.02em',
            }}
          >
            📍 {item.scene}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        style={{
          fontSize: 13,
          color: PINK,
          flexShrink: 0,
        }}
      >
        →
      </span>
    </button>
  )
}

// セクションラベル
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: PINK_DEEP,
        letterSpacing: '0.25em',
        padding: '0 4px',
      }}
    >
      {children}
    </div>
  )
}

// ─── 本体 ──────────────────────────────────────────────────────
export default function StepThemeList({
  step,
  data,
  onOpenTheme,
  onOpenManual,
}: Props) {
  const themes = pickThemesByStep(data, step)
  const manuals = pickManualsByStep(data, step)

  if (themes.length === 0 && manuals.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: READ_FONT,
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: '24px 20px',
            textAlign: 'center',
            color: MUTED,
            fontSize: 13,
            lineHeight: 1.8,
            letterSpacing: '0.02em',
          }}
        >
          このSTEPのコンテンツは準備中です。
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: 16,
        fontFamily: READ_FONT,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {/* テーマ一覧 */}
      {themes.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <SectionLabel>
            🌸 テーマ一覧（{themes.length}件・タップで会話/行動 切替）
          </SectionLabel>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {themes.map((t, i) => (
              <ThemeRow
                key={`th-${t.key}-${i}`}
                theme={t}
                onOpen={onOpenTheme}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* 質問項目一覧 */}
      {manuals.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <SectionLabel>
            📋 情報をとる質問集（{manuals.length}件）
          </SectionLabel>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {manuals.map((m, i) => (
              <ItemRow
                key={`mn-${m.id}-${i}`}
                item={m}
                onOpen={onOpenManual}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
