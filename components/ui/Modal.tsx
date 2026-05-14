'use client'
// ─────────────────────────────────────────────────────────────────
//  Modal — リブランド版モーダル (centered / fullscreen 2 モード)
//   既存の手書きモーダル (LineMessageProposerModal, RankExplanationModal 等)
//   を順次置き換える基盤。
//
//  使い方:
//    <Modal open={open} onClose={close} title="文面提案">
//      <p>本文</p>
//    </Modal>
//
//    <Modal open={open} onClose={close} mode="fullscreen" title="...">
//      <FullView />
//    </Modal>
//
//  特徴:
//    - 背景クリック / Escape キーで閉じる
//    - ヘッダー固定 + コンテンツスクロール
//    - レスポンシブ (mobile = fullscreen 寄り)
// ─────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { C } from '@/lib/colors'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** モード: centered=中央配置の小〜中、fullscreen=画面いっぱい */
  mode?: 'centered' | 'fullscreen'
  /** centered モードでの最大幅 */
  maxWidth?: number
  /** ヘッダー右に追加要素 (例: ステータスバッジ) */
  headerRight?: ReactNode
  /** 子要素 */
  children: ReactNode
  /** 背景クリックで閉じるか (デフォルト true) */
  closeOnBackdrop?: boolean
}

export default function Modal({
  open, onClose, title,
  mode = 'centered',
  maxWidth = 640,
  headerRight,
  children,
  closeOnBackdrop = true,
}: Props) {
  // Escape キーで閉じる
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)', zIndex: 1000,
        display: 'flex',
        alignItems: mode === 'fullscreen' ? 'stretch' : 'center',
        justifyContent: 'center',
        padding: mode === 'fullscreen' ? 0 : 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white,
          borderRadius: mode === 'fullscreen' ? 0 : 12,
          width: '100%',
          maxWidth: mode === 'fullscreen' ? '100%' : maxWidth,
          maxHeight: mode === 'fullscreen' ? '100%' : '90vh',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: mode === 'fullscreen' ? 'none' : '0 12px 48px rgba(0,0,0,0.18)',
        }}
      >
        {/* ヘッダー */}
        {(title || headerRight) && (
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {title && (
              <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
                {title}
              </span>
            )}
            {headerRight && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{headerRight}</div>}
            <button
              onClick={onClose}
              aria-label="閉じる"
              style={{
                marginLeft: 'auto',
                background: 'transparent', border: 'none',
                fontSize: 22, color: C.pinkMuted,
                cursor: 'pointer', padding: 0, lineHeight: 1,
                fontFamily: 'inherit',
              }}
            >×</button>
          </div>
        )}

        {/* 本体スクロール */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
