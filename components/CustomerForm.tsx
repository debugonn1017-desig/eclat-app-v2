'use client';

import React from 'react';
import { 
  Customer, 
  CustomerRank, 
  NominationRoute, 
  Occupation, 
  RelationshipType, 
  SpouseStatus,
  PreferenceType,
  Phase, 
  NGType,
  Trend,
  SalesExpectation,
  CastType
} from '@/types';

interface CustomerFormProps {
  initialData?: Partial<Customer>;
  onSubmit: (data: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'history'>) => void;
  onCancel: () => void;
}

const ranks: CustomerRank[] = ['S', 'A', 'B', 'C'];
const routes: NominationRoute[] = ['前店舗顧客', 'SNS指名', '紹介指名', '店舗外指名', 'J→本指名', 'H→本指名', 'R→本指名', 'F→本指名', 'その他'];
const occupations: Occupation[] = ['サラリーマン', '経営者', '自営業', '医療系', '夜職', '建設系', 'IT系', '公務員', '不動産', '金融', 'その他'];
const relationships: RelationshipType[] = ['新規', '友人', '恋愛寄り', '常連', '様子見', 'その他'];
const spouseStatuses: SpouseStatus[] = ['有', '無', '不明'];
const preferenceTypes: PreferenceType[] = ['可愛い系', '綺麗系', '落ち着き系', '明るい系', '癒し系', '色気系', 'その他'];
const phases: Phase[] = ['認知', '興味', '初回来店', '関係構築', '安定', '来店誘致', 'リピート', 'その他'];
const ngTypes: NGType[] = [
  'なし', '連絡遅い', '金銭感覚ズレ', '束縛気質', '夜NG', '休日NG', '既婚配慮必要', '重い営業NG', '下ネタNG', 'その他',
  '詰めNG', '比較NG', '上から目線NG', 'プライド高い', 'いじり注意', '重い話NG',
  '価格提示NG', '売上圧NG', '指名強要NG', '同伴強要NG',
  '返信催促NG', '長文NG', '高頻度NG', '電話NG',
  '色恋NG', '嫉妬NG', '依存NG',
  '深夜NG', '日中NG',
  '即誘いNG', '営業感NG', '他キャストNG'
];
const trends: Trend[] = ['上昇', '下降', '停滞'];
const expectations: SalesExpectation[] = ['高', '中', '低'];
const castTypes: CastType[] = ['清楚系', '可愛い系', '綺麗系', '癒し系', 'お姉さん系', '色っぽい系', 'ノリ良い系', 'ギャル系', 'その他'];

export function CustomerForm({ initialData, onSubmit, onCancel }: CustomerFormProps) {
  const [formData, setFormData] = React.useState<Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'history'>>({
    customer_name: initialData?.customer_name || '',
    nickname: initialData?.nickname || '',
    phone_or_line: initialData?.phone_or_line || '',
    cast_name: initialData?.cast_name || '',
    cast_type: initialData?.cast_type || '清楚系',
    customer_rank: initialData?.customer_rank || 'B',
    nomination_route: initialData?.nomination_route || 'その他',
    age_group: initialData?.age_group || '30代',
    occupation: initialData?.occupation || 'サラリーマン',
    region: initialData?.region || '福岡県',
    relationship_type: initialData?.relationship_type || '新規',
    spouse_status: initialData?.spouse_status || '不明',
    preference_type: initialData?.preference_type || '可愛い系',
    phase: initialData?.phase || '認知',
    romance_level: initialData?.romance_level || 3,
    trend: initialData?.trend || '停滞',
    sales_expectation: initialData?.sales_expectation || '中',
    ng_type: initialData?.ng_type || 'なし',
    memo: initialData?.memo || '',
    last_contact_date: initialData?.last_contact_date,
    next_contact_date: initialData?.next_contact_date,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'romance_level' ? parseInt(value) : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-28">
      {/* 担当者情報 */}
      <div className="bg-white p-5 rounded-2xl shadow-sm space-y-5">
        <h2 className="text-lg font-bold text-gray-800 border-b pb-2 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-blue-500 rounded-full"></span>
          担当キャスト情報
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">担当キャスト</label>
            <input type="text" name="cast_name" value={formData.cast_name} onChange={handleChange} required placeholder="キャスト名" className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">キャストタイプ</label>
            <select name="cast_type" value={formData.cast_type} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-blue-500 outline-none transition-all">
              {castTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 基本情報 */}
      <div className="bg-white p-5 rounded-2xl shadow-sm space-y-5">
        <h2 className="text-lg font-bold text-gray-800 border-b pb-2 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-green-500 rounded-full"></span>
          お客様基本情報
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">顧客名</label>
            <input type="text" name="customer_name" value={formData.customer_name} onChange={handleChange} required placeholder="本名または氏名" className="mt-1 block w-full rounded-xl border-gray-200 text-lg p-3 bg-gray-50 border focus:ring-2 focus:ring-green-500 outline-none transition-all" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">ニックネーム</label>
              <input type="text" name="nickname" value={formData.nickname} onChange={handleChange} placeholder="呼び名" className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-green-500 outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">職業</label>
              <select name="occupation" value={formData.occupation} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-green-500 outline-none transition-all">
                {occupations.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">配偶者有無</label>
              <select name="spouse_status" value={formData.spouse_status} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-green-500 outline-none transition-all">
                {spouseStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">連絡先</label>
              <input type="text" name="phone_or_line" value={formData.phone_or_line} onChange={handleChange} placeholder="LINE ID / 番号" className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-green-500 outline-none transition-all" />
            </div>
          </div>
        </div>
      </div>

      {/* 営業パラメータ */}
      <div className="bg-white p-5 rounded-2xl shadow-sm space-y-5">
        <h2 className="text-lg font-bold text-gray-800 border-b pb-2 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-orange-500 rounded-full"></span>
          攻略・営業パラメータ
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">顧客ランク</label>
            <select name="customer_rank" value={formData.customer_rank} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-orange-500 outline-none transition-all">
              {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">フェーズ</label>
            <select name="phase" value={formData.phase} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-orange-500 outline-none transition-all">
              {phases.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">指名経緯</label>
            <select name="nomination_route" value={formData.nomination_route} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-orange-500 outline-none transition-all">
              {routes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">関係タイプ</label>
            <select name="relationship_type" value={formData.relationship_type} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-orange-500 outline-none transition-all">
              {relationships.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-orange-600 mb-1">温度変化</label>
            <select name="trend" value={formData.trend} onChange={handleChange} className="mt-1 block w-full rounded-xl border-orange-200 p-3 bg-orange-50 border font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-all">
              {trends.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-green-600 mb-1">売上期待値</label>
            <select name="sales_expectation" value={formData.sales_expectation} onChange={handleChange} className="mt-1 block w-full rounded-xl border-green-200 p-3 bg-green-50 border font-bold focus:ring-2 focus:ring-green-500 outline-none transition-all">
              {expectations.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">好みタイプ</label>
            <select name="preference_type" value={formData.preference_type} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border focus:ring-2 focus:ring-orange-500 outline-none transition-all">
              {preferenceTypes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="bg-pink-50 p-3 rounded-xl border border-pink-100">
            <label className="block text-xs font-bold text-pink-600 mb-1">色恋度 (1-5)</label>
            <div className="flex items-center gap-3">
              <input type="range" name="romance_level" min="1" max="5" step="1" value={formData.romance_level} onChange={handleChange} className="flex-1 h-2 bg-pink-200 rounded-lg appearance-none cursor-pointer accent-pink-500" />
              <span className="font-black text-xl text-pink-500 min-w-[1.5rem] text-center">{formData.romance_level}</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-red-500 mb-1">NG事項</label>
          <select name="ng_type" value={formData.ng_type} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border text-red-600 font-medium focus:ring-2 focus:ring-red-500 outline-none transition-all">
            {ngTypes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">自由メモ</label>
          <textarea name="memo" rows={4} value={formData.memo} onChange={handleChange} placeholder="来店サイクル、好きな話題、注意点など自由に記入..." className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t flex gap-4 z-20 safe-area-bottom">
        <button type="button" onClick={onCancel} className="flex-1 py-4 border border-gray-300 rounded-2xl text-gray-700 font-bold active:bg-gray-100 transition-colors">キャンセル</button>
        <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl active:bg-blue-700 transition-colors">保存する</button>
      </div>
    </form>
  );
}
