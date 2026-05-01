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
  created_at?: string;
}

export interface CustomerVisit {
  id: string;
  customer_id: string;
  visit_date: string;
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

export interface CustomerContact {
  id: string;
  customer_id: string;
  contact_date: string;
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
  month: string;
  target_sales: number;
  target_nominations: number;
  target_new_customers: number;
  target_work_days: number;
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

// ─── スタッフ権限管理 ──────────────────────────────────────────────────

export type StaffPermission =
  | '顧客編集'
  | 'キャスト管理'
  | 'お知らせ管理'
  | 'レポート閲覧'
  | '顧客引継ぎ'
  | '売上入力'
  | 'シフト管理';

export const STAFF_PERMISSIONS: StaffPermission[] = [
  '顧客編集',
  'キャスト管理',
  'お知らせ管理',
  'レポート閲覧',
  '顧客引継ぎ',
  '売上入力',
  'シフト管理',
];

export interface StaffMember {
  id: string;
  display_name: string;
  email?: string;
  is_owner: boolean;
  is_active: boolean;
  created_at: string;
  permissions: Record<StaffPermission, boolean>;
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
