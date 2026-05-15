'use client'

// ─────────────────────────────────────────────────────────────────────
//  Manual44View – 44項目の一覧表示
//
//  仕様：
//   - data.manuals を groupManuals() で group 別に集約
//   - 各 group をアコーディオン（初期は全部折りたたみ）
//   - 開くと項目を縦並びで列挙（タイトル + scene、タップで onOpenManual(id)）
//   - 上部に「全44項目」「P01〜P44」サマリ
//   - React #300 再発防止：useMemo 不使用、useState 初期値は静的リテラル
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import type { ManualData, ManualItem } from '@/types/manual'
import { groupManuals } from '@/lib/manual-helpers'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const TEXT = '#2D1B26'
const HEAD = '#3D2840'
const MUTED = '#6B5560'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const BORDER = '#F0DDE2'

type Props = {
  data: ManualData
  onOpenManual: (id: string) => void
  onBack: () => void
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
        transition: 'transform 0.15s, box-shadow 0.15s',
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

// 1グループのアコーディオン
function GroupCard({
  group,
  items,
  onOpenManual,
}: {
  group: string
  items: ManualItem[]
  onOpenManual: (id: string) => void
}) {
  const [open, setOpen] = useState<boolean>(false)
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
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: HEAD,
              letterSpacing: '0.02em',
            }}
          >
            {group}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: PINK,
              background: '#FFF0F3',
              padding: '2px 9px',
              borderRadius: 100,
              letterSpacing: '0.04em',
              border: `1px solid ${PINK_LIGHT}`,
            }}
          >
            {items.length}件
          </span>
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 12,
            color: PINK,
            fontWeight: 700,
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
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {items.map((it, i) => (
            <ItemRow key={`it-${it.id}-${i}`} item={it} onOpen={onOpenManual} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ─── 本体 ──────────────────────────────────────────────────────
export default function Manual44View({
  data,
  onOpenManual,
  onBack,
}: Props) {
  const manuals = data.manuals ?? []
  const grouped = groupManuals(manuals)
  const total = manuals.length
  const firstId = manuals[0]?.id?.toUpperCase() ?? 'P01'
  const lastId = manuals[manuals.length - 1]?.id?.toUpperCase() ?? `P${total}`

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

      {/* サマリヘッダー（検索バー風） */}
      <div
        style={{
          background: 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)',
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.3em',
              color: PINK,
              fontWeight: 700,
            }}
          >
            🌸 質問・持ち上げ集
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: HEAD,
              letterSpacing: '0.02em',
              lineHeight: 1.4,
            }}
          >
            全{total}項目（{firstId}〜{lastId}）
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: MUTED,
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            borderRadius: 100,
            padding: '5px 12px',
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          {grouped.length} グループ
        </div>
      </div>

      {/* グループ別アコーディオン */}
      {grouped.length === 0 ? (
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
          項目データが見つかりません。
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {grouped.map((g, i) => (
            <GroupCard
              key={`gr-${g.group}-${i}`}
              group={g.group}
              items={g.items}
              onOpenManual={onOpenManual}
            />
          ))}
        </div>
      )}
    </div>
  )
}
