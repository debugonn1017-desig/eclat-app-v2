'use client'

// ─────────────────────────────────────────────────────────────────────
//  ManualHomeClient – COSTES キャスト教科書 Native 版 v0.2 復活版
//  React error #300 対応：useManualDataのモジュールキャッシュを撤去後の安全版
//  - BottomNav / NotificationBell / UserChip は一時撤去（後日確認しつつ復活）
//  - useViewMode も一時撤去（モバイル/PC自動切替なし、レスポンシブCSSで対応）
//  - useSearchParams + ?legacy=1 も撤去
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useManualData } from '@/hooks/useManualData'
import ManualSectionView from '@/components/ManualSectionView'

type SectionId =
  | 'before'
  | 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6' | 'step7'
  | 'topics44' | 'irokoi' | 'cast-type'

type Section = {
  id: SectionId
  emoji: string
  title: string
  sub: string
  gradient: string
}

const SECTIONS: Section[] = [
  { id: 'before', emoji: '🌸', title: '接客のまえに', sub: '心構え・大切にしたい4つの気持ち', gradient: 'linear-gradient(135deg, #FFE8EE 0%, #FFC8D4 100%)' },
  { id: 'step1', emoji: '☕', title: 'STEP1 基礎接客', sub: '違和感を与えず、安心して過ごしていただく', gradient: 'linear-gradient(135deg, #FFD8E2 0%, #F4B0BF 100%)' },
  { id: 'step2', emoji: '🥃', title: 'STEP2 ドリンク営業', sub: '応援したくなる空気を作る', gradient: 'linear-gradient(135deg, #FFD0DE 0%, #F2A5B6 100%)' },
  { id: 'step3', emoji: '📱', title: 'STEP3 連絡先交換', sub: '「興味があります」のサービス／登録名ルール 🩷🧡💙🤍', gradient: 'linear-gradient(135deg, #FFCCD5 0%, #F299AE 100%)' },
  { id: 'step4', emoji: '✨', title: 'STEP4 場内指名・延長', sub: '奪うものではなく、選ばれるもの', gradient: 'linear-gradient(135deg, #FFC8D4 0%, #ED93A8 100%)' },
  { id: 'step5', emoji: '🥂', title: 'STEP5 アフター', sub: '次回来店予定を作る場所', gradient: 'linear-gradient(135deg, #FFB8C8 0%, #E8879B 100%)' },
  { id: 'step6', emoji: '💌', title: 'STEP6 営業連絡', sub: '忘れられない接点（登録名ルールに従って運用）', gradient: 'linear-gradient(135deg, #FFB0C2 0%, #E07088 100%)' },
  { id: 'step7', emoji: '🎯', title: 'STEP7 初リピート完成', sub: '6STEPをつなげて最大化', gradient: 'linear-gradient(135deg, #FFA8BD 0%, #D45060 100%)' },
  { id: 'topics44', emoji: '💬', title: '情報をとる 44項目', sub: '年代・職業・家族・趣味・好み etc. の引き出し方', gradient: 'linear-gradient(135deg, #FFE0E8 0%, #F4A5B8 100%)' },
  { id: 'irokoi', emoji: '💖', title: '色恋の鉄則', sub: '色恋の使い方・依存にしない予防策', gradient: 'linear-gradient(135deg, #FFC0CB 0%, #D45060 100%)' },
  { id: 'cast-type', emoji: '🎀', title: 'キャストタイプ別', sub: '清楚 / 甘え / お姉さん / クール…自分らしいアレンジ', gradient: 'linear-gradient(135deg, #FFE4ED 0%, #E8879A 100%)' },
]

export default function ManualHomeClient(_props: { isAdmin: boolean }) {
  const [openSection, setOpenSection] = useState<SectionId | null>(null)
  const { data: manualData, loading: manualLoading } = useManualData()

  // セクション切替時、本文上端へスクロール
  useEffect(() => {
    if (openSection && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [openSection])

  return (
    <div style={{
      minHeight: '100vh',
      padding: '20px 16px 60px',
      background: 'linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 50%, #FFF8FA 100%)',
      fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20, flexWrap: 'wrap', gap: 8,
        }}>
          <div>
            <h1 style={{
              fontSize: 22, fontWeight: 700, margin: 0,
              background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}>
              📖 COSTES キャスト教科書
            </h1>
            <p style={{ fontSize: 11, color: '#6B5060', margin: '4px 0 0', letterSpacing: '0.05em' }}>
              v0.2 BETA
            </p>
          </div>
          <a
            href="/home"
            style={{
              color: '#E8879A', fontSize: 12, fontWeight: 600,
              textDecoration: 'none', padding: '6px 10px',
            }}
          >
            ← ホーム
          </a>
        </div>

        {/* セクション本文 */}
        {openSection && manualData && (
          <ManualSectionView
            sectionId={openSection}
            data={manualData}
            onBack={() => setOpenSection(null)}
            isPC={false}
            onJumpSection={(id) => setOpenSection(id as SectionId)}
          />
        )}
        {openSection && manualLoading && (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #F0DDE2',
            borderRadius: 16,
            padding: '40px 20px',
            textAlign: 'center',
            color: '#B0909A',
            fontSize: 12,
            marginBottom: 20,
          }}>
            教科書データを読み込み中…
          </div>
        )}

        {/* セクションカードグリッド */}
        <div style={{
          fontSize: 10, letterSpacing: '0.28em',
          color: '#E8879A', fontWeight: 700,
          marginBottom: 10,
        }}>
          {openSection ? '他のチャプター' : 'LEARN BY CHAPTER'}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenSection(s.id)}
              style={{
                background: s.gradient,
                border: 'none',
                borderRadius: 18,
                padding: '16px 14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                color: '#FFF',
                minHeight: 110,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                boxShadow: '0 8px 22px rgba(232,135,154,0.22)',
              }}
            >
              <div style={{ fontSize: 28 }}>{s.emoji}</div>
              <div>
                <div style={{
                  fontSize: 13, fontWeight: 700, lineHeight: 1.3,
                  textShadow: '0 1px 2px rgba(120,40,60,0.18)',
                }}>{s.title}</div>
                <div style={{
                  fontSize: 10, marginTop: 4, lineHeight: 1.4,
                  color: 'rgba(255,255,255,0.95)',
                  textShadow: '0 1px 2px rgba(120,40,60,0.18)',
                }}>{s.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
