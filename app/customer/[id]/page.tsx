'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useCustomers } from '@/hooks/useCustomers';
import { diagnoseCustomer } from '@/lib/diagnosis';

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { getCustomer, isLoaded, deleteCustomer, logContact, updateCustomer } = useCustomers();
  const [activeTab, setActiveTab] = useState<'light' | 'standard' | 'aggressive'>('standard');
  const [customMessage, setCustomMessage] = useState('');

  const customer = getCustomer(id);

  const diagnosis = useMemo(() => {
    if (customer) return diagnoseCustomer(customer);
    return null;
  }, [customer]);

  // タブ切り替え時にカスタムメッセージを更新
  useEffect(() => {
    if (diagnosis) {
      setCustomMessage(diagnosis.messages[activeTab]);
    }
  }, [activeTab, diagnosis]);

  const handleCopyAndLog = async () => {
    if (!diagnosis || !customer) return;
    const text = customMessage; // 自由入力欄の内容を使用
    navigator.clipboard.writeText(text);
    
    const typeMap = { light: '挨拶', standard: '標準', aggressive: '来店誘致' };
    await logContact(customer.id, {
      type: typeMap[activeTab] as any,
      message: text,
      memo: 'カスタムメッセージをコピー'
    });
    alert('コピー＆履歴保存しました！✨');
  };

  const handleSetNextContact = async (date: string) => {
    if (customer) {
      await updateCustomer(customer.id, { next_contact_date: date });
    }
  };

  const handleDelete = () => {
    if (window.confirm('本当に削除しますか？')) {
      deleteCustomer(id);
      router.push('/');
    }
  };

  // 顧客の要約（特徴）を生成
  const customerSummary = useMemo(() => {
    if (!customer) return [];
    const summaries = [];
    summaries.push(`${customer.customer_rank}ランクの${customer.occupation}。${customer.region}在住。`);
    summaries.push(`${customer.nomination_route}経由で${customer.phase}フェーズ。現在温度感は「${customer.trend}」。`);
    
    if (customer.spouse_status === '有') {
      summaries.push(`既婚者のため、夜間・日曜の連絡は厳禁。安全な癒やしを求めている。`);
    } else if (customer.spouse_status === '無') {
      summaries.push(`独身。${customer.preference_type}が好みで、色恋度Lv.${customer.romance_level}。`);
    } else {
      summaries.push(`既婚・独身は不明。リスク回避のため、まずは慎重な連絡時間帯を推奨。`);
    }

    if (customer.ng_type !== 'なし') {
      summaries.push(`【警告】${customer.ng_type}に非常に敏感なため、対応に注意が必要。`);
    }
    return summaries;
  }, [customer]);

  if (!isLoaded) {
    return <div className="flex justify-center items-center h-screen bg-gray-50 font-black text-blue-500">LOADING...</div>;
  }

  if (!customer || !diagnosis) {
    return (
      <div className="flex flex-col justify-center items-center h-screen p-4 bg-gray-50 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-gray-500 font-bold mb-6">データが見つかりませんでした。</p>
        <Link href="/" className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg">一覧に戻る</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <header className="bg-white p-5 sticky top-0 z-10 shadow-sm border-b flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/')} className="text-gray-900 p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-black text-gray-900 leading-tight">
              {customer.nickname || customer.customer_name}
            </h1>
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
              {customer.customer_rank} RANK / {customer.trend || '未設定'} {customer.trend === '上昇' ? '📈' : (customer.trend === '下降' ? '📉' : (customer.trend === '停滞' ? '➡️' : ''))}
            </div>
          </div>
        </div>
        <Link href={`/customer/${id}/edit`} className="bg-gray-100 text-gray-900 px-5 py-2.5 rounded-xl font-black text-sm active:scale-95 transition-transform">
          編集
        </Link>
      </header>

      <main className="p-4 space-y-6">
        {/* 1. 攻略方針 & 売上期待値 */}
        <section className="bg-gradient-to-br from-indigo-900 via-blue-900 to-black p-6 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400">Strategy Policy</span>
                <span className="text-2xl font-black italic">{diagnosis.strategyPolicy}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-green-400">Sales Value</span>
                <div className="text-xl font-black">{customer.sales_expectation || '未設定'}</div>
              </div>
            </div>
            
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 mt-4">
              <div className="text-[10px] font-black text-blue-300 uppercase mb-1 tracking-widest">Core Strategy Point</div>
              <p className="text-lg font-bold leading-tight italic underline decoration-blue-500 underline-offset-4">
                {diagnosis.coreStrategy}
              </p>
            </div>
          </div>
        </section>

        {/* 2. 危険アラート */}
        {diagnosis.dangerAlert !== 'なし（標準的な警戒）' && (
          <section className="bg-red-600 p-5 rounded-[2rem] text-white shadow-lg animate-pulse">
            <div className="flex items-center gap-3">
              <div className="text-2xl">⚠️</div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Danger Alert</div>
                <div className="text-sm font-bold">{diagnosis.dangerAlert}</div>
              </div>
            </div>
          </section>
        )}

        {/* 3. 具体戦略 & NG行動 */}
        <div className="grid grid-cols-1 gap-4">
          <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h2 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping"></span>
              本日の具体アクション
            </h2>
            <p className="text-sm font-bold text-gray-800 leading-relaxed">
              {diagnosis.specificStrategy}
            </p>
            <div className="mt-4 pt-4 border-t border-gray-50">
              <div className="text-[10px] text-gray-400 font-black mb-1 uppercase">Recommended</div>
              <p className="text-sm font-black text-indigo-600">{diagnosis.finalAction}</p>
            </div>
          </section>

          <section className="bg-red-50 p-6 rounded-[2.5rem] border border-red-100">
            <h2 className="text-xs font-black text-red-600 uppercase tracking-widest mb-3 flex items-center gap-2">
              🛑 NG行動 (地雷回避)
            </h2>
            <p className="text-sm font-bold text-red-900 leading-relaxed">
              {diagnosis.ngAction}
            </p>
          </section>
        </div>

        {/* 4. 自動生成・自由編集メッセージ */}
        <section className="bg-white p-2 rounded-[2.5rem] shadow-xl border-2 border-green-500/10 space-y-2">
          <div className="flex p-1 bg-gray-100 rounded-[2rem]">
            {['light', 'standard', 'aggressive'].map((t) => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-3 text-xs font-black rounded-[1.8rem] transition-all ${activeTab === t ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400'}`}>
                {t === 'light' ? '挨拶' : (t === 'standard' ? '標準' : '来店誘致')}
              </button>
            ))}
          </div>
          <div className="p-6 pt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center px-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">自由編集エリア</span>
                <span className="text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">編集可能</span>
              </div>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={5}
                className="w-full bg-gray-50 p-5 rounded-3xl text-gray-800 text-sm font-medium leading-relaxed border border-gray-100 focus:ring-2 focus:ring-green-500 focus:bg-white outline-none transition-all resize-none italic"
                placeholder="メッセージを自由に入力してください..."
              />
            </div>
            <button onClick={handleCopyAndLog} className="w-full bg-green-500 text-white py-5 rounded-2xl font-black shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
              コピーしてLINEへ貼る
            </button>
          </div>
        </section>

        {/* 5. スケジュール & 履歴 */}
        <div className="grid grid-cols-1 gap-4">
          <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-gray-400 font-black uppercase mb-1">Next Schedule</div>
              <input type="date" value={customer.next_contact_date || ''} onChange={(e) => handleSetNextContact(e.target.value)} className="font-black text-gray-900 border-none p-0 focus:ring-0 bg-transparent" />
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-400 font-black uppercase mb-1">Type</div>
              <div className="text-xs font-black text-blue-600">{customer.cast_type}</div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">History</h2>
            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {customer.history && customer.history.length > 0 ? (
                customer.history.slice(0, 5).map((log) => (
                  <div key={log.id} className="border-l-2 border-gray-100 pl-4 py-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] font-black bg-gray-100 px-2 py-0.5 rounded text-gray-500">{log.type}</span>
                      <span className="text-[9px] text-gray-400">{new Date(log.date).toLocaleDateString()}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 line-clamp-1 italic">「{log.message}」</p>
                  </div>
                ))
              ) : (
                <p className="text-center py-4 text-gray-300 text-[10px] font-bold uppercase">No History</p>
              )}
            </div>
          </section>
        </div>

        {/* 6. 診断元データ (顧客詳細データ) */}
        <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-8">
          <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
            <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
            <h2 className="text-lg font-black text-gray-800 tracking-tighter">顧客分析データ</h2>
          </div>

          {/* 要約追加 */}
          <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100">
            <div className="text-[10px] font-black text-blue-600 uppercase mb-2 tracking-[0.2em]">Customer Summary</div>
            <ul className="space-y-1">
              {customerSummary.map((s, i) => (
                <li key={i} className="text-sm font-bold text-blue-900 leading-tight flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 bg-blue-400 rounded-full flex-shrink-0"></span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="space-y-8">
            {/* 基本情報 */}
            <div>
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                👤 基本情報
              </h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {[
                  { label: '顧客名', value: customer.customer_name, icon: '🏷️' },
                  { label: 'ニックネーム', value: customer.nickname, icon: '💬' },
                  { label: '電話/LINE名', value: customer.phone_or_line, icon: '📱' },
                  { label: '担当キャスト', value: customer.cast_name, icon: '👩' },
                  { label: 'キャストタイプ', value: customer.cast_type, icon: '✨' },
                ].map((item) => (
                  <div key={item.label} className="border-b border-gray-50 pb-2">
                    <span className="text-[9px] text-gray-400 font-bold mb-1 block">{item.icon} {item.label}</span>
                    <span className="text-sm font-black text-gray-800">{item.value || '未設定'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 営業属性 - 重要 */}
            <div className="bg-gray-50/50 p-5 rounded-[2rem] border border-gray-100">
              <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                📈 営業属性 (最重要)
              </h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {[
                  { label: '顧客ランク', value: customer.customer_rank, icon: '💎', important: true },
                  { label: 'フェーズ', value: customer.phase, icon: '🚩', important: true },
                  { label: '配偶者有無', value: customer.spouse_status, icon: '💍', important: true },
                  { label: '売上期待値', value: customer.sales_expectation, icon: '💰', important: true },
                  { label: '指名経緯', value: customer.nomination_route, icon: '🤝' },
                  { label: '温度変化', value: customer.trend, icon: '🔥' },
                ].map((item) => (
                  <div key={item.label} className={`pb-2 ${item.important ? 'scale-105 origin-left' : ''}`}>
                    <span className={`text-[9px] font-bold mb-1 block ${item.important ? 'text-indigo-500' : 'text-gray-400'}`}>
                      {item.icon} {item.label}
                    </span>
                    <span className={`text-sm font-black ${item.important ? 'text-indigo-900 text-base underline decoration-indigo-200' : 'text-gray-800'}`}>
                      {item.value || '未設定'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 注意系 */}
            <div className="bg-red-50/30 p-5 rounded-[2rem] border border-red-100/50">
              <h3 className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                🛑 注意事項
              </h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {[
                  { label: 'NG項目', value: customer.ng_type, icon: '🔞' },
                  { label: '好みタイプ', value: customer.preference_type, icon: '🎯' },
                  { label: '色恋度', value: `Lv.${customer.romance_level}`, icon: '❤️' },
                ].map((item) => (
                  <div key={item.label} className="pb-2">
                    <span className="text-[9px] text-red-400 font-bold mb-1 block">{item.icon} {item.label}</span>
                    <span className={`text-sm font-black ${item.label === 'NG項目' ? 'text-red-700' : 'text-gray-800'}`}>
                      {item.value || '未設定'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 戦略補助 */}
            <div>
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                ⚙️ 戦略補助
              </h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {[
                  { label: '年齢層', value: customer.age_group, icon: '🎂' },
                  { label: '職業', value: customer.occupation, icon: '💼' },
                  { label: '地域', value: customer.region, icon: '📍' },
                  { label: '関係タイプ', value: customer.relationship_type, icon: '🔗' },
                  { label: '最終連絡日', value: customer.last_contact_date ? new Date(customer.last_contact_date).toLocaleDateString() : null, icon: '📅' },
                  { label: '次回予定日', value: customer.next_contact_date ? new Date(customer.next_contact_date).toLocaleDateString() : null, icon: '⏰' },
                ].map((item) => (
                  <div key={item.label} className="border-b border-gray-50 pb-2">
                    <span className="text-[9px] text-gray-400 font-bold mb-1 block">{item.icon} {item.label}</span>
                    <span className="text-xs font-bold text-gray-500">{item.value || '未設定'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 自由メモ */}
          <div className="mt-4 p-5 bg-gray-50 rounded-3xl border border-gray-100">
            <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-2">📋 自由メモ</span>
            <p className={`text-sm leading-relaxed ${customer.memo ? 'text-gray-600 font-medium' : 'text-gray-300 italic'}`}>
              {customer.memo || 'メモなし'}
            </p>
          </div>
        </section>

        <div className="px-4 pb-12">
          <button 
            onClick={handleDelete} 
            className="w-full py-5 bg-white text-red-600 border-2 border-red-50 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-sm active:bg-red-500 active:text-white transition-all flex items-center justify-center gap-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            顧客データを削除
          </button>
        </div>
      </main>
    </div>
  );
}
