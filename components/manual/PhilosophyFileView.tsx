'use client'

// ─────────────────────────────────────────────────────────────────────
//  PhilosophyFileView – 色恋鉄則などの philosophy_file 一覧→詳細表示
//
//  仕様：
//   - extras_groups.irokoi.links から target_type='philosophy_file' を抽出
//   - getPhilosophyFilesByIds() で実体取得
//   - グループ description / icon を上部に表示
//   - 各 file をアコーディオン（初期は最初の1つだけ展開）
//   - file.sections があれば内部でさらにネストアコーディオン化
//   - sections がなければ rawMarkdown を Markdown で全文表示
//   - React #300 再発防止：useMemo 不使用、useState 初期値は静的リテラル
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import type {
  ManualData,
  PhilosophyFile,
  PhilosophyFileSection,
  PhilosophyFileSubsection,
} from '@/types/manual'
import { getPhilosophyFilesByIds } from '@/lib/manual-helpers'
import Markdown from '@/components/manual/Markdown'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const TEXT = '#2D1B26'
const HEAD = '#3D2840'
const MUTED = '#6B5560'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const BORDER = '#F0DDE2'

type Props = {
  data: ManualData
  onBack: () => void
}

// ─── 内部：1サブセクション ─────────────────────────────────────
function SubsectionCard({ sub }: { sub: PhilosophyFileSubsection }) {
  const [open, setOpen] = useState<boolean>(false)
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {typeof sub.num === 'number' ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#FFFFFF',
                background: `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`,
                padding: '2px 8px',
                borderRadius: 100,
                letterSpacing: '0.04em',
                flexShrink: 0,
              }}
            >
              {sub.num}
            </span>
          ) : null}
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: HEAD,
              letterSpacing: '0.02em',
              lineHeight: 1.5,
            }}
          >
            {sub.title}
          </span>
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 11,
            color: PINK,
            fontWeight: 700,
            marginLeft: 8,
            flexShrink: 0,
          }}
        >
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open ? (
        <div
          style={{
            padding: '4px 14px 14px',
            borderTop: `1px solid ${BORDER}`,
            background: '#FFFCFD',
          }}
        >
          <Markdown source={sub.body} />
        </div>
      ) : null}
    </div>
  )
}

// ─── 内部：1セクション ──────────────────────────────────────────
function SectionCard({ sec }: { sec: PhilosophyFileSection }) {
  const [open, setOpen] = useState<boolean>(false)
  const hasSubs = sec.subsections && sec.subsections.length > 0
  return (
    <div
      style={{
        background: '#FFFAFC',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: HEAD,
            letterSpacing: '0.02em',
            lineHeight: 1.5,
          }}
        >
          {sec.title}
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 12,
            color: PINK,
            fontWeight: 700,
            marginLeft: 8,
            flexShrink: 0,
          }}
        >
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open ? (
        <div
          style={{
            padding: '4px 14px 14px',
            borderTop: `1px solid ${BORDER}`,
            background: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {sec.body && sec.body.trim() ? <Markdown source={sec.body} /> : null}
          {hasSubs ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {sec.subsections!.map((sub, i) => (
                <SubsectionCard key={`sub-${i}`} sub={sub} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ─── 内部：1ファイル ────────────────────────────────────────────
function FileCard({
  file,
  defaultOpen,
}: {
  file: PhilosophyFile
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen)
  const hasSections = file.sections && file.sections.length > 0
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        boxShadow: '0 2px 8px rgba(232,135,154,0.06)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: HEAD,
              letterSpacing: '0.02em',
              lineHeight: 1.5,
            }}
          >
            {file.title}
          </span>
          {file.subtitle ? (
            <span
              style={{
                fontSize: 11,
                color: MUTED,
                letterSpacing: '0.02em',
              }}
            >
              {file.subtitle}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 12,
            color: PINK,
            fontWeight: 700,
            marginLeft: 8,
            flexShrink: 0,
          }}
        >
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open ? (
        <div
          style={{
            padding: '4px 18px 18px',
            borderTop: `1px solid ${BORDER}`,
            background: '#FFFCFD',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {hasSections ? (
            file.sections!.map((sec, i) => (
              <SectionCard key={`sec-${i}`} sec={sec} />
            ))
          ) : (
            <Markdown source={file.rawMarkdown ?? ''} />
          )}
        </div>
      ) : null}
    </div>
  )
}

// ─── 本体 ──────────────────────────────────────────────────────
export default function PhilosophyFileView({ data, onBack }: Props) {
  const group = data.extras_groups?.irokoi
  const links = group?.links ?? []
  const ids = links
    .filter((l) => l.target_type === 'philosophy_file')
    .map((l) => l.target)
  const files = getPhilosophyFilesByIds(data, ids)

  return (
    <div
      style={{
        padding: 16,
        fontFamily: READ_FONT,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* 戻る */}
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            color: PINK,
            fontSize: 12,
            fontWeight: 700,
            padding: '7px 14px',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
          }}
        >
          ← 戻る
        </button>
      </div>

      {/* グループヘッダー */}
      <div
        style={{
          background: 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)',
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: '18px 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          {group?.icon ? (
            <span style={{ fontSize: 24 }}>{group.icon}</span>
          ) : null}
          <div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: HEAD,
                letterSpacing: '0.02em',
                lineHeight: 1.4,
              }}
            >
              {group?.title || '色恋の考え方'}
            </div>
            {group?.subtitle ? (
              <div
                style={{
                  fontSize: 11,
                  color: PINK,
                  marginTop: 2,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
              >
                {group.subtitle}
              </div>
            ) : null}
          </div>
        </div>
        {group?.description ? (
          <div
            style={{
              fontSize: 12.5,
              color: TEXT,
              lineHeight: 1.8,
              letterSpacing: '0.02em',
            }}
          >
            {group.description}
          </div>
        ) : null}
      </div>

      {/* ファイル一覧 */}
      {files.length === 0 ? (
        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 18,
            color: MUTED,
            fontSize: 13,
          }}
        >
          このグループに紐づく文書が見つかりません。
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {files.map((file, i) => (
            <FileCard
              key={`file-${file.id}-${i}`}
              file={file}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
