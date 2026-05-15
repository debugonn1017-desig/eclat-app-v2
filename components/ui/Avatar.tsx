'use client'
// ─────────────────────────────────────────────────────────────────
//  Avatar — イニシャル円アイコン (リブランド最終確定版)
//
//  使い方:
//    <Avatar name="田中花子" size="md" />                                    // 通常
//    <Avatar name="田中花子" customerRank="S" size="md" />                    // 顧客 S ランク
//    <Avatar name="あやな" castTier="A層" size="lg" onClick={...} />          // キャスト A層
//    <Avatar name="ゲスト" customerRank="A" castTier="B層" size="sm" />       // 両方
//
//  顧客ランクの色 (桜系階調 — 上が濃く下が淡い):
//    S = #D45060 (深紅)
//    A = #E8879B (濃ピンク)
//    B = #F4A5B8 (淡ピンク)
//    C = #FFE4ED (極淡ピンク, 文字色は #888 に切替)
//
//  「無類」(キャスト層) は別軸:
//    白背景 + ピンク枠線 + 🌸 アイコンの特殊スタイル
//    DB 分布で 27% を占めるため、視覚的に「無印 = 主役」として扱う
//
//  既存からの移行:
//    `rank` → `customerRank`、`tier` → `castTier` に rename
//    grep: `<Avatar.*rank=` / `<Avatar.*tier=`
// ─────────────────────────────────────────────────────────────────

import { C } from '@/lib/colors'

export type CustomerRank = 'S' | 'A' | 'B' | 'C' | '切れた' | null
export type CastTier = 'A層' | 'B層' | '新人層' | '無類' | 'C層' | 'その他' | null
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

type Props = {
  /** 表示する名前。先頭 1 文字を中央に表示 */
  name: string
  /** 顧客ランクバッジ (右下に小さく) */
  customerRank?: CustomerRank
  /** キャスト層バッジ (左下に小さく) */
  castTier?: CastTier
  /** サイズ */
  size?: AvatarSize
  /** クリック可能にする */
  onClick?: () => void
  /** 追加スタイル (緊急用、なるべく避ける) */
  style?: React.CSSProperties
}

const SIZE_MAP: Record<AvatarSize, { px: number; fontSize: number; badge: number }> = {
  sm: { px: 28, fontSize: 11, badge: 9 },
  md: { px: 36, fontSize: 14, badge: 10 },
  lg: { px: 44, fontSize: 17, badge: 10 },
  xl: { px: 64, fontSize: 24, badge: 12 },
}

// 顧客ランクの色 — 桜系階調 (S=深紅 → C=極淡ピンク)
// '切れた' は連絡が切れたお客様用の手動専用ランク → 濃いグレー
const CUSTOMER_RANK_BG: Record<NonNullable<CustomerRank>, string> = {
  S: '#D45060',
  A: '#E8879B',
  B: '#F4A5B8',
  C: '#FFE4ED',
  '切れた': '#6B5060',
}
const CUSTOMER_RANK_FG: Record<NonNullable<CustomerRank>, string> = {
  S: '#FFF',
  A: '#FFF',
  B: '#FFF',
  C: '#888', // 極淡背景なのでテキストは濃色に
  '切れた': '#FFF',
}

// キャスト層の色
const TIER_COLOR: Record<NonNullable<CastTier>, string> = {
  'A層': '#D4537E',
  'B層': '#5B8DBE',
  '新人層': '#0F6E56',
  '無類': '#FFF',     // 特殊: 白背景
  'C層': '#999',
  'その他': '#9A8890',
}
const TIER_TEXT_COLOR: Record<NonNullable<CastTier>, string> = {
  'A層': '#FFF',
  'B層': '#FFF',
  '新人層': '#FFF',
  '無類': '#E8879A',  // 特殊: ピンク文字
  'C層': '#FFF',
  'その他': '#FFF',
}

export default function Avatar({
  name, customerRank, castTier, size = 'md', onClick, style,
}: Props) {
  const dim = SIZE_MAP[size]
  const initial = (name || '?').charAt(0).toUpperCase()
  const isClickable = !!onClick
  const isMuruishi = castTier === '無類'

  return (
    <div
      onClick={onClick}
      style={{
        width: dim.px, height: dim.px,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #FFE8EE, #FFF2F5)',
        border: `1px solid ${C.border}`,
        display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: dim.fontSize, color: C.pink, fontWeight: 500,
        position: 'relative', flexShrink: 0,
        cursor: isClickable ? 'pointer' : 'default',
        userSelect: 'none',
        transition: isClickable ? 'transform 0.1s' : undefined,
        ...style,
      }}
    >
      {initial}

      {/* 顧客ランクバッジ (右下) */}
      {customerRank && (
        <span style={{
          position: 'absolute', bottom: -2, right: -2,
          background: CUSTOMER_RANK_BG[customerRank],
          color: CUSTOMER_RANK_FG[customerRank],
          fontSize: dim.badge, fontWeight: 700,
          width: dim.badge + 6, height: dim.badge + 6,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid #FFF',
          boxShadow: customerRank === 'C' ? '0 0 0 1px #E8DDE0' : undefined,
        }}>{customerRank === '切れた' ? '💔' : customerRank}</span>
      )}

      {/* キャスト層バッジ (左下) */}
      {castTier && !isMuruishi && (
        <span style={{
          position: 'absolute', bottom: -2, left: -2,
          background: TIER_COLOR[castTier], color: TIER_TEXT_COLOR[castTier],
          fontSize: dim.badge - 1, fontWeight: 600,
          padding: '1px 4px', borderRadius: 3,
          border: '1px solid #FFF',
          whiteSpace: 'nowrap',
        }}>{castTier.replace('層', '')}</span>
      )}

      {/* 無類は特殊: 白背景 + ピンク枠線 + 🌸 */}
      {isMuruishi && (
        <span
          aria-label="無類"
          title="無類"
          style={{
            position: 'absolute', bottom: -3, left: -3,
            background: '#FFF',
            border: `1.5px solid ${C.pink}`,
            color: C.pink,
            fontSize: dim.badge - 1,
            width: dim.badge + 8, height: dim.badge + 8,
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
        >🌸</span>
      )}
    </div>
  )
}
