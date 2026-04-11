export type CustomerRank = 'S' | 'A' | 'B' | 'C';
export type NominationRoute = 
  | '前店舗顧客' 
  | 'SNS指名' 
  | '紹介指名' 
  | '店舗外指名' 
  | 'J→本指名' 
  | 'H→本指名' 
  | 'R→本指名' 
  | 'F→本指名' 
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
  | 'その他';

export type Region = '福岡県' | '県外';

export type RelationshipType = '新規' | '常連' | '疎遠' | '友人' | '仕事関係';

export type SpouseStatus = '有' | '無';

export type PreferenceType = 
  | '可愛い系' 
  | '綺麗系' 
  | '大人っぽい' 
  | '素人っぽい' 
  | '距離感近い' 
  | '誠実丁寧' 
  | '甘えてほしい' 
  | '自立系' 
  | '色恋系' 
  | '落ち着き系';

export type Phase = '認知' | '接触' | '関係構築' | '安定' | '囲い込み';

export type NGType = 
  | 'なし' 
  | '遅刻' 
  | 'ドタキャン' 
  | '連絡遅い' 
  | '営業弱い' 
  | '距離感ミス' 
  | '金銭感覚ズレ' 
  | '対応雑' 
  | 'その他';

export type Trend = '上昇' | '下降' | '停滞';
export type SalesExpectation = '高' | '中' | '低';
export type CastType = '清楚・可愛い系' | '綺麗・お姉さん系' | 'ノリ・友達系' | '色恋・小悪魔系';

export interface ContactHistory {
  id: string;
  date: string;
  type: '挨拶' | '標準' | '来店誘致' | 'その他';
  message: string;
  memo: string;
}

export interface Customer {
  id: string;
  customer_name: string;
  nickname: string;
  phone_or_line: string;
  cast_name: string;
  cast_type: CastType;         // キャストタイプ
  customer_rank: CustomerRank;
  nomination_route: NominationRoute;
  age_group: AgeGroup;
  occupation: Occupation;
  region: Region;
  relationship_type: RelationshipType;
  spouse_status: SpouseStatus;
  preference_type: PreferenceType;
  phase: Phase;
  romance_level: number;
  trend: Trend;                // 温度変化
  sales_expectation: SalesExpectation; // 売上期待値
  ng_type: NGType;
  memo: string;
  last_contact_date?: string;
  next_contact_date?: string;
  history: ContactHistory[];
  created_at: string;
  updated_at: string;
}

export interface DiagnosisResult {
  priority: '高' | '中' | '低';
  priorityReason: string;
  strategyPolicy: string;
  specificStrategy: string;
  dangerAlert: string;         // 危険アラート
  coreStrategy: string;        // 最重要攻略ポイント (一行)
  ngAction: string;
  finalAction: string;
  objective: string;
  tone: string;
  distance: string;
  frequency: string;
  bestTime: string;
  ngTime: string;
  ngDay: string;
  caution: string;
  points: string[];
  recommendedMemo: string;
  messages: {
    light: string;
    standard: string;
    aggressive: string;
  };
}
