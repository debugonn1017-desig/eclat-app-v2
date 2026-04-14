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
  | '興味付け'
  | '接点維持'
  | '距離を縮める'
  | '来店を増やす'
  | '固定化する';

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

export interface Customer {
  id: string;
  customer_name: string;
  nickname: string;
  cast_name: string;
  cast_type: CastType;
  age_group: AgeGroup;
  occupation: Occupation;
  region: Region;
  spouse_status: SpouseStatus;
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
  score: number; // 色恋度: 1, 2, 3, 4, 5
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
  memo: string;
  created_at: string;
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
