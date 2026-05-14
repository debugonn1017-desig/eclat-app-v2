'use client'

// ─────────────────────────────────────────────────────────────────────
//  ManualHomeClient – 最小デバッグ版（2026-05-15）
//  React error #300 の原因切り分けのため、いったん徹底的に簡素化。
//  - useManualData / useViewMode / BottomNav / NotificationBell すべて撤去
//  - 静的なセクションカード11個だけ表示
//  - これで /manual が開ければ、原因は撤去したどれか
//  - 開けなければ、もっと深い問題（layout, page, getCurrentProfile, etc.）
// ─────────────────────────────────────────────────────────────────────

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
  return (
    <div style={{
      minHeight: '100vh',
      padding: '20px 16px 96px',
      background: 'linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 50%, #FFF8FA 100%)',
      fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
      }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 8,
          background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}>
          📖 COSTES キャスト教科書
        </h1>
        <p style={{ fontSize: 12, color: '#6B5060', marginBottom: 24 }}>
          v0.1 BETA — minimal mode
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}>
          {SECTIONS.map((s) => (
            <div
              key={s.id}
              style={{
                background: s.gradient,
                borderRadius: 18,
                padding: '16px 14px',
                color: '#FFF',
                minHeight: 110,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                boxShadow: '0 8px 22px rgba(232,135,154,0.22)',
              }}
            >
              <div style={{ fontSize: 28 }}>{s.emoji}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{s.title}</div>
                <div style={{ fontSize: 10, marginTop: 4, lineHeight: 1.4, opacity: 0.95 }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 32,
          padding: '14px 16px',
          background: '#FFF0F4',
          borderRadius: 12,
          fontSize: 11,
          color: '#8E4A5C',
          lineHeight: 1.6,
        }}>
          🛠 デバッグ版で表示中。原因切り分けが完了したら通常版に戻します。
        </div>
      </div>
    </div>
  )
}
