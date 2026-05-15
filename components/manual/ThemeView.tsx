'use client'

// ─────────────────────────────────────────────────────────────────────
//  ThemeView
//  テーマ詳細の本体。タスクBの統合役。
//  useState は3つだけ：tab / showAll / (各InfoCardは内部state)
//  すべて静的リテラル or props由来の純粋計算 → React #300 安全
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import type { ManualData, ThemeDoc, ConversationDoc, ActionDoc, ManualReaction } from '@/types/manual'
import {
  getInitialTab,
  getThemeConv,
  getThemeAction,
  normalizeStep,
} from '@/lib/manual-helpers'
import Markdown from '@/components/manual/Markdown'
import SerifHero from '@/components/manual/SerifHero'
import ReactionBubbles from '@/components/manual/ReactionBubbles'
import InfoCard from '@/components/manual/InfoCard'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const HEAD = '#3D2840'
const SUB = '#6B5560'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const PINK_BG = '#FFF0F3'
const BORDER = '#F0DDE2'

type Tab = 'conv' | 'action'

type Props = {
  theme: ThemeDoc
  data: ManualData
  onBack: () => void
}

// ─── structured を安全に取り出すユーティリティ ────────────────────────
function pickStructured(doc: ConversationDoc | ActionDoc | undefined): Record<string, unknown> {
  if (!doc) return {}
  const s = (doc as { structured?: unknown }).structured
  if (s && typeof s === 'object') return s as Record<string, unknown>
  return {}
}

function toStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  return ''
}

function toReactions(v: unknown): ManualReaction[] {
  if (!Array.isArray(v)) return []
  return v
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const label = typeof o.label === 'string' ? o.label : ''
      const text = typeof o.text === 'string' ? o.text : ''
      const reply = typeof o.reply === 'string' ? o.reply : ''
      const type = typeof o.type === 'string' ? o.type : ''
      if (!label && !text && !reply) return null
      return { label, text, reply, type } as ManualReaction
    })
    .filter((x): x is ManualReaction => x != null)
}

// procedure_subsections の柔軟な抽出
type SubSection = { title: string; subtitle: string; content: string }
function toSubsections(v: unknown): SubSection[] {
  if (!Array.isArray(v)) return []
  return v
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const o = item as Record<string, unknown>
      const title = typeof o.title === 'string' ? o.title : ''
      const subtitle = typeof o.subtitle === 'string' ? o.subtitle : ''
      let content = ''
      if (typeof o.body === 'string' && o.body.trim()) content = o.body
      else if (typeof o.content === 'string' && o.content.trim()) content = o.content
      else if (typeof o.text === 'string' && o.text.trim()) content = o.text
      else if (typeof o.markdown === 'string' && o.markdown.trim()) content = o.markdown
      if (!content && !title && !subtitle) return null
      return { title, subtitle, content }
    })
    .filter((x): x is SubSection => x != null)
}

// structured が「実質空」かどうか
function isStructuredEmpty(s: Record<string, unknown>, keys: string[]): boolean {
  for (const k of keys) {
    const v = s[k]
    if (typeof v === 'string' && v.trim()) return false
    if (Array.isArray(v) && v.length > 0) return false
  }
  return true
}

// ─── 本体 ────────────────────────────────────────────────────────────
export default function ThemeView({ theme, data, onBack }: Props) {
  const [tab, setTab] = useState<Tab>(getInitialTab(theme))
  const [showAll, setShowAll] = useState<boolean>(false)

  const conv = getThemeConv(data, theme)
  const action = getThemeAction(data, theme)

  const convAvailable = !!conv && !theme.no_conv
  const actionAvailable = !!action

  const stepLabel = normalizeStep(theme.step)
  const tabLabel = tab === 'conv' ? '会話マニュアル' : '行動マニュアル'

  // ─── タブ切替ハンドラ ───
  function selectTab(next: Tab) {
    if (next === 'conv' && !convAvailable) return
    if (next === 'action' && !actionAvailable) return
    setTab(next)
    setShowAll(false)
  }

  // ─── 表示中ドキュメント ───
  const docToShow: ConversationDoc | ActionDoc | undefined = tab === 'conv' ? conv : action

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 18,
        padding: 22,
        fontFamily: READ_FONT,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* 戻るボタン */}
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'transparent',
            border: `1px solid ${BORDER}`,
            color: SUB,
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 100,
            cursor: 'pointer',
            fontFamily: READ_FONT,
            letterSpacing: '0.05em',
          }}
        >
          ← 一覧に戻る
        </button>
      </div>

      {/* パンくず */}
      <div
        style={{
          fontSize: 11,
          color: SUB,
          letterSpacing: '0.1em',
          fontWeight: 600,
        }}
      >
        {stepLabel} / {tabLabel}
      </div>

      {/* タイトル */}
      <div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: HEAD,
            lineHeight: 1.5,
            letterSpacing: '0.02em',
          }}
        >
          {theme.title}
        </div>
        {theme.subtitle ? (
          <div
            style={{
              fontSize: 12,
              color: SUB,
              marginTop: 4,
              lineHeight: 1.6,
            }}
          >
            {theme.subtitle}
          </div>
        ) : null}
      </div>

      {/* タブ */}
      <div
        style={{
          background: PINK_BG,
          borderRadius: 100,
          padding: 4,
          display: 'flex',
          gap: 4,
        }}
      >
        <TabButton
          active={tab === 'conv'}
          disabled={!convAvailable}
          onClick={() => selectTab('conv')}
          label="🎤 会話"
        />
        <TabButton
          active={tab === 'action'}
          disabled={!actionAvailable}
          onClick={() => selectTab('action')}
          label="🏃 行動"
        />
      </div>

      {/* タブ別本体 */}
      {tab === 'conv' ? (
        <ConvSection conv={conv} noConv={theme.no_conv === true} />
      ) : (
        <ActionSection action={action} />
      )}

      {/* 全文展開ボタン */}
      {docToShow && docToShow.rawMarkdown ? (
        <div
          style={{
            marginTop: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            style={{
              background: showAll
                ? '#FFFFFF'
                : `linear-gradient(135deg, ${PINK_LIGHT} 0%, ${PINK} 100%)`,
              color: showAll ? PINK : '#FFFFFF',
              border: showAll ? `1px solid ${PINK_LIGHT}` : 'none',
              fontSize: 13,
              fontWeight: 700,
              padding: '12px 16px',
              borderRadius: 12,
              cursor: 'pointer',
              fontFamily: READ_FONT,
              letterSpacing: '0.05em',
              boxShadow: showAll ? 'none' : '0 4px 10px rgba(232,135,154,0.25)',
            }}
          >
            {showAll ? '▲ 全文を閉じる' : '📖 全文を最初から最後まで読む'}
          </button>
          {showAll ? (
            <div
              style={{
                background: '#FFF9FA',
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: 18,
              }}
            >
              <Markdown source={docToShow.rawMarkdown} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ─── タブボタン（純粋関数コンポーネント） ─────────────────────────────
function TabButton({
  active,
  disabled,
  onClick,
  label,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        background: active && !disabled
          ? `linear-gradient(135deg, ${PINK} 0%, ${PINK_LIGHT} 100%)`
          : 'transparent',
        color: disabled
          ? '#C0B0B5'
          : active
            ? '#FFFFFF'
            : SUB,
        border: 'none',
        borderRadius: 100,
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: READ_FONT,
        letterSpacing: '0.05em',
        opacity: disabled ? 0.5 : 1,
        boxShadow: active && !disabled ? '0 2px 6px rgba(232,135,154,0.3)' : 'none',
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  )
}

// ─── 会話タブ本体 ────────────────────────────────────────────────────
function ConvSection({ conv, noConv }: { conv: ConversationDoc | undefined; noConv: boolean }) {
  if (noConv || !conv) {
    return (
      <div
        style={{
          background: '#FFF8FA',
          border: `1px dashed ${BORDER}`,
          borderRadius: 12,
          padding: 18,
          fontSize: 13,
          color: SUB,
          textAlign: 'center',
          lineHeight: 1.8,
          fontFamily: READ_FONT,
        }}
      >
        🤫 このテーマは会話を意図的に省略しています
      </div>
    )
  }

  const s = pickStructured(conv)
  const serif = toStr(s.serif)
  const reactions = toReactions(s.reactions)
  const scene = toStr(s.scene)
  const purpose = toStr(s.purpose)
  const thinking = toStr(s.thinking)
  const info = toStr(s.info)
  const why = toStr(s.why)
  const criterion = toStr(s.criterion)

  const allEmpty = isStructuredEmpty(s, [
    'serif',
    'reactions',
    'scene',
    'purpose',
    'thinking',
    'info',
    'why',
    'criterion',
  ])

  if (allEmpty) {
    return (
      <div
        style={{
          background: '#FFF9FA',
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 18,
        }}
      >
        <Markdown source={conv.rawMarkdown ?? ''} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SerifHero serif={serif} />
      <ReactionBubbles reactions={reactions} />
      <InfoCard icon="📍" label="このページを見る場面" content={scene} />
      <InfoCard icon="🎯" label="目的" content={purpose} defaultOpen />
      <InfoCard icon="💭" label="考え方" content={thinking} />
      <InfoCard icon="📊" label="取れる情報" content={info} />
      <InfoCard icon="💡" label="なぜ効くか" content={why} />
      <InfoCard
        icon="🧭"
        label="お客様の反応の見極め基準"
        content={criterion}
        accent="gold"
      />
    </div>
  )
}

// ─── 行動タブ本体 ────────────────────────────────────────────────────
function ActionSection({ action }: { action: ActionDoc | undefined }) {
  if (!action) {
    return (
      <div
        style={{
          background: '#FFF8FA',
          border: `1px dashed ${BORDER}`,
          borderRadius: 12,
          padding: 18,
          fontSize: 13,
          color: SUB,
          textAlign: 'center',
          lineHeight: 1.8,
          fontFamily: READ_FONT,
        }}
      >
        🤫 このテーマには行動マニュアルがありません
      </div>
    )
  }

  const s = pickStructured(action)
  const scene = toStr(s.scene)
  const purpose = toStr(s.purpose)
  const procedure = toStr(s.procedure)
  const timing = toStr(s.timing)
  const warnings = toStr(s.warnings)
  const criterion = toStr(s.criterion)
  const subsections = toSubsections(s.procedure_subsections)

  const allEmpty =
    isStructuredEmpty(s, [
      'scene',
      'purpose',
      'procedure',
      'timing',
      'warnings',
      'criterion',
    ]) && subsections.length === 0

  if (allEmpty) {
    return (
      <div
        style={{
          background: '#FFF9FA',
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 18,
        }}
      >
        <Markdown source={action.rawMarkdown ?? ''} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <InfoCard icon="📍" label="このページを見る場面" content={scene} />
      <InfoCard icon="🎯" label="目的" content={purpose} defaultOpen />
      <InfoCard icon="🏃" label="手順・所作" content={procedure} defaultOpen />
      {subsections.map((sub, i) => {
        const label = sub.title || `手順 ${i + 1}`
        return (
          <InfoCard
            key={`sub-${i}`}
            icon="▶️"
            label={sub.subtitle ? `${label}（${sub.subtitle}）` : label}
            content={sub.content}
          />
        )
      })}
      <InfoCard icon="⏰" label="タイミング" content={timing} />
      <InfoCard icon="⚠️" label="注意点" content={warnings} accent="warning" />
      <InfoCard icon="🧭" label="基準" content={criterion} accent="gold" />
    </div>
  )
}
