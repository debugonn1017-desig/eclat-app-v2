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

export type Region = '福岡県' | '県外';

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

export type SpouseStatus = '有' | '無';

export type FavoriteType = 
  | '可愛い系'
  | '綺麗系'
  | '大人っぽい'
  | '素人っぽい'
  | '距離感近い'
  | '誠実丁寧'
  | '甘えてほしい'
  | '自立系'
  | '色恋系'
  | '落ち着き系'
  | '妹系'
  | '姉系'
  | '癒し系'
  | '元気系'
  | '上品系'
  | 'ギャル系'
  | '清楚系'
  | 'サバサバ系'
  | '包容力ある系'
  | 'ツンデレ系';

export type NGItem = 
  | 'なし'
  | '遅刻'
  | 'ドタキャン'
  | '連絡遅い'
  | '営業弱い'
  | '距離感ミス'
  | '金銭感覚ズレ'
  | '対応雑'
  | 'しつこい営業NG'
  | '同伴NG'
  | 'アフターNG'
  | 'ボディタッチNG'
  | '煽りすぎNG'
  | '他のお客様との指名被りNG'
  | '嫉妬煽りNG'
  | '急な重い話NG'
  | '深夜連絡NG'
  | '日曜連絡NG'
  | 'その他';

export type SalesExpectation = '高' | '中' | '低';

export type Trend = '上昇' | '下降' | '停滞';

export type CastType = 
  | '清楚系'
  | '可愛い系'
  | '綺麗系'
  | '癒し系'
  | 'お姉さん系'
  | '色っぽい系'
  | 'ノリ良い系'
  | 'ギャル系'
  | 'その他';

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
  recommended_frequency: string;
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
  recommended_frequency: string;
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
