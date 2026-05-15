// ─────────────────────────────────────────────────────────────────────
//  教科書共通ヘルパー（純粋関数のみ・副作用なし）
//  v0.2.7 React #300 を絶対に再発させないため、useState/useMemoは一切なし
// ─────────────────────────────────────────────────────────────────────

import type { ManualData, ManualItem, ThemeDoc, ConversationDoc, ActionDoc, PhilosophyFile } from '@/types/manual'

// step を正規化（"STEP1" / 1 / "1" → "STEP1"）
export function normalizeStep(s: string | number | undefined | null): string {
  if (s == null) return ''
  if (typeof s === 'number') return `STEP${s}`
  if (/^\d+$/.test(s)) return `STEP${s}`
  return s
}

// rawMarkdown 冒頭の frontmatter を除去
export function stripFrontmatter(md: string | undefined | null): string {
  if (!md) return ''
  const trimmed = md.replace(/^\s*\n+/, '')
  const head = trimmed.substring(0, 400)
  if (/^(title|step|side|author|status|updated|id|filename|category):/m.test(head)) {
    const endIdx = trimmed.indexOf('\n---\n')
    if (endIdx > 0 && endIdx < 600) {
      return trimmed.substring(endIdx + 5).replace(/^\s*\n+/, '')
    }
    if (trimmed.startsWith('---\n')) {
      const e = trimmed.indexOf('\n---\n', 4)
      if (e > 0) return trimmed.substring(e + 5).replace(/^\s*\n+/, '')
    }
  }
  return md
}

// 反応タイプ別の色（謙遜=紫 / 自慢=橙 / 自虐=青）
export function getReactionStyle(type: string | undefined): { bg: string; border: string; accent: string; emoji: string } {
  if (!type) return { bg: '#FFF8FA', border: '#F0DDE2', accent: '#E8879A', emoji: '💭' }
  if (type.includes('kenson') || type.includes('謙遜')) {
    return { bg: '#F4EEFA', border: '#D4BFE0', accent: '#8E5BB0', emoji: '🙇' }
  }
  if (type.includes('jiman') || type.includes('自慢')) {
    return { bg: '#FFF1E6', border: '#F0CFA8', accent: '#C77835', emoji: '✨' }
  }
  if (type.includes('jigyaku') || type.includes('自虐')) {
    return { bg: '#E8F0F8', border: '#B8D0E0', accent: '#3E6F95', emoji: '😅' }
  }
  // 懐疑など、その他のラベル
  return { bg: '#FFF8FA', border: '#F0DDE2', accent: '#E8879A', emoji: '💭' }
}

// STEPに対応する theme一覧（並べ替え済み）
export function pickThemesByStep(data: ManualData, step: string): ThemeDoc[] {
  return (data.themes ?? [])
    .filter(t => normalizeStep(t.step) === step)
    .slice()
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
}

// STEPに対応する manuals一覧
export function pickManualsByStep(data: ManualData, step: string): ManualItem[] {
  return (data.manuals ?? []).filter(m => normalizeStep(m.step) === step)
}

// theme から conv/action を引く
export function getThemeConv(data: ManualData, theme: ThemeDoc): ConversationDoc | undefined {
  if (!theme.conv_id) return undefined
  return data.conversations?.find(c => c.id === theme.conv_id)
}
export function getThemeAction(data: ManualData, theme: ThemeDoc): ActionDoc | undefined {
  if (!theme.action_id) return undefined
  return data.actions?.find(a => a.id === theme.action_id)
}

// 初期タブを決定論的に決める（会話があればconv、なければaction）
export function getInitialTab(theme: ThemeDoc): 'conv' | 'action' {
  if (theme.no_conv) return 'action'
  if (theme.conv_id) return 'conv'
  return 'action'
}

// 44項目の group ごとに集約
export function groupManuals(manuals: ManualItem[]): Array<{ group: string; items: ManualItem[] }> {
  const map = new Map<string, ManualItem[]>()
  for (const m of manuals) {
    const g = m.group || 'その他'
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(m)
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }))
}

// philosophy_files を id 配列から取得
export function getPhilosophyFilesByIds(data: ManualData, ids: string[]): PhilosophyFile[] {
  return ids
    .map(id => data.philosophy_files?.find(f => f.id === id))
    .filter((f): f is PhilosophyFile => !!f)
}

// rawMarkdown を ## 見出しでセクション分解（パターン集ビュー用）
export function splitMarkdownH2Sections(md: string | undefined | null): Array<{ id: string; title: string; body: string }> {
  if (!md) return []
  // frontmatter 削除
  const clean = stripFrontmatter(md)
  // 先頭の # タイトル行を1つだけ除外
  const noH1 = clean.replace(/^#\s+[^\n]+\n+/, '')
  const lines = noH1.split('\n')
  const sections: Array<{ id: string; title: string; body: string }> = []
  let current: { id: string; title: string; body: string } | null = null
  let counter = 0
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current)
      counter++
      const title = line.replace(/^##\s+/, '').trim()
      current = { id: `h2-${counter}`, title, body: '' }
    } else if (current) {
      current.body += line + '\n'
    }
  }
  if (current) sections.push(current)
  for (const s of sections) s.body = s.body.trim()
  return sections
}

// 本文の要約（最初の段落、最大160文字）
export function makeSummary(body: string | undefined | null, maxLen = 160): string {
  if (!body) return ''
  const first = body.split(/\n\n+/)[0] ?? ''
  const plain = first
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/\n/g, ' ')
    .trim()
  if (plain.length <= maxLen) return plain
  return plain.substring(0, maxLen) + '…'
}
