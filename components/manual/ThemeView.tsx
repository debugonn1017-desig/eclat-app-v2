'use client'

// ─────────────────────────────────────────────────────────────────────
//  ThemeView (v0.2.8)
//  - 大型色分けタブ（会話=ピンク / 行動=ベージュ）
//  - structured.summary を常時表示
//  - SerifHero / ReactionBubbles は常時展開
//  - 解説 InfoCard は defaultOpen={false}
//  - 末尾「📖 全文を最初から最後まで読む」
//  React #300 安全：useMemo 不使用 / useState 初期値は静的リテラル
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
  const docStructured = pickStructured(docToShow)
  const summary = toStr(docStructured.summary)

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

      {/* 大型タブ（色分け：会話=ピンク / 行動=ベージュ） */}
      <div
        style={{
          display: 'flex',
          background: '#FFFFFF',
          border: '1px solid #F0DDE2',
          borderRadius: 16,
          padding: 4,
          marginBottom: 4,
          boxShadow: '0 2px 8px rgba(232,135,154,0.08)',
        }}
      >
        <button
          type="button"
          onClick={() => selectTab('conv')}
          disabled={!convAvailable}
          style={{
            flex: 1,
            padding: '14px 16px',
            background: tab === 'conv'
              ? 'linear-gradient(135deg, #E8879A 0%, #F4B0BF 100%)'
              : 'transparent',
            color: tab === 'conv'
              ? '#FFF'
              : (convAvailable ? '#6B5060' : '#D8C0C8'),
            border: 'none',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: convAvailable ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            letterSpacing: '0.05em',
            boxShadow: tab === 'conv' ? '0 4px 12px rgba(232,135,154,0.35)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          🎤 会話マニュアル
        </button>
        <button
          type="button"
          onClick={() => selectTab('action')}
          disabled={!actionAvailable}
          style={{
            flex: 1,
            padding: '14px 16px',
            background: tab === 'action'
              ? 'linear-gradient(135deg, #B89968 0%, #D4B58A 100%)'
              : 'transparent',
            color: tab === 'action'
              ? '#FFF'
              : (actionAvailable ? '#6B5060' : '#D8C0C8'),
            border: 'none',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: actionAvailable ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            letterSpacing: '0.05em',
            boxShadow: tab === 'action' ? '0 4px 12px rgba(184,153,104,0.35)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          🏃 行動マニュアル
        </button>
      </div>

      {/* 要約（structured.summary がある場合のみ常時表示） */}
      {summary && summary.trim() ? (
        <div
          style={{
            background: tab === 'conv'
              ? 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)'
              : 'linear-gradient(135deg, #FAF2E4 0%, #FFFCF6 100%)',
            border: tab === 'conv' ? '1px solid #F4B0BF' : '1px solid #D4B58A',
            borderRadius: 14,
            padding: '16px 18px',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: tab === 'conv' ? '#D45060' : '#8C6F3A',
              letterSpacing: '0.22em',
              marginBottom: 8,
            }}
          >
            📌 要約（離席60秒で読める）
          </div>
          <div
            style={{
              fontSize: 14,
              color: '#2D1B26',
              lineHeight: 1.9,
              whiteSpace: 'pre-wrap',
              fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
            }}
          >
            {summary}
          </div>
        </div>
      ) : null}

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
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            style={{
              width: '100%',
              background: showAll
                ? '#FFFAFC'
                : 'linear-gradient(135deg, #E8879A 0%, #F4B0BF 100%)',
              color: showAll ? PINK : '#FFFFFF',
              border: showAll ? `1px solid ${BORDER}` : 'none',
              padding: '14px 18px',
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: showAll ? 'none' : '0 6px 16px rgba(232,135,154,0.3)',
            }}
          >
            {showAll ? '▲ 全文を閉じる' : '📖 全文を最初から最後まで読む'}
          </button>
          {showAll ? (
            <div
              style={{
                marginTop: 4,
                padding: '20px 22px',
                background: '#FFFAFC',
                border: `1px solid ${BORDER}`,
                borderRadius: 14,
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
  const info = toStr(s.info)
  const why = toStr(s.why)
  const criterion = toStr(s.criterion)

  const allEmpty = isStructuredEmpty(s, [
    'serif',
    'reactions',
    'scene',
    'purpose',
    'info',
    'why',
    'criterion',
    'summary',
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
      {/* SerifHero（常時展開・折りたたみなし） */}
      <SerifHero serif={serif} />
      {/* ReactionBubbles（常時展開） */}
      <ReactionBubbles reactions={reactions} />
      {/* 解説カード（すべて defaultOpen={false}） */}
      <InfoCard icon="📍" label="このページを見る場面" content={scene} defaultOpen={false} />
      <InfoCard icon="🎯" label="目的" content={purpose} defaultOpen={false} />
      <InfoCard icon="💡" label="なぜ効くか" content={why} defaultOpen={false} />
      <InfoCard icon="📊" label="取れる情報" content={info} defaultOpen={false} />
      <InfoCard
        icon="🧭"
        label="迷ったときの基準"
        content={criterion}
        accent="gold"
        defaultOpen={false}
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
      'summary',
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
      <InfoCard icon="📍" label="場面" content={scene} defaultOpen={false} />
      <InfoCard icon="🎯" label="目的" content={purpose} defaultOpen={false} />
      <InfoCard icon="🏃" label="手順" content={procedure} defaultOpen={false} />
      {subsections.map((sub, i) => {
        const label = sub.title || `手順 ${i + 1}`
        return (
          <InfoCard
            key={`sub-${i}`}
            icon="▶️"
            label={sub.subtitle ? `${label}（${sub.subtitle}）` : label}
            content={sub.content}
            defaultOpen={false}
          />
        )
      })}
      <InfoCard icon="⏰" label="タイミング" content={timing} defaultOpen={false} />
      <InfoCard icon="⚠️" label="注意点" content={warnings} accent="warning" defaultOpen={false} />
      <InfoCard icon="🧭" label="基準" content={criterion} accent="gold" defaultOpen={false} />
    </div>
  )
}

