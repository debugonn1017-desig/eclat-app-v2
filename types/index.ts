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
  | 'サラリーマン'
  | '経営者'
  | '自営業'
  | '医療系'
  | '夜職'
  | '建設系'
  | 'IT系'
  | '公務員'
  | '不動産'
  | '金融'
  | 'その他';

export type Region = '福岡県' | '県外';

export type RelationshipType = 
  | '新規'
  | '友人'
  | '恋愛寄り'
  | '常連'
  | '様子見'
  | 'その他';

export type SpouseStatus = '有' | '無' | '不明';

export type PreferenceType = 
  | '可愛い系'
  | '綺麗系'
  | '落ち着き系'
  | '明るい系'
  | '癒し系'
  | '色気系'
  | 'その他';

export type Phase = 
  | '認知'
  | '興味'
  | '初回来店'
  | '関係構築'
  | '安定'
  | '来店誘致'
  | 'リピート'
  | 'その他';

export type NGType = 
  | 'なし' 
  | '連絡遅い' 
  | '金銭感覚ズレ' 
  | '束縛気質' 
  | '夜NG' 
  | '休日NG' 
  | '既婚配慮必要' 
  | '重い営業NG' 
  | '下ネタNG' 
  | 'その他'
  | '詰めNG'
  | '比較NG'
  | '上から目線NG'
  | 'プライド高い'
  | 'いじり注意'
  | '重い話NG'
  | '価格提示NG'
  | '売上圧NG'
  | '指名強要NG'
  | '同伴強要NG'
  | '返信催促NG'
  | '長文NG'
  | '高頻度NG'
  | '電話NG'
  | '色恋NG'
  | '嫉妬NG'
  | '依存NG'
  | '深夜NG'
  | '日中NG'
  | '即誘いNG'
  | '営業感NG'
  | '他キャストNG';

export type Trend = '上昇' | '下降' | '停滞';
export type SalesExpectation = '高' | '中' | '低';
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
  cast_type: CastType;
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
  trend: Trend;
  sales_expectation: SalesExpectation;
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
  dangerAlert: string;
  coreStrategy: string;
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
