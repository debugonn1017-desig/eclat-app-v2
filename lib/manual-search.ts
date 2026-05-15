// ─────────────────────────────────────────────────────────────────────
//  教科書検索ロジック v0.3.7（純粋関数のみ・副作用なし）
//  検索対象：
//   - themes（テーマ18件）
//   - manuals（44項目）
//   - philosophy_files（色恋の鉄則 / 依存予防策 / お客様タイプ など）
//   - chapter_0（接客のまえに）
//   - castTypes（清楚/甘え/お姉さん/クール 4タイプ）
//   - extras_groups（色恋・営業判断などの目次系）
//  - スコア付きヒットを返す
// ─────────────────────────────────────────────────────────────────────

import type {
  ManualData,
  ManualItem,
  ThemeDoc,
  PhilosophyFile,
  CastType,
} from '@/types/manual'

export type SearchHit =
  | { kind: 'theme'; theme: ThemeDoc; snippet: string; score: number }
  | { kind: 'manual'; manual: ManualItem; snippet: string; score: number }
  | { kind: 'philosophy'; file: PhilosophyFile; snippet: string; score: number }
  | { kind: 'chapter'; sectionId: string; title: string; snippet: string; score: number }
  | { kind: 'casttype'; castType: CastType; snippet: string; score: number }

// 文字列を小文字化（null 安全）
function lower(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.toLowerCase()
}

// snippet 整形（80文字でトリム）
function clip(s: string, max = 80): string {
  if (!s) return ''
  if (s.length <= max) return s
  return s.substring(0, max) + '…'
}

// query が含まれているか
function includes(text: unknown, q: string): boolean {
  return lower(text).includes(q)
}

// structured オブジェクトの値を全部スキャンしてヒットがあれば加算
function scanStructured(
  s: unknown,
  q: string
): { score: number; snippet: string } {
  if (!s || typeof s !== 'object') return { score: 0, snippet: '' }
  let score = 0
  let snippet = ''
  for (const v of Object.values(s as Record<string, unknown>)) {
    if (typeof v === 'string') {
      if (lower(v).includes(q)) {
        score += 3
        if (!snippet) snippet = clip(v, 80)
      }
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') {
          if (lower(item).includes(q)) {
            score += 2
            if (!snippet) snippet = clip(item, 80)
          }
        } else if (item && typeof item === 'object') {
          for (const inner of Object.values(item as Record<string, unknown>)) {
            if (typeof inner === 'string' && lower(inner).includes(q)) {
              score += 2
              if (!snippet) snippet = clip(inner, 80)
            }
          }
        }
      }
    }
  }
  return { score, snippet }
}

// セクション配列（{title, body, subsections} の形）を再帰スキャン
function scanSections(
  sections: unknown,
  q: string
): { score: number; snippet: string } {
  if (!Array.isArray(sections)) return { score: 0, snippet: '' }
  let score = 0
  let snippet = ''
  for (const sec of sections) {
    if (!sec || typeof sec !== 'object') continue
    const o = sec as Record<string, unknown>
    if (typeof o.title === 'string' && lower(o.title).includes(q)) {
      score += 4
      if (!snippet) snippet = clip(o.title, 80)
    }
    if (typeof o.body === 'string' && lower(o.body).includes(q)) {
      score += 3
      if (!snippet) snippet = clip(o.body, 80)
    }
    // 入れ子の subsections
    if (Array.isArray(o.subsections)) {
      const r = scanSections(o.subsections, q)
      score += r.score
      if (!snippet && r.snippet) snippet = r.snippet
    }
  }
  return { score, snippet }
}

export function searchManualData(
  data: ManualData | null,
  query: string,
  maxHits = 30
): SearchHit[] {
  if (!data) return []
  const trimmed = query.trim()
  if (!trimmed) return []
  const q = trimmed.toLowerCase()
  const hits: SearchHit[] = []

  // ── themes ──────────────────────────────────────────────────────
  for (const theme of data.themes ?? []) {
    let score = 0
    let snippet = ''

    if (includes(theme.title, q)) {
      score += 10
      snippet = theme.title
    }
    if (includes(theme.subtitle, q)) {
      score += 5
      if (!snippet && theme.subtitle) snippet = theme.subtitle
    }

    const conv = theme.conv_id
      ? data.conversations?.find((c) => c.id === theme.conv_id)
      : undefined
    const action = theme.action_id
      ? data.actions?.find((a) => a.id === theme.action_id)
      : undefined

    for (const doc of [conv, action]) {
      if (!doc) continue
      const s = (doc as { structured?: unknown }).structured
      const r = scanStructured(s, q)
      score += r.score
      if (!snippet && r.snippet) snippet = r.snippet
      // rawMarkdown も対象に
      const raw = (doc as { rawMarkdown?: unknown }).rawMarkdown
      if (typeof raw === 'string' && lower(raw).includes(q)) {
        score += 1
        if (!snippet) snippet = clip(raw.replace(/\s+/g, ' '), 80)
      }
    }

    if (score > 0) {
      hits.push({ kind: 'theme', theme, snippet, score })
    }
  }

  // ── manuals ─────────────────────────────────────────────────────
  for (const m of data.manuals ?? []) {
    let score = 0
    let snippet = ''

    if (includes(m.title, q)) {
      score += 10
      snippet = m.title
    }
    if (includes(m.serif, q)) {
      score += 8
      if (!snippet && m.serif) snippet = `「${clip(m.serif, 78)}」`
    }
    if (includes(m.scene, q)) {
      score += 3
      if (!snippet && m.scene) snippet = clip(m.scene, 80)
    }
    if (includes(m.purpose, q)) {
      score += 3
      if (!snippet && m.purpose) snippet = clip(m.purpose, 80)
    }
    if (includes(m.why, q)) {
      score += 2
      if (!snippet && m.why) snippet = clip(m.why, 80)
    }
    if (includes(m.standard, q)) {
      score += 2
      if (!snippet && m.standard) snippet = clip(m.standard, 80)
    }
    if (includes(m.info, q)) {
      score += 2
      if (!snippet && m.info) snippet = clip(m.info, 80)
    }
    if (m.keywords && Array.isArray(m.keywords)) {
      for (const k of m.keywords) {
        if (includes(k, q)) {
          score += 5
          if (!snippet) snippet = `#${k}`
          break
        }
      }
    }
    if (m.reactions && Array.isArray(m.reactions)) {
      for (const r of m.reactions) {
        if (r && includes(r.reply, q)) {
          score += 3
          if (!snippet && r.reply) snippet = clip(r.reply, 80)
        }
        if (r && includes(r.customer, q)) {
          score += 2
          if (!snippet && r.customer) snippet = clip(r.customer, 80)
        }
        if (r && includes(r.text, q)) {
          score += 2
          if (!snippet && r.text) snippet = clip(r.text, 80)
        }
      }
    }

    if (score > 0) {
      hits.push({ kind: 'manual', manual: m, snippet, score })
    }
  }

  // ── philosophy_files（色恋の鉄則 など）────────────────────────────
  for (const file of data.philosophy_files ?? []) {
    let score = 0
    let snippet = ''
    if (includes(file.title, q)) {
      score += 10
      snippet = file.title
    }
    if (includes(file.subtitle, q)) {
      score += 4
      if (!snippet && file.subtitle) snippet = file.subtitle
    }
    if (Array.isArray(file.sections)) {
      const r = scanSections(file.sections, q)
      score += r.score
      if (!snippet && r.snippet) snippet = r.snippet
    }
    if (file.rawMarkdown && includes(file.rawMarkdown, q)) {
      score += 1
      if (!snippet) snippet = clip(file.rawMarkdown.replace(/\s+/g, ' '), 80)
    }
    if (score > 0) {
      hits.push({ kind: 'philosophy', file, snippet, score })
    }
  }

  // ── chapter_0（接客のまえに）────────────────────────────────────
  if (data.chapter_0) {
    const ch = data.chapter_0
    // ファイル全体（タイトル/raw）への部分ヒット → sectionId='whole'
    if (includes(ch.title, q)) {
      hits.push({
        kind: 'chapter',
        sectionId: 'whole',
        title: ch.title,
        snippet: ch.title,
        score: 8,
      })
    }
    // 各 section をそれぞれヒットとして返す
    if (Array.isArray(ch.sections)) {
      for (const sec of ch.sections) {
        if (!sec) continue
        let secScore = 0
        let secSnippet = ''
        if (typeof sec.title === 'string' && lower(sec.title).includes(q)) {
          secScore += 6
          secSnippet = sec.title
        }
        if (typeof sec.body === 'string' && lower(sec.body).includes(q)) {
          secScore += 3
          if (!secSnippet) secSnippet = clip(sec.body, 80)
        }
        if (secScore > 0) {
          hits.push({
            kind: 'chapter',
            sectionId: sec.id ?? sec.title ?? 'section',
            title: sec.title ?? '接客のまえに',
            snippet: secSnippet,
            score: secScore,
          })
        }
      }
    }
    // 含むだけのフォールバック（rawMarkdown）
    if (
      typeof ch.rawMarkdown === 'string' &&
      lower(ch.rawMarkdown).includes(q) &&
      hits.findIndex(h => h.kind === 'chapter') === -1
    ) {
      hits.push({
        kind: 'chapter',
        sectionId: 'whole',
        title: ch.title ?? '接客のまえに',
        snippet: clip(ch.rawMarkdown.replace(/\s+/g, ' '), 80),
        score: 2,
      })
    }
  }

  // ── castTypes（清楚/甘え/お姉さん/クール）─────────────────────────
  for (const ct of data.castTypes ?? []) {
    let score = 0
    let snippet = ''
    if (includes(ct.name, q)) {
      score += 10
      snippet = ct.name
    }
    if (includes(ct.tagline, q)) {
      score += 4
      if (!snippet && ct.tagline) snippet = ct.tagline
    }
    for (const key of ['feature', 'weapon', 'strong', 'weak', 'basic', 'advice'] as const) {
      const v = (ct as unknown as Record<string, unknown>)[key]
      if (typeof v === 'string' && lower(v).includes(q)) {
        score += 2
        if (!snippet) snippet = clip(v, 80)
      }
    }
    if (score > 0) {
      hits.push({ kind: 'casttype', castType: ct, snippet, score })
    }
  }

  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, maxHits)
}
