// ─── 桜・お守り・やわらか リブランド (2026-05-14) ──────────────────
// 全ページで統一して使用
export const C = {
  // ─── 背景 ───
  bg: '#FFF9FA',         // 桜白
  bgPale: '#FFFAFC',     // 淡桜白
  bgLight: '#FFF8FA',    // 桜薄
  // ─── テキスト ───
  dark: '#3D2D38',       // テキストは継承 (読みやすさ優先)
  dark2: '#6B5060',      // サブテキスト
  // ─── ピンク系 ───
  pink: '#E8879A',       // 桜ピンク (やや明度上げ)
  pinkLight: '#F4B0BF',  // 桜淡
  pinkDeep: '#D45060',   // 濃い桜 (= danger と同色)
  pinkMuted: '#B0909A',  // くすみ
  pinkBg: '#FFE8EE',     // ピンク背景
  pinkHover: '#ED93B1',  // ホバー時ボーダー
  // ─── 縁取り・タグ ───
  border: '#F0DDE2',     // 桜縁取り (少し赤み)
  tagBg: '#FCF1F4',      // 桜タグ
  tagBg2: '#FBEAF0',     // 桜タグ（濃いめ）
  tagText: '#9A8890',    // タグテキスト
  // ─── ニュートラル ───
  white: '#FFFFFF',
  miniBg: '#F9F6F7',     // ミニ指標セル背景
  rankBadge: '#F5F0F2',  // 通常ランクバッジ
  // ─── 状態色 ───
  danger: '#D45060',     // エラー
  dangerLight: '#E87080',
  dangerBg: '#FFE8EC',
  dangerBorder: '#FFC0CB',
  // ─── アクセント ───
  gold: '#C0A050',       // ゴールド (基準カード等)
  goldBg: '#FAF5E8',
  goldText: '#8C6F3A',
  beige: '#B89968',      // 教科書「行動編」タブ
  beigeLight: '#D4B58A',
  beigeBg: '#FAF2E4',
  // ─── ヘッダー ───
  headerBg: 'linear-gradient(160deg, #FFF1F4 0%, #FFFFFF 100%)',
  headerText: '#3D2D38',
  // ─── 状態色 (v0.3.50-B 追加) ───
  //   「良い/注意/警戒」を示す情報色。淡ピンク階調に埋もれないためのトークン。
  //   無印 = 淡背景上のテキスト/枠線用、*Bg = 淡背景、*Deep = 塗りつぶし背景 (白文字前提)
  success: '#3D8B5F',      // 良い状態 (経過日数30日以内 等)
  successBg: '#E4F5EC',
  successDeep: '#0F6E56',  // トースト成功の塗り背景
  warning: '#C9A53A',      // 軽い注意 (31-60日 等)
  warningBg: '#FCF4D9',
  warningDeep: '#B47B12',  // トースト警告の塗り背景
  caution: '#D67A2C',      // 強い注意 (61-90日 等)
  cautionBg: '#FCE7D3',
  dangerDeep: '#B3322B',   // トーストエラーの塗り背景
  // ─── タグ・チップ強調 (v0.3.50-B 追加) ───
  tagTextStrong: '#72243E', // 濃ピンクチップ (tagBg2) 上の強調テキスト
}

// ログインページ用（やさしいダークモード）
export const CLogin = {
  bg: '#3D2838',         // やわらかいダーク
  dark: '#2A1A26',
  panel: '#4E3548',
  pink: '#F2839B',
  pinkLight: '#F9B0C1',
  pinkMuted: '#D4A0AE',
  border: 'rgba(242, 131, 155, 0.3)',
  text: '#FFF5F7',
  textMuted: '#D4A0AE',
  danger: '#E06070',
}
