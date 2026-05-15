// ─────────────────────────────────────────────────────────────────────
//  教科書 11セクションの定義（共有データ）
//  - SectionId 型
//  - SECTIONS 配列（アイコン・タイトル・サブ・グラデ）
//  - ManualHomeClient / SectionHome / SideNav / SectionDetail 等で共有
// ─────────────────────────────────────────────────────────────────────

export type SectionId =
  | 'before'
  | 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6' | 'step7'
  | 'topics44' | 'irokoi' | 'cast-type'

export type SectionInfo = {
  id: SectionId
  emoji: string
  title: string
  sub: string
  gradient: string
}

export const SECTIONS: SectionInfo[] = [
  { id: 'before', emoji: '🌸', title: '接客のまえに', sub: '心構え・大切にしたい4つの気持ち', gradient: 'linear-gradient(135deg, #FFE8EE 0%, #FFC8D4 100%)' },
  { id: 'step1', emoji: '☕', title: 'STEP1 基礎接客', sub: '違和感を与えず、安心して過ごしていただく', gradient: 'linear-gradient(135deg, #FFD8E2 0%, #F4B0BF 100%)' },
  { id: 'step2', emoji: '🥃', title: 'STEP2 ドリンク営業', sub: '応援したくなる空気を作る', gradient: 'linear-gradient(135deg, #FFD0DE 0%, #F2A5B6 100%)' },
  { id: 'step3', emoji: '📱', title: 'STEP3 連絡先交換', sub: '「興味があります」のサービス／登録名ルール', gradient: 'linear-gradient(135deg, #FFCCD5 0%, #F299AE 100%)' },
  { id: 'step4', emoji: '✨', title: 'STEP4 場内指名・延長', sub: '奪うものではなく、選ばれるもの', gradient: 'linear-gradient(135deg, #FFC8D4 0%, #ED93A8 100%)' },
  { id: 'step5', emoji: '🥂', title: 'STEP5 アフター', sub: '次回来店予定を作る場所', gradient: 'linear-gradient(135deg, #FFB8C8 0%, #E8879B 100%)' },
  { id: 'step6', emoji: '💌', title: 'STEP6 営業連絡', sub: '忘れられない接点', gradient: 'linear-gradient(135deg, #FFB0C2 0%, #E07088 100%)' },
  { id: 'step7', emoji: '🎯', title: 'STEP7 初リピート完成', sub: '6STEPをつなげて最大化', gradient: 'linear-gradient(135deg, #FFA8BD 0%, #D45060 100%)' },
  { id: 'topics44', emoji: '💬', title: '情報をとる 44項目', sub: '年代・職業・家族・趣味・好み etc.', gradient: 'linear-gradient(135deg, #FFE0E8 0%, #F4A5B8 100%)' },
  { id: 'irokoi', emoji: '💖', title: '色恋の鉄則', sub: '色恋の使い方・依存にしない予防策', gradient: 'linear-gradient(135deg, #FFC0CB 0%, #D45060 100%)' },
  { id: 'cast-type', emoji: '🎀', title: 'キャストタイプ別', sub: '清楚 / 甘え / お姉さん / クール', gradient: 'linear-gradient(135deg, #FFE4ED 0%, #E8879A 100%)' },
]
