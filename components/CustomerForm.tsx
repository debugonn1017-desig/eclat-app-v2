'use client'

import { useState } from 'react'
import { 
  Customer, 
  CustomerRank, 
  NominationRoute, 
  AgeGroup, 
  Occupation, 
  Region, 
  RelationshipType, 
  Phase, 
  SpouseStatus, 
  FavoriteType, 
  NGItem, 
  SalesExpectation, 
  Trend,
  CastType
} from '@/types'
import { diagnoseCustomer } from '@/lib/diagnosis'

interface CustomerFormProps {
  initialData?: Partial<Customer>
  onSubmit: (data: Partial<Customer>) => void
  onCancel?: () => void
}

const ranks: CustomerRank[] = ['S', 'A', 'B', 'C']
const routes: NominationRoute[] = [
  '前店舗顧客', 'SNS指名', '紹介指名', '店舗外指名', '場内指名→本指名', 
  'フリー→本指名', 'ヘルプ→本指名', 'ロイヤル層→本指名', 'その他'
]
const ages: AgeGroup[] = ['20代', '30代', '40代', '50代以上']
const occupations: Occupation[] = [
  '経営者', 'サラリーマン', '接待役が多い', '自営業', '医療系', '夜職', 
  '公務員・堅い職業', '土業', '不動産', '金融', '建設', '飲食', 'IT', '美容', '広告', '士業', 'その他'
]
const regions: Region[] = ['福岡県', '県外']
const relationships: RelationshipType[] = ['認知', '場内', '初指名', 'リピート', '安定', '来店操作可能']
const phases: Phase[] = ['興味付け', '接点維持', '距離を縮める', '来店を増やす', '固定化する']
const spouses: SpouseStatus[] = ['有', '無']
const favorites: FavoriteType[] = [
  '可愛い系', '綺麗系', '大人っぽい', '素人っぽい', '距離感近い', '誠実丁寧', 
  '甘えてほしい', '自立系', '色恋系', '落ち着き系', '妹系', '姉系', '癒し系', 
  '元気系', '上品系', 'ギャル系', '清楚系', 'サバサバ系', '包容力ある系', 'ツンデレ系'
]
const nngs: NGItem[] = [
  'なし', '遅刻', 'ドタキャン', '連絡遅い', '営業弱い', '距離感ミス', 
  '金銭感覚ズレ', '対応雑', 'しつこい営業NG', '同伴NG', 'アフターNG', 
  'ボディタッチNG', '煽りすぎNG', '他のお客様との指名被りNG', '嫉妬煽りNG', 
  '急な重い話NG', '深夜連絡NG', '日曜連絡NG', 'その他'
]
const expectations: SalesExpectation[] = ['高', '中', '低']
const trends: Trend[] = ['上昇', '下降', '停滞']
const castTypes: CastType[] = [
  '清楚系', '可愛い系', '綺麗系', '癒し系', 'お姉さん系', '色っぽい系', 'ノリ良い系', 'ギャル系', 'その他'
]

export default function CustomerForm({ initialData, onSubmit, onCancel }: CustomerFormProps) {
  const [formData, setFormData] = useState<Partial<Customer>>({
    customer_name: '',
    nickname: '',
    cast_name: '',
    cast_type: '清楚系',
    age_group: '20代',
    occupation: '経営者',
    region: '福岡県',
    spouse_status: '無',
    blood_type: '',
    hobby: '',
    nomination_route: 'その他',
    relationship_type: '認知',
    phase: '興味付け',
    customer_rank: 'C',
    sales_expectation: '低',
    trend: '停滞',
    favorite_type: '可愛い系',
    ng_items: 'なし',
    score: 3,
    memo: '',
    monthly_target_visits: 0,
    monthly_target_sales: 0,
    actual_visit_frequency: '',
    recommended_contact_frequency: '',
    last_contact_date: '',
    next_contact_date: '',
    first_visit_date: '',
    ...initialData
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: (name === 'score' || name.includes('target')) ? (value === '' ? 0 : Number(value)) : value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // 自動計算ロジック（診断結果）を統合
    const diagnosis = diagnoseCustomer(formData)
    const finalData = {
      ...formData,
      ...diagnosis
    }
    
    onSubmit(finalData)
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[420px] mx-auto pb-48 space-y-10">
      {/* --- 1. 基本プロフィール Section --- */}
      <div className="eclat-card overflow-hidden shadow-md">
        <div className="bg-[#FBFBFF] px-8 py-6 border-b border-primary/5">
          <h2 className="text-primary font-black text-lg flex items-center gap-3 tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-xl">✨</span> 
            基本プロフィール
          </h2>
        </div>
        
        <div className="p-8 space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">お客様名</label>
            <input
              type="text"
              name="customer_name"
              value={formData.customer_name || ''}
              onChange={handleChange}
              placeholder="例：山田 太郎"
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all outline-none text-gray-800 font-bold text-base shadow-inner"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">ニックネーム</label>
            <input
              type="text"
              name="nickname"
              value={formData.nickname || ''}
              onChange={handleChange}
              placeholder="例：たーくん"
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all outline-none text-gray-800 font-bold text-base shadow-inner"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">年代</label>
              <select
                name="age_group"
                value={formData.age_group}
                onChange={handleChange}
                className="w-full h-14 bg-gray-50 border border-primary/5 rounded-2xl px-5 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
              >
                {ages.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">血液型</label>
              <input
                type="text"
                name="blood_type"
                value={formData.blood_type || ''}
                onChange={handleChange}
                placeholder="O型"
                className="w-full h-14 bg-gray-50 border border-primary/5 rounded-2xl px-5 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">地域</label>
              <select
                name="region"
                value={formData.region}
                onChange={handleChange}
                className="w-full h-14 bg-gray-50 border border-primary/5 rounded-2xl px-5 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
              >
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">既婚</label>
              <select
                name="spouse_status"
                value={formData.spouse_status}
                onChange={handleChange}
                className="w-full h-14 bg-gray-50 border border-primary/5 rounded-2xl px-5 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
              >
                {spouses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">職業</label>
            <select
              name="occupation"
              value={formData.occupation}
              onChange={handleChange}
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
            >
              {occupations.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">趣味・話題</label>
            <input
              type="text"
              name="hobby"
              value={formData.hobby || ''}
              onChange={handleChange}
              placeholder="ゴルフ、車など"
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all outline-none text-gray-800 font-bold text-base shadow-inner"
            />
          </div>
        </div>
      </div>

      {/* --- 2. 担当・経緯 Section --- */}
      <div className="eclat-card overflow-hidden shadow-md">
        <div className="bg-[#FBFBFF] px-8 py-6 border-b border-primary/5">
          <h2 className="text-primary font-black text-lg flex items-center gap-3 tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-xl">👤</span> 
            担当・指名経緯
          </h2>
        </div>
        
        <div className="p-8 space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">担当キャスト</label>
            <input
              type="text"
              name="cast_name"
              value={formData.cast_name || ''}
              onChange={handleChange}
              placeholder="キャスト名を入力"
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all outline-none text-gray-800 font-bold text-base shadow-inner"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">キャストタイプ</label>
            <div className="relative">
              <select
                name="cast_type"
                value={formData.cast_type}
                onChange={handleChange}
                className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 appearance-none focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all outline-none text-gray-800 font-black text-base shadow-inner cursor-pointer"
              >
                {castTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-primary/40">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">指名経緯</label>
            <select
              name="nomination_route"
              value={formData.nomination_route}
              onChange={handleChange}
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
            >
              {routes.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* --- 3. 営業ステータス Section --- */}
      <div className="eclat-card overflow-hidden shadow-md">
        <div className="bg-[#FBFBFF] px-8 py-6 border-b border-primary/5">
          <h2 className="text-primary font-black text-lg flex items-center gap-3 tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-xl">💎</span> 
            営業ステータス
          </h2>
        </div>
        
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">ランク</label>
              <select
                name="customer_rank"
                value={formData.customer_rank}
                onChange={handleChange}
                className="w-full h-16 bg-primary/5 border border-primary/10 rounded-2xl px-6 text-primary font-black text-lg focus:ring-4 focus:ring-primary/10 outline-none shadow-inner"
              >
                {ranks.map(r => <option key={r} value={r}>{r} ランク</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">色恋度 (1-5)</label>
              <input
                type="number"
                min="1"
                max="5"
                name="score"
                value={formData.score || 3}
                onChange={handleChange}
                className="w-full h-16 bg-primary/5 border border-primary/10 rounded-2xl px-6 text-primary font-black text-lg focus:ring-4 focus:ring-primary/10 outline-none text-center shadow-inner"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">関係性</label>
            <select
              name="relationship_type"
              value={formData.relationship_type}
              onChange={handleChange}
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
            >
              {relationships.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">営業フェーズ</label>
            <select
              name="phase"
              value={formData.phase}
              onChange={handleChange}
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
            >
              {phases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">売上期待値</label>
              <select
                name="sales_expectation"
                value={formData.sales_expectation}
                onChange={handleChange}
                className="w-full h-14 bg-gray-50 border border-primary/5 rounded-2xl px-5 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
              >
                {expectations.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">トレンド</label>
              <select
                name="trend"
                value={formData.trend}
                onChange={handleChange}
                className="w-full h-14 bg-gray-50 border border-primary/5 rounded-2xl px-5 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
              >
                {trends.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* --- 4. 好み・注意事項 Section --- */}
      <div className="eclat-card overflow-hidden shadow-md">
        <div className="bg-[#FBFBFF] px-8 py-6 border-b border-primary/5">
          <h2 className="text-primary font-black text-lg flex items-center gap-3 tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-xl">💝</span> 
            好み・注意事項
          </h2>
        </div>
        
        <div className="p-8 space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">好みのタイプ</label>
            <select
              name="favorite_type"
              value={formData.favorite_type}
              onChange={handleChange}
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 text-gray-800 font-bold focus:ring-4 focus:ring-primary/5 outline-none shadow-inner"
            >
              {favorites.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">NG項目</label>
            <select
              name="ng_items"
              value={formData.ng_items}
              onChange={handleChange}
              className="w-full h-16 bg-red-50/30 border border-red-100 rounded-2xl px-6 text-red-500 font-bold focus:ring-4 focus:ring-red-100 outline-none shadow-inner"
            >
              {nngs.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">メモ</label>
            <textarea
              name="memo"
              value={formData.memo || ''}
              onChange={handleChange}
              rows={5}
              placeholder="性格、会話内容、注意点など..."
              className="w-full bg-gray-50 border border-primary/5 rounded-2xl p-6 focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all outline-none text-gray-700 font-bold text-sm shadow-inner resize-none"
            ></textarea>
          </div>
        </div>
      </div>

      {/* --- 5. 目標・記録 Section --- */}
      <div className="eclat-card overflow-hidden shadow-md">
        <div className="bg-[#FBFBFF] px-8 py-6 border-b border-primary/5">
          <h2 className="text-primary font-black text-lg flex items-center gap-3 tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-xl">📈</span> 
            目標・データ
          </h2>
        </div>
        
        <div className="p-8 space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">初来店日</label>
            <input
              type="date"
              name="first_visit_date"
              value={formData.first_visit_date || ''}
              onChange={handleChange}
              className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all outline-none text-gray-800 font-bold text-base shadow-inner"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">月間目標来店数</label>
            <div className="relative">
              <input
                type="number"
                name="monthly_target_visits"
                value={formData.monthly_target_visits || 0}
                onChange={handleChange}
                className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 pr-12 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none text-gray-800 font-bold text-base shadow-inner"
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold">回</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-primary-light/70 ml-1 tracking-[0.2em] uppercase text-gray-400">月間目標売上</label>
            <div className="relative">
              <input
                type="number"
                name="monthly_target_sales"
                value={formData.monthly_target_sales || 0}
                onChange={handleChange}
                className="w-full h-16 bg-gray-50 border border-primary/5 rounded-2xl px-6 pr-12 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none text-gray-800 font-bold text-base shadow-inner"
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold">円</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- Action Buttons --- */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white/80 backdrop-blur-lg border-t border-primary/10 p-6 z-30">
        <div className="flex flex-col gap-3">
          <button
            type="submit"
            className="w-full h-16 eclat-gradient text-white font-black text-lg rounded-2xl shadow-lg shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 ring-4 ring-primary/5"
          >
            <span>この内容で保存する</span>
          </button>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full h-12 text-gray-400 font-black text-xs tracking-widest uppercase hover:text-primary transition-colors"
            >
              キャンセル
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
