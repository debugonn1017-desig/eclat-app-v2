'use client'

// ─────────────────────────────────────────────────────────────────────
//  PageHeader – v0.3.2 共通ヘッダー
//   - 各ページのヘッダーで共通化されたバー
//   - 左: 戻るボタン (+任意ロゴ) + タイトル/サブタイトル
//   - 右: actions（任意）/ 🏠ホーム / NotificationBell / UserChip
//   - sticky 既定 ON、blur 効きの桜白背景
// ─────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { C } from '@/lib/colors'
import { useBackOrHome } from '@/hooks/useBackOrHome'
import NotificationBell from '@/components/NotificationBell'
import UserChip from '@/components/UserChip'

type Props = {
  /** タイトル（メイン表示） */
  title?: string
  /** サブタイトル（小さい英文等、optional） */
  subtitle?: string
  /** 戻るボタンを表示するか（既定: true） */
  showBack?: boolean
  /** 戻るボタンのラベル（既定: '← 戻る'） */
  backLabel?: string
  /** 戻るのフォールバック先（履歴なし時の遷移先、既定: '/home'） */
  backFallback?: string
  /** ホームボタンを表示するか（既定: true、右側） */
  showHome?: boolean
  /** NotificationBell を表示するか（既定: true） */
  showBell?: boolean
  /** UserChip を表示するか（既定: true） */
  showUserChip?: boolean
  /** 中央のロゴを表示するか（既定: false） */
  showLogo?: boolean
  /** 右側に追加で表示するアクション（MonthSwitcher等） */
  actions?: React.ReactNode
  /** sticky にするか（既定: true） */
  sticky?: boolean
}

export default function PageHeader({
  title,
  subtitle,
  showBack = true,
  backLabel = '← 戻る',
  backFallback = '/home',
  showHome = true,
  showBell = true,
  showUserChip = true,
  showLogo = false,
  actions,
  sticky = true,
}: Props) {
  const goBack = useBackOrHome(backFallback)
  return (
    <header
      className="eclat-page-header"
      style={{
        position: sticky ? 'sticky' : 'relative',
        top: 0,
        zIndex: 40,
        background: C.headerBg,
        borderBottom: `1px solid ${C.border}`,
        padding: 'calc(10px + env(safe-area-inset-top, 0px)) 14px 10px',
        gap: 10,
        backdropFilter: 'saturate(140%) blur(6px)',
        WebkitBackdropFilter: 'saturate(140%) blur(6px)',
      }}
    >
      {/* 左：戻る + ロゴ + タイトル */}
      <div className="eclat-page-header-left" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {showBack && (
          <button
            type="button"
            onClick={goBack}
            style={{
              background: 'transparent',
              border: `1px solid transparent`,
              color: C.pink,
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 10px',
              borderRadius: 10,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {backLabel}
          </button>
        )}
        {showLogo && (
          <Link
            href="/home"
            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
          >
            <span
              style={{
                fontSize: 17,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                fontFamily: 'serif',
              }}
            >
              Éclat
            </span>
          </Link>
        )}
        {title && (
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 15,
                fontWeight: 700,
                margin: 0,
                color: C.dark,
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: '0.22em',
                  fontWeight: 700,
                  color: C.pinkMuted,
                  marginTop: 1,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        )}
      </div>
      {/* 画面固有の操作。スマホではタイトル行の下へ分ける。 */}
      {actions && (
        <div className="eclat-page-header-custom-actions">
          {actions}
        </div>
      )}
      {/* 右：Home / Bell / UserChip */}
      <div className="eclat-page-header-core-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {showHome && (
          <Link
            className="eclat-page-header-home"
            href="/home"
            style={{
              color: '#FFFFFF',
              background: `linear-gradient(135deg, ${C.pink} 0%, ${C.pinkLight} 100%)`,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.02em',
              textDecoration: 'none',
              padding: '7px 12px',
              borderRadius: 10,
              boxShadow: '0 3px 8px rgba(232,135,154,0.28)',
            }}
          >
            🏠 ホーム
          </Link>
        )}
        {showBell && <NotificationBell />}
        {showUserChip && <UserChip />}
      </div>
      <style>{`
        .eclat-page-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
        }
        .eclat-page-header-custom-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          min-width: 0;
        }
        @media (max-width: 640px) {
          .eclat-page-header {
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 6px 8px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
          .eclat-page-header-home {
            display: none !important;
          }
          .eclat-page-header-custom-actions {
            grid-column: 1 / -1;
            grid-row: 2;
            justify-content: flex-end;
            overflow-x: auto;
            padding-top: 2px;
            scrollbar-width: none;
          }
          .eclat-page-header-custom-actions::-webkit-scrollbar {
            display: none;
          }
          .eclat-page-header-custom-actions:has(> .eclat-header-view-toggle:only-child) {
            display: none;
          }
          .eclat-page-header-left h1 {
            font-size: 14px !important;
          }
        }
      `}</style>
    </header>
  )
}
