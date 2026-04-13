'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCustomers } from '@/hooks/useCustomers'
import { Customer, CustomerVisit } from '@/types'
import Link from 'next/link'

export default function CustomerDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const { getCustomer, updateCustomer, deleteCustomer, getVisits, addVisit, isLoaded } = useCustomers()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [visits, setVisits] = useState<CustomerVisit[]>([])
  const [newVisit, setNewVisit] = useState({ 
    visit_date: new Date().toISOString().split('T')[0], 
    amount_spent: 0, 
    memo: '' 
  })

  // LINEテンプレート編集用ステート
  const [editableTemplates, setEditableTemplates] = useState({
    thanks: '',
    sales: '',
    visit: ''
  })
  const [isSaving, setIsSaving] = useState(false)

  const fetchDetail = useCallback(async () => {
    const c = await getCustomer(id)
    if (c) {
      setCustomer(c)
      setEditableTemplates({
        thanks: c.recommended_line_thanks || '',
        sales: c.recommended_line_sales || '',
        visit: c.recommended_line_visit || ''
      })
    }
    const v = await getVisits(id)
    setVisits(v)
  }, [id, getCustomer, getVisits])

  useEffect(() => {
    if (id) fetchDetail()
  }, [id, fetchDetail])

  if (!isLoaded || !customer) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    )
  }

  const handleDelete = async () => {
    if (confirm('この顧客データを削除してもよろしいですか？')) {
      const success = await deleteCustomer(id)
      if (success) router.push('/')
    }
  }

  const handleUpdateTemplate = async (type: 'thanks' | 'sales' | 'visit') => {
    setIsSaving(true)
    const fieldMap = {
      thanks: 'recommended_line_thanks',
      sales: 'recommended_line_sales',
      visit: 'recommended_line_visit'
    }
    
    const success = await updateCustomer(id, {
      [fieldMap[type]]: editableTemplates[type]
    })
    
    if (success) {
      alert('テンプレートを保存しました')
    }
    setIsSaving(false)
  }

  const handleAddVisit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newVisit.amount_spent < 0) return
    const added = await addVisit({ ...newVisit, customer_id: id })
    if (added) {
      setVisits([added, ...visits])
      setNewVisit({ 
        visit_date: new Date().toISOString().split('T')[0], 
        amount_spent: 0, 
        memo: '' 
      })
    }
  }

  const totalSpent = visits.reduce((acc, v) => acc + v.amount_spent, 0)
  const visitCount = visits.length
  const visitRate = customer.monthly_target_visits > 0 ? (visitCount / customer.monthly_target_visits) * 100 : 0
  const salesRate = customer.monthly_target_sales > 0 ? (totalSpent / customer.monthly_target_sales) * 100 : 0

  const copyToClipboard = (text: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    alert('コピーしました！')
  }

  const formatVal = (val: string | number | undefined) => {
    if (val === undefined || val === '' || val === 0) return <span className="text-gray-300 italic font-medium">未設定</span>
    return val
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-32 text-gray-800">
      {/* 上部ナビゲーション */}
      <div className="bg-white/80 backdrop-blur-md border-b border-primary/10 px-6 py-5 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="text-primary flex items-center text-sm font-black tracking-tight">
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg>
          BACK
        </Link>
        <div className="flex items-center space-x-3">
          <Link href={`/customer/${id}/edit`} className="text-xs bg-white border border-primary/10 px-5 py-2 rounded-full font-black shadow-sm text-primary hover:bg-primary/5 transition-colors">
            EDIT
          </Link>
          <button onClick={handleDelete} className="text-xs text-gray-400 font-bold px-2 py-2 hover:text-red-400 transition-colors">
            DELETE
          </button>
        </div>
      </div>

      <div className="max-w-[420px] mx-auto p-6 space-y-8">
        
        {/* 1. 顧客サマリーカード */}
        <div className="eclat-card p-10 space-y-8 relative overflow-hidden ring-1 ring-primary/5 shadow-lg">
          <div className="absolute top-0 left-0 w-full h-2 eclat-gradient"></div>
          
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex items-center space-x-2">
              <span className={`px-5 py-1.5 rounded-full text-[11px] font-black tracking-[0.2em] shadow-sm ${
                customer.customer_rank === 'S' ? 'bg-yellow-400 text-white' : 'eclat-gradient text-white'
              }`}>
                RANK {customer.customer_rank}
              </span>
              <span className="text-primary-light font-black text-xs tracking-widest uppercase opacity-70">{customer.relationship_type}</span>
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl font-black tracking-tighter text-gray-900">{customer.customer_name}</h1>
              <p className="text-xl text-primary-light font-bold italic tracking-tight">{customer.nickname ? `"${customer.nickname}"` : ''}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {[customer.age_group, customer.occupation, customer.region].filter(Boolean).map((tag, i) => (
                <span key={i} className="px-4 py-1.5 bg-gray-50 text-gray-500 rounded-full text-[10px] font-extrabold border border-gray-100 uppercase tracking-wider">{tag}</span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50/50 p-5 rounded-3xl border border-green-100 shadow-sm">
              <p className="text-[10px] font-black text-green-600 uppercase mb-2 tracking-widest opacity-70">Sales</p>
              <p className="text-2xl font-black text-green-700">{(totalSpent / 10000).toFixed(1)}<span className="text-xs ml-1 font-bold">万</span></p>
              <div className="mt-3 w-full bg-green-200/30 rounded-full h-1.5 overflow-hidden">
                <div className="bg-green-500 h-full rounded-full" style={{ width: `${Math.min(salesRate, 100)}%` }}></div>
              </div>
            </div>
            <div className="bg-primary/5 p-5 rounded-3xl border border-primary/10 shadow-sm">
              <p className="text-[10px] font-black text-primary uppercase mb-2 tracking-widest opacity-70">Visits</p>
              <p className="text-2xl font-black text-primary">{visitCount}<span className="text-xs ml-1 font-bold">回</span></p>
              <div className="mt-3 w-full bg-primary/10 rounded-full h-1.5 overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: `${Math.min(visitRate, 100)}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. 営業方針 */}
        <div className="eclat-card p-8 space-y-8 shadow-md">
          <h2 className="text-xl font-black flex items-center text-primary tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center mr-4 text-xl">🎯</span>
            営業方針・戦略
          </h2>
          
          <div className="space-y-6">
            <div className="bg-primary/5 rounded-3xl p-6 border border-primary/10 relative">
              <div className="absolute -top-3 left-6 px-3 py-1 bg-primary text-white text-[9px] font-black rounded-full uppercase tracking-widest shadow-sm">OBJECTIVE</div>
              <p className="text-lg font-black text-gray-800 leading-relaxed mt-2">{customer.sales_objective || '目的を設定してください'}</p>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {[
                { label: '推奨頻度', value: customer.recommended_frequency || '週1回程度', icon: '📅' },
                { label: '連絡時間', value: customer.best_time_to_contact || '特になし', icon: '⏰' },
                { label: '口調・トーン', value: customer.recommended_tone || '丁寧', icon: '👄' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-5 bg-gray-50/50 border border-gray-100 rounded-2xl">
                  <div className="flex items-center">
                    <span className="mr-3 opacity-70">{item.icon}</span>
                    <span className="text-gray-400 text-[11px] font-black uppercase tracking-widest">{item.label}</span>
                  </div>
                  <span className="text-gray-700 font-black text-sm">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="bg-secondary/40 rounded-3xl p-6 border border-secondary shadow-inner">
              <p className="text-primary-light text-[10px] font-black mb-2 uppercase tracking-widest opacity-80">Key Points — 攻略重要点</p>
              <p className="text-sm font-bold text-gray-600 leading-relaxed">{customer.important_points || '礼儀正しく誠実な対応を継続しましょう。'}</p>
            </div>
          </div>
        </div>

        {/* 3. やってはいけないこと */}
        <div className="eclat-card p-8 space-y-8 border-l-8 border-l-red-100 shadow-md">
          <h2 className="text-xl font-black flex items-center text-red-400 tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center mr-4 text-xl">⚠️</span>
            NG行動・注意点
          </h2>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-red-50/50 rounded-2xl border border-red-100">
              <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">NG CATEGORY</span>
              <span className="text-sm font-black text-red-500 bg-white px-3 py-1 rounded-lg shadow-sm">{customer.ng_items || 'なし'}</span>
            </div>

            <div className="space-y-4">
              {customer.warning_points ? (
                customer.warning_points.split(/[。]/).filter(s => s.trim()).map((warn, i) => (
                  <div key={i} className="flex items-start bg-red-50/20 p-5 rounded-2xl border border-red-50 group">
                    <span className="text-red-300 mr-3 mt-1 font-black text-lg group-hover:scale-125 transition-transform">✕</span>
                    <p className="text-sm font-extrabold text-red-800/80 leading-relaxed">{warn.trim()}。</p>
                  </div>
                ))
              ) : (
                <div className="bg-gray-50 p-6 rounded-2xl text-center">
                  <p className="text-sm text-gray-300 font-bold italic">NO SPECIFIC WARNINGS</p>
                </div>
              )}
            </div>

            <div className="bg-gray-50/80 p-5 rounded-2xl border border-gray-100 flex items-center justify-between">
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">NG TIMING</p>
              <p className="text-sm font-black text-gray-700">{customer.ng_contact_time || 'なし'} / {customer.ng_contact_day || 'なし'}</p>
            </div>
          </div>
        </div>

        {/* 4. LINE文面 */}
        <div className="eclat-card p-8 space-y-8 shadow-md">
          <h2 className="text-xl font-black flex items-center text-primary tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center mr-4 text-xl">📱</span>
            LINEテンプレート
          </h2>
          
          <div className="space-y-8">
            {[
              { key: 'thanks', label: 'AFTER VISIT / お礼', icon: '✨' },
              { key: 'sales', label: 'DAILY CONTACT / 近況', icon: '💬' },
              { key: 'visit', label: 'INVITATION / 誘致', icon: '💕' },
            ].map((tpl, i) => (
              <div key={i} className="space-y-4 p-6 bg-[#FBFBFF] rounded-3xl border border-primary/5 shadow-sm group">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-primary tracking-[0.2em] uppercase">{tpl.icon} {tpl.label}</p>
                  <button 
                    onClick={() => handleUpdateTemplate(tpl.key as any)}
                    className="text-[10px] font-black bg-primary text-white px-5 py-2 rounded-full shadow-md shadow-primary/20 hover:scale-105 transition-all"
                    disabled={isSaving}
                  >
                    SAVE
                  </button>
                </div>
                <textarea
                  value={(editableTemplates as any)[tpl.key]}
                  onChange={(e) => setEditableTemplates({...editableTemplates, [tpl.key]: e.target.value})}
                  className="w-full bg-white border border-primary/5 rounded-2xl p-5 text-sm font-bold text-gray-700 leading-relaxed focus:ring-2 focus:ring-primary/10 outline-none min-h-[140px] resize-none transition-all shadow-inner"
                  placeholder="文面を入力..."
                />
                <button 
                  onClick={() => copyToClipboard((editableTemplates as any)[tpl.key])}
                  disabled={!(editableTemplates as any)[tpl.key]}
                  className="w-full py-4 bg-gray-900 text-white rounded-2xl text-xs font-black tracking-widest disabled:bg-gray-200 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>COPY TO CLIPBOARD</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 5. 詳細プロフィール */}
        <div className="eclat-card p-8 space-y-8 shadow-md">
          <h3 className="text-xl font-black text-gray-900 flex items-center tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center mr-4 text-xl">👤</span>
            詳細プロフィール
          </h3>
          <div className="grid grid-cols-2 gap-y-8 gap-x-6 text-sm font-black">
            {[
              { label: '血液型', value: customer.blood_type },
              { label: '既婚', value: customer.spouse_status },
              { label: '趣味 / 話題', value: customer.hobby, full: true },
              { label: '好みのタイプ', value: customer.favorite_type, full: true },
              { label: 'トレンド', value: customer.trend, full: true },
            ].map((item, i) => (
              <div key={i} className={item.full ? "col-span-2" : ""}>
                <p className="text-gray-400 text-[10px] font-black mb-2 tracking-widest uppercase">item.label</p>
                <p className="text-gray-800 text-base">{formatVal(item.value)}</p>
              </div>
            ))}
            
            <div className="col-span-2 bg-gray-50/80 p-6 rounded-3xl border border-gray-100 mt-2 shadow-inner">
              <p className="text-gray-400 text-[10px] font-black mb-3 tracking-widest uppercase">自由記入メモ</p>
              <p className="text-sm font-bold text-gray-600 whitespace-pre-wrap leading-relaxed">
                {customer.memo || <span className="text-gray-300 italic font-medium">メモがありません</span>}
              </p>
            </div>
          </div>
        </div>

        {/* 6. 来店記録 */}
        <div className="eclat-card p-8 space-y-8 shadow-md">
          <h3 className="text-xl font-black text-gray-900 flex items-center tracking-tight">
            <span className="w-10 h-10 rounded-2xl bg-green-50 flex items-center justify-center mr-4 text-xl">💰</span>
            来店履歴・売上記録
          </h3>
          
          <form onSubmit={handleAddVisit} className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100 space-y-5 shadow-inner">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">来店日</label>
                <input 
                  type="date" 
                  value={newVisit.visit_date} 
                  onChange={e => setNewVisit({...newVisit, visit_date: e.target.value})}
                  className="w-full h-14 p-4 text-sm font-black border-none rounded-2xl bg-white shadow-sm outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-green-400 transition-all"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">売上（円）</label>
                <input 
                  type="number" 
                  placeholder="金額を入力"
                  value={newVisit.amount_spent || ''} 
                  onChange={e => setNewVisit({...newVisit, amount_spent: Number(e.target.value)})}
                  className="w-full h-14 p-4 text-sm font-black border-none rounded-2xl bg-white shadow-sm outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-green-400 transition-all"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">備考・ボトルなど</label>
              <input 
                type="text" 
                placeholder="例：響17年、誕生日のお祝いなど"
                value={newVisit.memo} 
                onChange={e => setNewVisit({...newVisit, memo: e.target.value})}
                className="w-full h-14 p-4 text-sm font-black border-none rounded-2xl bg-white shadow-sm outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-green-400 transition-all"
              />
            </div>
            <button type="submit" className="w-full py-5 bg-green-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-green-200/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <span>来店を記録する</span>
            </button>
          </form>

          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
            <p className="text-[10px] font-black text-gray-400 tracking-widest uppercase ml-1">履歴一覧 — {visits.length}件</p>
            {visits.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-5 bg-white border border-gray-50 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center space-x-5">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 mb-1">{v.visit_date.replace(/-/g, '/')}</span>
                    <p className="text-2xl font-black text-primary leading-none">
                      {(v.amount_spent / 10000).toFixed(1)}<span className="text-xs ml-0.5 font-bold">万円</span>
                    </p>
                    {v.memo && (
                      <p className="text-[11px] font-bold text-gray-500 mt-2 bg-gray-50 px-2 py-1 rounded-lg inline-block w-fit">{v.memo}</p>
                    )}
                  </div>
                </div>
                <div className="text-primary/20">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
                </div>
              </div>
            ))}
            {visits.length === 0 && (
              <div className="py-16 text-center text-gray-300 font-black italic text-xs tracking-[0.3em] opacity-50">
                履歴がありません
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
