'use client';

import React from 'react';
import { 
  Customer, 
  CustomerRank, 
  NominationRoute, 
  AgeGroup, 
  Occupation, 
  Region,
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
  initialData?: Customer;
  onSubmit: (data: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'history'>) => void;
  onCancel: () => void;
}

const ranks: CustomerRank[] = ['S', 'A', 'B', 'C'];
const routes: NominationRoute[] = ['前店舗顧客', 'SNS指名', '紹介指名', '店舗外指名', 'J→本指名', 'H→本指名', 'R→本指名', 'F→本指名', 'その他'];
const ageGroups: AgeGroup[] = ['20代', '30代', '40代', '50代以上'];
const occupations: Occupation[] = ['経営者', 'サラリーマン', '接待役が多い', '自営業', '医療系', '夜職', '公務員・堅い職業', '土業', 'その他'];
const regions: Region[] = ['福岡県', '県外'];
const relationships: RelationshipType[] = ['新規', '常連', '疎遠', '友人', '仕事関係'];
const spouseStatuses: SpouseStatus[] = ['有', '無'];
const preferenceTypes: PreferenceType[] = ['可愛い系', '綺麗系', '大人っぽい', '素人っぽい', '距離感近い', '誠実丁寧', '甘えてほしい', '自立系', '色恋系', '落ち着き系'];
const phases: Phase[] = ['認知', '接触', '関係構築', '安定', '囲い込み'];
const ngTypes: NGType[] = ['なし', '遅刻', 'ドタキャン', '連絡遅い', '営業弱い', '距離感ミス', '金銭感覚ズレ', '対応雑', 'その他'];
const trends: Trend[] = ['上昇', '下降', '停滞'];
const expectations: SalesExpectation[] = ['高', '中', '低'];
const castTypes: CastType[] = ['清楚・可愛い系', '綺麗・お姉さん系', 'ノリ・友達系', '色恋・小悪魔系'];

export function CustomerForm({ initialData, onSubmit, onCancel }: CustomerFormProps) {
  const [formData, setFormData] = React.useState<Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'history'>>({
    customer_name: initialData?.customer_name || '',
    nickname: initialData?.nickname || '',
    phone_or_line: initialData?.phone_or_line || '',
    cast_name: initialData?.cast_name || '',
    cast_type: initialData?.cast_type || '清楚・可愛い系',
    customer_rank: initialData?.customer_rank || 'B',
    nomination_route: initialData?.nomination_route || 'その他',
    age_group: initialData?.age_group || '30代',
    occupation: initialData?.occupation || 'サラリーマン',
    region: initialData?.region || '福岡県',
    relationship_type: initialData?.relationship_type || '新規',
    spouse_status: initialData?.spouse_status || '無',
    preference_type: initialData?.preference_type || '清楚系' as any,
    phase: initialData?.phase || '認知',
    romance_level: initialData?.romance_level || 3,
    trend: initialData?.trend || '停滞',
    sales_expectation: initialData?.sales_expectation || '中',
    ng_type: initialData?.ng_type || 'なし',
    memo: initialData?.memo || '',
    last_contact_date: initialData?.last_contact_date,
    next_contact_date: initialData?.next_contact_date,
  });

  React.useEffect(() => {
    if (!preferenceTypes.includes(formData.preference_type as any)) {
      setFormData(prev => ({ ...prev, preference_type: '落ち着き系' }));
    }
  }, []);

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
      <div className="bg-white p-5 rounded-2xl shadow-sm space-y-5">
        <h2 className="text-lg font-bold text-gray-800 border-b pb-2">基本情報</h2>
        
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700">キャスト名</label>
              <input type="text" name="cast_name" value={formData.cast_name} onChange={handleChange} required className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700">キャストタイプ</label>
              <select name="cast_type" value={formData.cast_type} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border">
                {castTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700">顧客名</label>
            <input type="text" name="customer_name" value={formData.customer_name} onChange={handleChange} required className="mt-1 block w-full rounded-xl border-gray-200 text-lg p-3 bg-gray-50 border" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700">ニックネーム</label>
              <input type="text" name="nickname" value={formData.nickname} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700">連絡先 (LINE等)</label>
              <input type="text" name="phone_or_line" value={formData.phone_or_line} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border" />
            </div>
          </div>
        </div>

        <h2 className="text-lg font-bold text-gray-800 border-b pb-2 pt-4">攻略パラメータ</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 text-orange-600">温度変化</label>
            <select name="trend" value={formData.trend} onChange={handleChange} className="mt-1 block w-full rounded-xl border-orange-200 p-3 bg-orange-50 border font-bold">
              {trends.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 text-green-600">売上期待値</label>
            <select name="sales_expectation" value={formData.sales_expectation} onChange={handleChange} className="mt-1 block w-full rounded-xl border-green-200 p-3 bg-green-50 border font-bold">
              {expectations.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700">顧客ランク</label>
            <select name="customer_rank" value={formData.customer_rank} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border">
              {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">フェーズ</label>
            <select name="phase" value={formData.phase} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border font-bold text-blue-600">
              {phases.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700">配偶者有無</label>
            <select name="spouse_status" value={formData.spouse_status} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border">
              {spouseStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">好みタイプ</label>
            <select name="preference_type" value={formData.preference_type} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border">
              {preferenceTypes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700">色恋度 (1-5)</label>
          <input type="range" name="romance_level" min="1" max="5" step="1" value={formData.romance_level} onChange={handleChange} className="mt-2 block w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500" />
          <div className="text-center mt-2 font-black text-2xl text-pink-500">{formData.romance_level}</div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700">NGな事</label>
          <select name="ng_type" value={formData.ng_type} onChange={handleChange} className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border text-red-600 font-medium">
            {ngTypes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700">自由メモ</label>
          <textarea name="memo" rows={4} value={formData.memo} onChange={handleChange} placeholder="来店サイクル、好きな話題など..." className="mt-1 block w-full rounded-xl border-gray-200 p-3 bg-gray-50 border text-sm" />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t flex gap-4 z-20">
        <button type="button" onClick={onCancel} className="flex-1 py-4 border border-gray-300 rounded-2xl text-gray-700 font-bold">キャンセル</button>
        <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl">保存する</button>
      </div>
    </form>
  );
}
