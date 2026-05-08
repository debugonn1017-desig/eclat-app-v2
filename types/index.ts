export type CustomerRank = 'S' | 'A' | 'B' | 'C';

export type NominationRoute = 
  | '前店舗顧客' 
  | 'SNS指名' 
  | '紹介指名' 
  | '店舗外指名' 
  | '場内指名→本指名' 
  | 'フリー→本指名' 
  | 'ヘルプ→本指名' 
  | 'ロイヤル層→本指名' 
  | 'その他';

export type AgeGroup = '20代' | '30代' | '40代' | '50代以上';

export type Occupation = 
  | '経営者'
  | 'サラリーマン'
  | '接待役が多い'
  | '自営業'
  | '医療系'
  | '夜職'
  | '公務員・堅い職業'
  | '土業'
  | '不動産'
  | '金融'
  | '建設'
  | '飲食'
  | 'IT'
  | '美容'
  | '広告'
  | '士業'
  | 'その他';

export const REGIONS = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県',
  '沖縄県', '海外'
] as const;

export type Region = typeof REGIONS[number];

export type RelationshipType = 
  | '認知'
  | '場内'
  | '初指名'
  | 'リピート'
  | '安定'
  | '来店操作可能';

export type Phase =
  | '認知'
  | '場内'
  | '初指名'
  | 'リピート'
  | '安定'
  | '来店操作可能';

export type SpouseStatus = '有' | '無' | '不明';

export type FavoriteType = 
  | '可愛い系'
  | '清楚系'
  | '綺麗系'
  | 'ギャル系'
  | '大人系'
  | '癒し系'
  | '甘え系'
  | '強気系'
  | 'お姉さん系'
  | '素朴系'
  | '明るい子'
  | '落ち着いた子';

export type NGItem = string; // Tags are stored as comma-separated strings

export type SalesExpectation = '高' | '中' | '低';

export type Trend = '上昇' | '下降' | '停滞';

export type CastType = 
  | '清楚系'
  | '可愛い系'
  | '綺麗系'
  | 'ギャル系'
  | 'お姉さん系'
  | '癒し系'
  | 'サバサバ系'
  | '色恋営業型'
  | '友達営業型'
  | '聞き役タイプ'
  | '盛り上げ役'
  | 'S系'
  | 'M系';

export type NominationStatus = 'フリー' | '場内' | '本指名';

export interface Customer {
  id: string;
  customer_name: string;
  nickname: string;
  cast_name: string;
  cast_type: CastType;
  has_customer_staff: boolean;
  nomination_status: NominationStatus;
  age_group: AgeGroup;
  occupation: Occupation;
  region: Region;
  spouse_status: SpouseStatus;
  birthday: string;
  blood_type: string;
  hobby: string;
  nomination_route: NominationRoute;
  relationship_type: RelationshipType;
  phase: Phase;
  customer_rank: CustomerRank;
  sales_expectation: SalesExpectation;
  trend: Trend;
  favorite_type: FavoriteType;
  ng_items: NGItem;
  score: number; // 色恋関係値: 1軽いボディタッチ 2ゼロセンチ 3店外接客 4キスまで 5プライベート
  memo: string;
  last_contact_date: string;
  next_contact_date: string;
  first_visit_date: string;
  monthly_target_visits: number;
  monthly_target_sales: number;
  actual_visit_frequency: string;
  recommended_contact_frequency: string;
  sales_priority: string;
  sales_objective: string;
  recommended_tone: string;
  recommended_distance: string;
  recommended_direction: string;
  best_time_to_contact: string;
  ng_contact_time: string;
  ng_contact_day: string;
  warning_points: string;
  important_points: string;
  recommended_line_thanks: string;
  recommended_line_sales: string;
  recommended_line_visit: string;
  final_recommended_note: string;
  photo_url?: string | null;       // プロフィール写真 URL
  created_at?: string;
}

export interface CustomerVisit {
  id: string;
  customer_id: string;
  visit_date: string;
  visit_time?: string | null;       // HH:MM 形式（来店時刻、ヒートマップ用）
  extension_minutes?: number | null; // 延長分数（30分単位想定）
  amount_spent: number;
  party_size: number;
  has_douhan: boolean;
  has_after: boolean;
  is_planned: boolean;
  is_first_visit: boolean;
  table_number: string;
  companion_honshimei: string;
  companion_banai: string;
  memo: string;
  created_at: string;
}

export type ContactDirection = 'sent' | 'received';
export type ContactChannel = 'LINE' | '電話' | 'メール' | '来店中' | 'その他';

export interface CustomerContact {
  id: string;
  customer_id: string;
  contact_date: string;
  // 連絡の方向: 送った=sent / もらった=received
  direction: ContactDirection;
  // 連絡手段
  channel: ContactChannel;
  memo: string;
  created_at: string;
}

export interface CustomerBottle {
  id: string;
  customer_id: string;
  bottle_name: string;
  remaining_amount: string;
  notes: string;
  created_at: string;
}

export interface CustomerMemo {
  id: string;
  customer_id: string;
  memo_date: string;
  category: 'メモ' | '重要' | '来店時' | '連絡' | 'その他';
  content: string;
  created_at: string;
}

// ─── キャスト管理 ──────────────────────────────────────────────────

export type CastTier = 'A層' | 'B層' | '新人層' | '無類' | 'C層';

export const CAST_TIERS: CastTier[] = ['A層', 'B層', '新人層', '無類', 'C層'];

export interface CastProfile {
  id: string;
  role: 'admin' | 'cast';
  cast_name: string;
  display_name: string;
  cast_tier: CastTier | null;
  is_active: boolean;
  created_at: string;
}

export interface CastShift {
  id: string;
  cast_id: string;
  shift_date: string;
  status: '出勤' | '休み' | '希望出勤' | '希望休み' | '来客出勤' | '未定';
  memo: string;
  created_at: string;
}

export interface CastTierTarget {
  id: string;
  tier: CastTier;
  month: string | null;             // null = 全月共通の層デフォルト
  target_sales: number;
  target_nominations: number;
  target_new_customers: number;
  target_work_days: number;
  // 拡張項目 (2026-05-09 階層化 v2)
  target_honshimei?: number | null;
  target_banai?: number | null;
  target_local_customers?: number | null;
  target_remote_customers?: number | null;
  rank_targets?: RankTargets | null;
}

export interface CastTarget {
  id: string;
  cast_id: string;
  month: string;
  target_sales: number | null;
  target_nominations: number | null;
  target_new_customers: number | null;
  target_work_days: number | null;
  target_honshimei: number | null;
  target_banai: number | null;
  target_local_customers: number | null;
  target_remote_customers: number | null;
  rank_targets: RankTargets | null;
}

// ランク別目標
export interface RankTargetItem {
  sales: number;
  visits: number;
}
export type RankTargets = Record<CustomerRank, RankTargetItem>;

// 指名ステータス変更履歴
export interface NominationHistory {
  id: string;
  customer_id: string;
  cast_id: string;
  old_status: string | null;
  new_status: string;
  changed_at: string;
}

// お知らせ
export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: 'important' | 'normal';
  target_type: 'all' | 'individual';
  target_cast_id: string | null;       // 後方互換（単一）
  target_cast_ids: string[];           // 複数キャスト指定
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;          // 投稿者の user_id（profiles.id）
}

// キャストKPI（集計結果）
export interface CastKPI {
  monthlySales: number;
  targetSales: number;
  achievementRate: number;
  customerCount: number;
  banaCount: number;             // 場内指名の顧客数（プロフィール=場内 の総数・スナップショット）
  banaiMonthlyCount: number;     // 当月の場内来店件数（customer_visits + first_visit_date マッチ）
  honshimeiCount: number;        // 本指名の顧客数（全体）
  freeCount: number;             // フリーの顧客数
  rankCCount: number;            // ランクCの顧客数
  kokyakuCount: number;          // 顧客 = 本指名 + 福岡県 + ランクS/A/B
  kengaiCount: number;           // 県外顧客 = 本指名 + 福岡県以外
  workDays: number;
  visitGroups: number;           // 来店組数
  avgSpend: number;              // 客単価
  localCustomerCount: number;    // 県内（福岡）本指名顧客数
  remoteCustomerCount: number;   // 県外本指名顧客数
  rankBreakdown: Record<CustomerRank, { sales: number; visits: number }>;
  conversionCount: number;       // 当月の場内→本指名転換数
  douhanCount: number;           // 同伴回数
  afterCount: number;            // アフター回数
  totalVisitCount: number;       // 総来店回数
}

// ─── スタッフ権限管理（v5: 完全再設計） ────────────────────────────────
//   17 権限 × 8 カテゴリ。「カテゴリ.アクション」形式で統一。
//   ロールプリセットは廃止（個別 ON/OFF のみ）。
//   オーナー（is_owner=true）は全権限を自動付与（DB上は持たない、ランタイム判定）。

export type StaffPermission =
  // 👥 顧客系
  | '顧客.閲覧'
  | '顧客.編集'
  | '顧客.引継ぎ'
  // ⭐ キャスト系
  | 'キャスト.閲覧'
  | 'キャスト.アカウント管理'    // ID/PASS/退店処理のみ
  // 📊 KPI・成績系
  | 'KPI.閲覧'                    // 他キャストの売上・達成率を見る
  | 'KPI.詳細分析'                // /admin/cast-analysis 等。デフォルト OFF、慎重に付与
  // 📅 シフト系
  | 'シフト.閲覧'
  | 'シフト.管理'
  // 💰 売上系
  | '売上.閲覧'
  | '売上.入力'
  // 📢 お知らせ系
  | 'お知らせ.閲覧'
  | 'お知らせ.投稿'                // 自分の投稿
  | 'お知らせ.管理'                // 他人投稿の編集・削除
  // 📑 レポート系
  | 'レポート.閲覧'
  | 'レポート.出力'                // Excel/CSV ダウンロード
  // 🔔 通知系
  | '通知.送信'                    // カスタム通知の送信
  // ⚙️ 設定系（オーナー専用想定、他人に渡すこともできる）
  | 'ランク基準.設定'              // 顧客ランク自動判定の基準を編集
  | 'ノルマ.設定'                  // 層別/個別ノルマのデフォルトを編集

export const STAFF_PERMISSIONS: StaffPermission[] = [
  '顧客.閲覧',
  '顧客.編集',
  '顧客.引継ぎ',
  'キャスト.閲覧',
  'キャスト.アカウント管理',
  'KPI.閲覧',
  'KPI.詳細分析',
  'シフト.閲覧',
  'シフト.管理',
  '売上.閲覧',
  '売上.入力',
  'お知らせ.閲覧',
  'お知らせ.投稿',
  'お知らせ.管理',
  'レポート.閲覧',
  'レポート.出力',
  '通知.送信',
  'ランク基準.設定',
  'ノルマ.設定',
]

// 上位権限 → 下位権限の包含関係
//   例: 「お知らせ.管理」を持っていれば「お知らせ.投稿」「お知らせ.閲覧」も自動 OK
export const PERMISSION_INCLUDES: Record<string, string[]> = {
  '顧客.編集': ['顧客.閲覧'],
  'キャスト.アカウント管理': ['キャスト.閲覧'],
  'KPI.詳細分析': ['KPI.閲覧'],
  'シフト.管理': ['シフト.閲覧'],
  '売上.入力': ['売上.閲覧'],
  'お知らせ.管理': ['お知らせ.投稿', 'お知らせ.閲覧'],
  'お知らせ.投稿': ['お知らせ.閲覧'],
  'レポート.出力': ['レポート.閲覧'],
}

// ─── 警告ダイアログ対象の権限 ───────────────────────────────────
//   ON にすると影響範囲が大きいので、UI 側で確認ダイアログを出す。
export const SENSITIVE_PERMISSIONS: StaffPermission[] = [
  'KPI.詳細分析',
  'キャスト.アカウント管理',
  'お知らせ.管理',
  '通知.送信',
  'ランク基準.設定',
  'ノルマ.設定',
]

// ─── カテゴリ別グループ定義（UI 表示用） ────────────────────────
export const PERMISSION_GROUPS: Array<{
  category: string
  emoji: string
  permissions: StaffPermission[]
}> = [
  { category: '顧客', emoji: '👥', permissions: ['顧客.閲覧', '顧客.編集', '顧客.引継ぎ'] },
  { category: 'キャスト', emoji: '⭐', permissions: ['キャスト.閲覧', 'キャスト.アカウント管理'] },
  { category: 'KPI・成績', emoji: '📊', permissions: ['KPI.閲覧', 'KPI.詳細分析'] },
  { category: 'シフト', emoji: '📅', permissions: ['シフト.閲覧', 'シフト.管理'] },
  { category: '売上', emoji: '💰', permissions: ['売上.閲覧', '売上.入力'] },
  { category: 'お知らせ', emoji: '📢', permissions: ['お知らせ.閲覧', 'お知らせ.投稿', 'お知らせ.管理'] },
  { category: 'レポート', emoji: '📑', permissions: ['レポート.閲覧', 'レポート.出力'] },
  { category: '通知', emoji: '🔔', permissions: ['通知.送信'] },
  { category: '設定', emoji: '⚙️', permissions: ['ランク基準.設定', 'ノルマ.設定'] },
]

/**
 * 上位権限の包含を考慮した権限チェック。
 *   例: hasPermissionWithInclude(perms, 'お知らせ.閲覧') は
 *       'お知らせ.閲覧' か 'お知らせ.管理' のどちらか持っていれば true。
 */
export function hasPermissionWithInclude(
  perms: Record<string, boolean>,
  required: StaffPermission
): boolean {
  if (perms[required] === true) return true
  // 上位権限が required を含むかチェック
  for (const [parent, children] of Object.entries(PERMISSION_INCLUDES)) {
    if (perms[parent] === true && children.includes(required)) return true
  }
  return false
}

export interface StaffMember {
  id: string;
  display_name: string;
  email?: string;
  is_owner: boolean;
  is_active: boolean;
  created_at: string;
  permissions: Record<StaffPermission, boolean>;
}

// ═══════════════════════════════════════════════════════════════════
//  顧客ランク自動判定（rank_criteria テーブル + 計算結果）
// ═══════════════════════════════════════════════════════════════════

/** ランク基準の適用範囲 */
export type RankCriteriaScope =
  | { type: 'default'; id: null }
  | { type: 'tier'; id: string }     // id = 層名 (例: 'A層')
  | { type: 'cast'; id: string }     // id = cast id

/** rank_criteria テーブルの 1 行を表す型 */
export interface RankCriteria {
  id: string

  // 適用範囲（階層化 v2、2026-05-09〜）
  scope_type: 'default' | 'tier' | 'cast'
  scope_id: string | null

  // 月次売上ランク
  monthly_enabled: boolean
  monthly_s_threshold: number       // 円
  monthly_a_threshold: number
  monthly_b_threshold: number
  monthly_period_months: number     // 直近何ヶ月の月平均で算出するか

  // 累計売上ランク
  cumulative_enabled: boolean
  cumulative_s_threshold: number
  cumulative_a_threshold: number
  cumulative_b_threshold: number

  // 合算方針
  combine_strategy: 'higher' | 'lower' | 'monthly_first'

  // 補正項目
  frequency_enabled: boolean
  frequency_high_threshold: number  // 月平均何回以上で +1
  frequency_low_threshold: number   // 月平均何回未満で -1

  douhan_rate_enabled: boolean
  douhan_rate_threshold: number     // % 値（30 = 30%）

  trend_enabled: boolean
  trend_up_multiplier: number       // 1.5 倍以上で +1
  trend_down_multiplier: number     // 0.5 倍以下で -1

  unit_price_enabled: boolean
  unit_price_threshold: number      // 1回あたり円

  tenure_enabled: boolean
  tenure_threshold_months: number

  after_rate_enabled: boolean
  after_rate_threshold: number      // %

  // 非アクティブ判定
  inactive_enabled: boolean
  inactive_warning_days: number     // X 日来店なしで -1
  inactive_force_c_days: number     // X 日来店なしで強制 C

  // 補正の上限
  max_adjustment_steps: number      // ±N 段階まで

  created_at?: string
  updated_at?: string
}

/** ランク判定の理由（モーダルで内訳を見せるため）*/
export interface RankReason {
  /** 適用ステップ: ベース計算・補正・上限・非アクティブ */
  kind: 'base' | 'adjustment' | 'inactive' | 'cap'
  /** 表示するラベル（例: "月次B"、"+1 同伴率42%"） */
  label: string
  /** ランク変動量（補正用、ベース時は0） */
  delta: number
}

/** ランク計算の結果 */
export interface RankCalculationResult {
  /** 推奨ランク（最終結果） */
  recommended: CustomerRank
  /** ベースランク（補正前） */
  base: CustomerRank
  /** 補正の合計値（+/-） */
  totalAdjustment: number
  /** 適用された全ステップの一覧（理由表示用） */
  reasons: RankReason[]
  /** 計算に使った中間値（モーダルで参考表示用） */
  metrics: {
    totalSpent: number          // 累計売上
    monthlyAverage: number      // 直近 N ヶ月の月平均
    visitCount3m: number        // 直近3ヶ月の来店回数
    visitCountTotal: number     // 累計来店回数
    douhanRate: number          // % 値
    afterRate: number           // % 値
    daysSinceLastVisit: number | null  // 最終来店から今日までの日数
    tenureMonths: number        // 初回来店から今日までの月数
    trendRatio: number | null   // 直近3ヶ月 / その前3ヶ月の月平均比
  }
}

// ─── 来店予定 ──────────────────────────────────────────────────────────

export type PlannedVisitStatus = '予定' | '来店済み' | 'キャンセル';

export interface PlannedVisit {
  id: number;
  customer_id: number;
  cast_id: string;
  planned_date: string;
  planned_time: string | null;
  party_size: number | null;
  has_douhan: boolean | null;
  memo: string | null;
  status: PlannedVisitStatus;
  visit_id: number | null;
  created_at: string;
  updated_at: string;
  // joined fields
  customer_name?: string;
  cast_name?: string;
}

// ─── 場内延長売上 ────────────────────────────────────────────────────
//   顧客に紐づかない、キャストの場内延長による売上記録。
//   customer_visits とは独立して管理し、KPIの「顧客数 / 客単価」には
//   カウントしないが、「月次合計売上」には含める。
export interface CastExtensionSale {
  id: string;
  cast_id: string;
  sale_date: string;       // 'YYYY-MM-DD'
  start_time?: string | null;        // HH:MM 形式
  extension_minutes?: number | null; // 延長分数
  amount_spent: number;
  party_size: number;
  table_number: string;
  has_douhan: boolean;
  has_after: boolean;
  companion_honshimei: string;
  companion_banai: string;
  memo: string;
  created_at: string;
  updated_at: string;
}

export interface DiagnosisResult {
  sales_priority: string;
  sales_objective: string;
  recommended_tone: string;
  recommended_distance: string;
  recommended_contact_frequency: string;
  best_time_to_contact: string;
  ng_contact_time: string;
  ng_contact_day: string;
  warning_points: string;
  important_points: string;
  recommended_line_thanks: string;
  recommended_line_sales: string;
  recommended_line_visit: string;
  final_recommended_note: string;
}
