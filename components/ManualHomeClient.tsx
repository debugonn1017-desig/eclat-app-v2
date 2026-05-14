'use client'

// ─────────────────────────────────────────────────────────────────────
//  ManualHomeClient – COSTES キャスト教科書 安定版（2026-05-15）
//  ManualSectionView がReact #300クラッシュの原因と判明したため、
//  セクション本文をこのファイル内にインライン実装。
//  - 11セクションすべてクリック可能
//  - STEP1〜7: テーマ一覧（タップで本文展開＝サマリのみ）
//  - 接客のまえに: chapter_0.rawMarkdown を簡素表示
//  - 44項目: manuals一覧
//  - 色恋: philosophy_files一覧
//  - キャストタイプ: castTypes一覧
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useManualData } from '@/hooks/useManualData'
import type {
  ManualData, ManualItem, ThemeDoc, ActionDoc, ConversationDoc,
  PhilosophyFile, CastType,
} from '@/types/manual'

type SectionId =
  | 'before'
  | 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6' | 'step7'
  | 'topics44' | 'irokoi' | 'cast-type'

const SECTIONS: { id: SectionId; emoji: string; title: string; sub: string; gradient: string }[] = [
  { id: 'before', emoji: '🌸', title: '接客のまえに', sub: '心構え・大切にしたい4つの気持ち', gradient: 'linear-gradient(135deg, #FFE8EE 0%, #FFC8D4 100%)' },
  { id: 'step1', emoji: '☕', title: 'STEP1 基礎接客', sub: '違和感を与えず、安心して過ごしていただく', gradient: 'linear-gradient(135deg, #FFD8E2 0%, #F4B0BF 100%)' },
  { id: 'step2', emoji: '🥃', title: 'STEP2 ドリンク営業', sub: '応援したくなる空気を作る', gradient: 'linear-gradient(135deg, #FFD0DE 0%, #F2A5B6 100%)' },
  { id: 'step3', emoji: '📱', title: 'STEP3 連絡先交換', sub: '「興味があります」のサービス／登録名ルール', gradient: 'linear-gradient(135deg, #FFCCD5 0%, #F299AE 100%)' },
  { id: 'step4', emoji: '✨', title: 'STEP4 場内指名・延長', sub: '奪うものではなく、選ばれるもの', gradient: 'linear-gradient(135deg, #FFC8D4 0%, #ED93A8 100%)' },
  { id: 'step5', emoji: '🥂', title: 'STEP5 アフター', sub: '次回来店予定を作る場所', gradient: 'linear-gradient(135deg, #FFB8C8 0%, #E8879B 100%)' },
  { id: 'step6', emoji: '💌', title: 'STEP6 営業連絡', sub: '忘れられない接点', gradient: 'linear-gradient(135deg, #FFB0C2 0%, #E07088 100%)' },
  { id: 'step7', emoji: '🎯', title: 'STEP7 初リピート完成', sub: '6STEPをつなげて最大化', gradient: 'linear-gradient(135deg, #FFA8BD 0%, #D45060 100%)' },
  { id: 'topics44', emoji: '💬', title: '情報をとる 44項目', sub: '年代・職業・家族・趣味・好み etc.', gradient: 'linear-gradient(135deg, #FFE0E8 0%, #F4A5B8 100%)' },
  { id: 'irokoi', emoji: '💖', title: '色恋の鉄則', sub: '色恋の使い方・依存にしない予防策', gradient: 'linear-gradient(135deg, #FFC0CB 0%, #D45060 100%)' },
  { id: 'cast-type', emoji: '🎀', title: 'キャストタイプ別', sub: '清楚 / 甘え / お姉さん / クール', gradient: 'linear-gradient(135deg, #FFE4ED 0%, #E8879A 100%)' },
]

// step を正規化
function normalizeStep(s: string | number): string {
  if (typeof s === 'number') return `STEP${s}`
  if (/^\d+$/.test(s)) return `STEP${s}`
  return s
}

// frontmatter除去（safe版）
function stripFrontmatter(md: string | undefined | null): string {
  if (!md) return ''
  const trimmed = md.replace(/^\s*\n+/, '')
  const head = trimmed.substring(0, 400)
  if (/^(title|step|side|author|status|updated|id|filename|category):/m.test(head)) {
    const endIdx = trimmed.indexOf('\n---\n')
    if (endIdx > 0 && endIdx < 600) return trimmed.substring(endIdx + 5).replace(/^\s*\n+/, '')
    if (trimmed.startsWith('---\n')) {
      const e = trimmed.indexOf('\n---\n', 4)
      if (e > 0) return trimmed.substring(e + 5).replace(/^\s*\n+/, '')
    }
  }
  return md
}

// 簡易マークダウン表示（折りたたみ可能）
function MarkdownBlock({ source }: { source: string | undefined | null }) {
  const text = stripFrontmatter(source)
  if (!text) {
    return <p style={{ fontSize: 12, color: '#B0909A' }}>本文がまだ収録されていません。</p>
  }
  return (
    <div style={{
      fontSize: 14, color: '#2D1B26', lineHeight: 1.9,
      whiteSpace: 'pre-wrap', fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
    }}>
      {text}
    </div>
  )
}

export default function ManualHomeClient(_props: { isAdmin: boolean }) {
  const [openSection, setOpenSection] = useState<SectionId | null>(null)
  const [openThemeKey, setOpenThemeKey] = useState<string | null>(null)
  const [openManualId, setOpenManualId] = useState<string | null>(null)
  const { data: manualData, loading: manualLoading, error: manualError } = useManualData()

  // セクション切替時、本文上端へスクロール
  useEffect(() => {
    if ((openSection || openThemeKey || openManualId) && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [openSection, openThemeKey, openManualId])

  const goHome = () => { setOpenSection(null); setOpenThemeKey(null); setOpenManualId(null) }

  return (
    <div style={{
      minHeight: '100vh',
      padding: '20px 16px 60px',
      background: 'linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 50%, #FFF8FA 100%)',
      fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20, gap: 8, flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{
              fontSize: 22, fontWeight: 700, margin: 0,
              background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>
              📖 COSTES キャスト教科書
            </h1>
            <p style={{ fontSize: 11, color: '#6B5060', margin: '4px 0 0', letterSpacing: '0.05em' }}>v0.2 BETA</p>
          </div>
          <a href="/home" style={{ color: '#E8879A', fontSize: 12, fontWeight: 600, textDecoration: 'none', padding: '6px 10px' }}>
            ← ホーム
          </a>
        </div>

        {/* データ読み込みエラー */}
        {manualError && (
          <div style={{ background: '#FFE8EC', border: '1px solid #FFC0CB', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#D45060' }}>
            教科書データを読み込めませんでした: {manualError}
          </div>
        )}

        {/* === 詳細表示：テーマ === */}
        {openThemeKey && manualData ? (
          <ThemeDetail
            theme={manualData.themes.find(t => t.key === openThemeKey)}
            data={manualData}
            onBack={() => setOpenThemeKey(null)}
          />
        ) : openManualId && manualData ? (
          <ManualItemDetail
            item={manualData.manuals.find(m => m.id === openManualId)}
            onBack={() => setOpenManualId(null)}
          />
        ) : openSection ? (
          <SectionDetail
            sectionId={openSection}
            data={manualData}
            loading={manualLoading}
            onBack={goHome}
            onOpenTheme={setOpenThemeKey}
            onOpenManual={setOpenManualId}
          />
        ) : (
          /* === ホーム：セクションカード === */
          <>
            <div style={{ fontSize: 10, letterSpacing: '0.28em', color: '#E8879A', fontWeight: 700, marginBottom: 10 }}>
              LEARN BY CHAPTER
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setOpenSection(s.id)}
                  style={{
                    background: s.gradient, border: 'none', borderRadius: 18,
                    padding: '16px 14px', cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', color: '#FFF', minHeight: 110,
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    boxShadow: '0 8px 22px rgba(232,135,154,0.22)',
                  }}
                >
                  <div style={{ fontSize: 28 }}>{s.emoji}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, textShadow: '0 1px 2px rgba(120,40,60,0.18)' }}>{s.title}</div>
                    <div style={{ fontSize: 10, marginTop: 4, lineHeight: 1.4, color: 'rgba(255,255,255,0.95)', textShadow: '0 1px 2px rgba(120,40,60,0.18)' }}>{s.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── セクション本文（インライン） ────────────────────────────────────
function SectionDetail({
  sectionId, data, loading, onBack, onOpenTheme, onOpenManual,
}: {
  sectionId: SectionId
  data: ManualData | null
  loading: boolean
  onBack: () => void
  onOpenTheme: (key: string) => void
  onOpenManual: (id: string) => void
}) {
  const sectionInfo = SECTIONS.find(s => s.id === sectionId)!

  if (loading || !data) {
    return (
      <Card>
        <BackHeader title={`${sectionInfo.emoji} ${sectionInfo.title}`} onBack={onBack} />
        <p style={{ fontSize: 12, color: '#B0909A', padding: '20px 0' }}>教科書データを読み込み中…</p>
      </Card>
    )
  }

  return (
    <Card>
      <BackHeader title={`${sectionInfo.emoji} ${sectionInfo.title}`} onBack={onBack} />

      {/* 接客のまえに */}
      {sectionId === 'before' && (
        <MarkdownBlock source={data.chapter_0?.rawMarkdown} />
      )}

      {/* STEPセクション */}
      {/^step\d$/.test(sectionId) && (
        <StepContent
          sectionId={sectionId}
          data={data}
          onOpenTheme={onOpenTheme}
          onOpenManual={onOpenManual}
        />
      )}

      {/* 44項目 */}
      {sectionId === 'topics44' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 11, color: '#B0909A', marginBottom: 4 }}>
            全 {data.manuals?.length ?? 0} 項目
          </p>
          {(data.manuals ?? []).map(m => (
            <ItemRow key={m.id} title={m.title} sub={m.scene} onClick={() => onOpenManual(m.id)} />
          ))}
        </div>
      )}

      {/* 色恋 */}
      {sectionId === 'irokoi' && <IrokoiContent data={data} />}

      {/* キャストタイプ */}
      {sectionId === 'cast-type' && <CastTypesContent castTypes={data.castTypes} />}
    </Card>
  )
}

// ─── STEP本文：テーマ一覧＋質問項目 ─────────────────────────────────
function StepContent({
  sectionId, data, onOpenTheme, onOpenManual,
}: {
  sectionId: SectionId
  data: ManualData
  onOpenTheme: (key: string) => void
  onOpenManual: (id: string) => void
}) {
  const stepMap: Record<string, string> = {
    'step1': 'STEP1', 'step2': 'STEP2', 'step3': 'STEP3', 'step4': 'STEP4',
    'step5': 'STEP5', 'step6': 'STEP6', 'step7': 'STEP7',
  }
  const targetStep = stepMap[sectionId]
  const themes: ThemeDoc[] = (data.themes ?? [])
    .filter(t => normalizeStep(t.step) === targetStep)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  const manuals: ManualItem[] = (data.manuals ?? [])
    .filter(m => normalizeStep(m.step) === targetStep)

  if (themes.length === 0 && manuals.length === 0) {
    return <p style={{ fontSize: 12, color: '#B0909A', padding: '20px 0' }}>このSTEPのコンテンツは準備中です。</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {themes.length > 0 && (
        <section>
          <SectionLabel>テーマ一覧（{themes.length}件・タップで会話/行動）</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {themes.map(t => (
              <ItemRow key={t.key} title={t.title} sub={t.subtitle} onClick={() => onOpenTheme(t.key)} />
            ))}
          </div>
        </section>
      )}
      {manuals.length > 0 && (
        <section>
          <SectionLabel>情報をとる質問集（{manuals.length}件）</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {manuals.map(m => (
              <ItemRow key={m.id} title={m.title} sub={m.scene} onClick={() => onOpenManual(m.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function IrokoiContent({ data }: { data: ManualData }) {
  const group = data.extras_groups?.irokoi
  const ids = group?.links?.filter(l => l.target_type === 'philosophy_file').map(l => l.target) ?? []
  const files: PhilosophyFile[] = ids
    .map(id => data.philosophy_files?.find(f => f.id === id))
    .filter((f): f is PhilosophyFile => !!f)

  if (!group) {
    return <p style={{ fontSize: 12, color: '#B0909A' }}>色恋データがまだ収録されていません。</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {group.description && (
        <p style={{ fontSize: 13, color: '#2D1B26', lineHeight: 1.7, margin: 0 }}>{group.description}</p>
      )}
      {files.map(f => (
        <details key={f.id} style={{ background: '#FFFFFF', border: '1px solid #F0DDE2', borderRadius: 12, padding: '12px 14px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#3D2840' }}>{f.title}</summary>
          <div style={{ marginTop: 12 }}>
            <MarkdownBlock source={f.rawMarkdown} />
          </div>
        </details>
      ))}
    </div>
  )
}

function CastTypesContent({ castTypes }: { castTypes?: CastType[] }) {
  const list = castTypes ?? []
  if (list.length === 0) {
    return <p style={{ fontSize: 12, color: '#B0909A' }}>キャストタイプデータがまだ収録されていません。</p>
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {list.map(ct => (
        <div key={ct.id} style={{ background: 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)', border: '1px solid #F4B0BF', borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>{ct.icon}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#3D2840' }}>{ct.name}</div>
          {ct.tagline && <div style={{ fontSize: 11, color: '#E8879A', fontStyle: 'italic', marginTop: 2 }}>{ct.tagline}</div>}
          {ct.feature && <div style={{ fontSize: 11, color: '#2D1B26', marginTop: 6, lineHeight: 1.6 }}><strong>特徴:</strong> {ct.feature}</div>}
          {ct.weapon && <div style={{ fontSize: 11, color: '#2D1B26', marginTop: 4, lineHeight: 1.6 }}><strong>武器:</strong> {ct.weapon}</div>}
        </div>
      ))}
    </div>
  )
}

// ─── テーマ詳細：会話/行動タブ ─────────────────────────────────────
function ThemeDetail({
  theme, data, onBack,
}: {
  theme: ThemeDoc | undefined
  data: ManualData
  onBack: () => void
}) {
  const [tab, setTab] = useState<'conv' | 'action'>('conv')

  if (!theme) {
    return (
      <Card>
        <BackHeader title="テーマが見つかりません" onBack={onBack} />
      </Card>
    )
  }

  const conv: ConversationDoc | undefined = theme.conv_id
    ? data.conversations?.find(c => c.id === theme.conv_id)
    : undefined
  const action: ActionDoc | undefined = theme.action_id
    ? data.actions?.find(a => a.id === theme.action_id)
    : undefined

  // 初期タブを存在する方に
  const currentDoc = tab === 'conv' ? conv : action
  const fallbackDoc = tab === 'conv' ? action : conv
  const docToShow = currentDoc ?? fallbackDoc

  return (
    <Card>
      <BackHeader title={theme.title} onBack={onBack} />
      {theme.subtitle && (
        <p style={{ fontSize: 12, color: '#6B5060', marginTop: -8, marginBottom: 16 }}>{theme.subtitle}</p>
      )}

      {/* タブ */}
      <div style={{ background: '#FFF0F3', borderRadius: 100, padding: 4, display: 'flex', marginBottom: 20 }}>
        <button
          onClick={() => setTab('conv')}
          disabled={!conv}
          style={{
            flex: 1, padding: '10px 12px',
            background: tab === 'conv' ? 'linear-gradient(135deg, #E8879A, #F4B0BF)' : 'transparent',
            color: tab === 'conv' ? '#FFF' : (conv ? '#6B5060' : '#D8C0C8'),
            border: 'none', borderRadius: 100,
            fontSize: 12, fontWeight: 700, cursor: conv ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >🎤 会話マニュアル</button>
        <button
          onClick={() => setTab('action')}
          disabled={!action}
          style={{
            flex: 1, padding: '10px 12px',
            background: tab === 'action' ? 'linear-gradient(135deg, #E8879A, #F4B0BF)' : 'transparent',
            color: tab === 'action' ? '#FFF' : (action ? '#6B5060' : '#D8C0C8'),
            border: 'none', borderRadius: 100,
            fontSize: 12, fontWeight: 700, cursor: action ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >🏃 行動マニュアル</button>
      </div>

      <MarkdownBlock source={docToShow?.rawMarkdown} />
    </Card>
  )
}

// ─── 44項目の詳細 ────────────────────────────────────────────────
function ManualItemDetail({ item, onBack }: { item: ManualItem | undefined; onBack: () => void }) {
  if (!item) {
    return (
      <Card>
        <BackHeader title="項目が見つかりません" onBack={onBack} />
      </Card>
    )
  }
  return (
    <Card>
      <BackHeader title={item.title} onBack={onBack} />
      {item.scene && <p style={{ fontSize: 12, color: '#6B5060', marginTop: -8, marginBottom: 12 }}>📍 {item.scene}</p>}
      {item.purpose && <Field label="目的" value={item.purpose} />}
      {item.serif && <Field label="セリフ" value={`「${item.serif}」`} accent />}
      {item.why && <Field label="なぜ効くか" value={item.why} />}
      {item.standard && <Field label="基準" value={item.standard} />}
      {item.info && <Field label="取れる情報" value={item.info} />}
      {item.reactions && item.reactions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>反応パターン</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {item.reactions.map((r, i) => (
              <div key={i} style={{ background: '#FFFAFC', border: '1px solid #F0DDE2', borderRadius: 10, padding: '10px 12px', fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: '#C0405C', marginBottom: 4 }}>[{r.label}] {r.type}</div>
                <div style={{ color: '#2D1B26', lineHeight: 1.7 }}>客: {r.text}</div>
                <div style={{ color: '#2D1B26', lineHeight: 1.7, marginTop: 4 }}>→ {r.reply}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── 共通パーツ ─────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F0DDE2', borderRadius: 18, padding: '20px 18px', boxShadow: '0 8px 24px rgba(120,60,90,0.08)', marginBottom: 24 }}>
      {children}
    </div>
  )
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid #F0DDE2' }}>
      <button
        onClick={onBack}
        style={{ background: '#FFFFFF', border: '1px solid #F0DDE2', color: '#E8879A', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
      >← 戻る</button>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#3D2840', lineHeight: 1.4 }}>{title}</h2>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: '0.22em', color: '#E8879A', fontWeight: 700, marginBottom: 10 }}>
      {children}
    </div>
  )
}

function ItemRow({ title, sub, onClick }: { title: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: '#FFF', border: '1px solid #F0DDE2', borderRadius: 12, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#3D2840', lineHeight: 1.4 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: '#6B5060', marginTop: 2 }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 16, color: '#E8879A' }}>→</span>
    </button>
  )
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.22em', color: '#D45060', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: accent ? 15 : 13,
        color: '#2D1B26',
        lineHeight: 1.8,
        fontWeight: accent ? 600 : 400,
        background: accent ? 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)' : 'transparent',
        padding: accent ? '12px 14px' : 0,
        borderRadius: accent ? 10 : 0,
      }}>{value}</div>
    </div>
  )
}
