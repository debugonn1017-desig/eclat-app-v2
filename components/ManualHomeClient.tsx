'use client'

// ─────────────────────────────────────────────────────────────────────
//  ManualHomeClient – COSTES キャスト教科書 v0.2.7
//  ルーター役に専念。ホーム / セクション詳細 / テーマ詳細 / 項目詳細 を
//  state で切替える。
//
//  ★ React error #300 再発防止のため厳守：
//   - useMemo 使用禁止
//   - useEffect は hydration安全のためのみ
//   - useState の初期値は静的リテラルのみ
//   - <details>/<summary> 使用禁止
//   - useSearchParams / useViewMode / Suspense 使用禁止
//   - PC/モバイル切替は CSS のみ（@media (min-width: 768px)）
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useManualData } from '@/hooks/useManualData'
import SectionHome from '@/components/manual/SectionHome'
import SideNav from '@/components/manual/SideNav'
import MobileBottomNav from '@/components/manual/MobileBottomNav'
import ThemeView from '@/components/manual/ThemeView'
import SectionDetail from '@/components/manual/SectionDetail'
import ManualItemView from '@/components/manual/ManualItemView'
import NotificationBell from '@/components/NotificationBell'
import UserChip from '@/components/UserChip'
import type { SectionId } from '@/components/manual/sections'

const MANUAL_STYLES = `
.manual-root {
  min-height: 100vh;
  padding-bottom: 80px;
  background: linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 50%, #FFF8FA 100%);
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif;
  color: #3D2D38;
}

.manual-header {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(160deg, #FFF1F4 0%, #FFFFFF 100%);
  border-bottom: 1px solid #F0DDE2;
  backdrop-filter: saturate(140%) blur(6px);
  -webkit-backdrop-filter: saturate(140%) blur(6px);
}

.manual-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.manual-header-back {
  color: #E8879A;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  padding: 6px 10px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.manual-header-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.02em;
}

.manual-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.manual-grid {
  display: grid;
  grid-template-columns: 1fr;
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px;
  gap: 20px;
  box-sizing: border-box;
}

.manual-sidenav {
  display: none;
}

.manual-main {
  min-width: 0;
}

.manual-error {
  background: #FFE8EC;
  border: 1px solid #FFC0CB;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 16px;
  font-size: 12px;
  color: #D45060;
}

.manual-mobilenav-wrap {
  display: block;
}

@media (min-width: 768px) {
  .manual-header-title {
    font-size: 17px;
  }
  .manual-grid {
    grid-template-columns: 240px 1fr;
    padding: 24px;
    gap: 28px;
  }
  .manual-sidenav {
    display: block;
    position: sticky;
    top: 80px;
    align-self: start;
  }
  .manual-mobilenav-wrap {
    display: none;
  }
  .manual-root {
    padding-bottom: 0;
  }
}
`

export default function ManualHomeClient(_props: { isAdmin: boolean }) {
  const [openSection, setOpenSection] = useState<SectionId | null>(null)
  const [openThemeKey, setOpenThemeKey] = useState<string | null>(null)
  const [openManualId, setOpenManualId] = useState<string | null>(null)

  const { data: manualData, loading: manualLoading, error: manualError } = useManualData()

  const goHome = () => {
    setOpenSection(null)
    setOpenThemeKey(null)
    setOpenManualId(null)
  }

  const handleNavigateSection = (id: SectionId) => {
    setOpenManualId(null)
    setOpenThemeKey(null)
    setOpenSection(id)
  }

  // 現在表示中ビューを純粋計算で決定（useMemo は禁止なので毎レンダ計算）
  const currentItem =
    openManualId && manualData
      ? manualData.manuals?.find((m) => m.id === openManualId)
      : undefined

  const currentTheme =
    openThemeKey && manualData
      ? manualData.themes?.find((t) => t.key === openThemeKey)
      : undefined

  return (
    <div className="manual-root">
      <style dangerouslySetInnerHTML={{ __html: MANUAL_STYLES }} />

      {/* ───── ヘッダー ───── */}
      <header className="manual-header">
        <div className="manual-header-left">
          <a href="/home" className="manual-header-back">
            ← ホーム
          </a>
          <h1 className="manual-header-title">📖 COSTES キャスト教科書 v0.2.11</h1>
        </div>
        <div className="manual-header-right">
          <NotificationBell />
          <UserChip />
        </div>
      </header>

      {/* ───── 本体グリッド ───── */}
      <div className="manual-grid">
        {/* PC専用サイドナビ */}
        <aside className="manual-sidenav">
          <SideNav activeSection={openSection} onNavigate={handleNavigateSection} />
        </aside>

        {/* メインエリア */}
        <main className="manual-main">
          {manualError ? (
            <div className="manual-error">
              教科書データを読み込めませんでした: {manualError}
            </div>
          ) : null}

          {openManualId && currentItem ? (
            <ManualItemView item={currentItem} onBack={() => setOpenManualId(null)} />
          ) : openManualId && manualLoading ? (
            <LoadingPanel />
          ) : openManualId ? (
            <div className="manual-error">項目が見つかりません</div>
          ) : openThemeKey && manualData && currentTheme ? (
            <ThemeView
              theme={currentTheme}
              data={manualData}
              onBack={() => setOpenThemeKey(null)}
            />
          ) : openThemeKey && manualLoading ? (
            <LoadingPanel />
          ) : openThemeKey ? (
            <div className="manual-error">テーマが見つかりません</div>
          ) : openSection && manualData ? (
            <SectionDetail
              sectionId={openSection}
              data={manualData}
              onBack={goHome}
              onOpenTheme={setOpenThemeKey}
              onOpenManual={setOpenManualId}
            />
          ) : openSection ? (
            <LoadingPanel />
          ) : (
            <SectionHome onOpenSection={setOpenSection} />
          )}
        </main>
      </div>

      {/* ───── モバイル専用ボトムナビ ───── */}
      <nav className="manual-mobilenav-wrap" aria-label="モバイルナビ">
        <MobileBottomNav onHome={goHome} />
      </nav>
    </div>
  )
}

// データ読み込み中の桜色プレースホルダ
function LoadingPanel() {
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #F0DDE2',
      borderRadius: 18,
      padding: '40px 20px',
      textAlign: 'center',
      color: '#B0909A',
      fontSize: 12,
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>🌸</div>
      教科書データを読み込み中…
    </div>
  )
}
