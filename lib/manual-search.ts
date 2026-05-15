// ─────────────────────────────────────────────────────────────────────
//  教科書検索ロジック（純粋関数のみ・副作用なし）
//  - テーマ / 44項目 を横断検索
//  - スコア付きヒットを返す
//  - useMemo / useState は使わないので呼び出し側で都度呼んでOK
// ─────────────────────────────────────────────────────────────────────

import type { ManualData, ManualItem, ThemeDoc } from '@/types/manual'

export type SearchHit =
  | { kind: 'theme'; theme: ThemeDoc; snippet: string; score: number }
  | { kind: 'manual'; manual: ManualItem; snippet: string; score: number }

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

  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, maxHits)
}
