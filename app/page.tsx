'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useCustomers } from '@/hooks/useCustomers';
import { diagnoseCustomer } from '@/lib/diagnosis';
import { 
  CustomerRank, 
  NominationRoute, 
  Occupation, 
  RelationshipType, 
  SpouseStatus, 
  Phase, 
  Trend, 
  SalesExpectation,
  Region,
  Customer
} from '@/types';

// 並び替えモード型
type SortMode = 'rank' | 'today' | 'fukuoka';

// フィルター選択肢
const ranks: CustomerRank[] = ['S', 'A', 'B', 'C'];
const trends: Trend[] = ['上昇', '下降', '停滞'];
const expectations: SalesExpectation[] = ['高', '中', '低'];
const phases: Phase[] = ['認知', '興味', '初回来店', '関係構築', '安定', '来店誘致', 'リピート', 'その他'];

const regions: Region[] = ['福岡県', '県外'];
const occupations: Occupation[] = ['サラリーマン', '経営者', '自営業', '医療系', '夜職', '建設系', 'IT系', '公務員', '不動産', '金融', 'その他'];
const relationships: RelationshipType[] = ['新規', '友人', '恋愛寄り', '常連', '様子見', 'その他'];
const spouseStatuses: SpouseStatus[] = ['有', '無', '不明'];
const routes: NominationRoute[] = ['前店舗顧客', 'SNS指名', '紹介指名', '店舗外指名', 'J→本指名', 'H→本指名', 'R→本指名', 'F→本指名', 'その他'];

export default function CustomerListPage() {
  const { customers, isLoaded } = useCustomers();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('rank');
  const [selectedCast, setSelectedCast] = useState<string>(''); // 空文字は「全体（店長モード）」

  // フィルター状態
  const [filters, setFilters] = useState({
    phase: '',
    trend: '',
    sales_expectation: '',
    customer_rank: '',
    region: '',
    occupation: '',
    relationship_type: '',
    spouse_status: '',
    nomination_route: ''
  });

  const todayStr = new Date().toISOString().split('T')[0];

  // 存在するキャストの一覧を抽出
  const allCasts = useMemo(() => {
    const casts = customers.map(c => c.cast_name).filter(Boolean);
    return Array.from(new Set(casts)).sort();
  }, [customers]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    setFilters({
      phase: '',
      trend: '',
      sales_expectation: '',
      customer_rank: '',
      region: '',
      occupation: '',
      relationship_type: '',
      spouse_status: '',
      nomination_route: ''
    });
    setSearchQuery('');
    setSortMode('rank');
    setSelectedCast('');
  };

  // 共通の営業優先度計算 (今日営業順・福岡営業順で使用)
  const getSalesPriorityScore = (c: Customer) => {
    let score = 0;
    // 1. フェーズ
    if (c.phase === '来店誘致') score += 10000;
    else if (c.phase === '関係構築') score += 5000;
    
    // 2. 温度変化
    if (c.trend === '上昇') score += 2000;
    else if (c.trend === '停滞') score += 1000;

    // 3. 売上期待値
    if (c.sales_expectation === '高') score += 500;
    else if (c.sales_expectation === '中') score += 200;

    // 4. 顧客ランク
    const rankScore = { S: 100, A: 50, B: 20, C: 10 };
    score += rankScore[c.customer_rank] || 0;

    return score;
  };

  const processedCustomers = useMemo(() => {
    return customers
      .map((c) => ({
        ...c,
        diagnosis: diagnoseCustomer(c),
      }))
      .filter((c) => {
        // キャスト絞り込み（店長モード以外）
        if (selectedCast && c.cast_name !== selectedCast) return false;

        // 名前・ニックネーム検索
        const matchesSearch = 
          c.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.nickname.toLowerCase().includes(searchQuery.toLowerCase());
        
        if (!matchesSearch) return false;

        // 攻略フィルター
        if (filters.phase && c.phase !== filters.phase) return false;
        if (filters.trend && c.trend !== filters.trend) return false;
        if (filters.sales_expectation && c.sales_expectation !== filters.sales_expectation) return false;
        if (filters.customer_rank && c.customer_rank !== filters.customer_rank) return false;

        // 条件フィルター
        if (filters.region && c.region !== filters.region) return false;
        if (filters.occupation && c.occupation !== filters.occupation) return false;
        if (filters.relationship_type && c.relationship_type !== filters.relationship_type) return false;
        if (filters.spouse_status && c.spouse_status !== filters.spouse_status) return false;
        if (filters.nomination_route && c.nomination_route !== filters.nomination_route) return false;

        return true;
      })
      .sort((a, b) => {
        // 1. 期限超過は全モードで最優先（既存仕様の維持）
        const aUrgent = a.next_contact_date && a.next_contact_date <= todayStr;
        const bUrgent = b.next_contact_date && b.next_contact_date <= todayStr;
        if (aUrgent && !bUrgent) return -1;
        if (!aUrgent && bUrgent) return 1;

        if (sortMode === 'rank') {
          // --- 1. ランク順 (デフォルト) ---
          const rankValue = { S: 4, A: 3, B: 2, C: 1 };
          const scoreA = rankValue[a.customer_rank] || 0;
          const scoreB = rankValue[b.customer_rank] || 0;
          if (scoreA !== scoreB) return scoreB - scoreA;

          // 同ランク内: 期待値
          const expValue = { 高: 3, 中: 2, 低: 1 };
          if (expValue[a.sales_expectation] !== expValue[b.sales_expectation]) {
            return (expValue[b.sales_expectation] || 0) - (expValue[a.sales_expectation] || 0);
          }

          // 同期待値内: 温度感
          const trendValue = { 上習: 3, 停滞: 2, 下降: 1 };
          if (trendValue[a.trend] !== trendValue[b.trend]) {
            return (trendValue[b.trend] || 0) - (trendValue[a.trend] || 0);
          }

          return a.customer_name.localeCompare(b.customer_name);

        } else if (sortMode === 'today') {
          // --- 2. 今日営業順 ---
          const scoreA = getSalesPriorityScore(a);
          const scoreB = getSalesPriorityScore(b);
          if (scoreA !== scoreB) return scoreB - scoreA;
          return a.customer_name.localeCompare(b.customer_name);

        } else if (sortMode === 'fukuoka') {
          // --- 3. 福岡営業順 ---
          const aFukuoka = a.region === '福岡県';
          const bFukuoka = b.region === '福岡県';
          
          if (aFukuoka && !bFukuoka) return -1;
          if (!aFukuoka && bFukuoka) return 1;

          // 同じ地域グループ内では今日営業順ロジックを適用
          const scoreA = getSalesPriorityScore(a);
          const scoreB = getSalesPriorityScore(b);
          if (scoreA !== scoreB) return scoreB - scoreA;
          return a.customer_name.localeCompare(b.customer_name);
        }

        return 0;
      });
  }, [customers, searchQuery, filters, sortMode, selectedCast, todayStr]);

  if (!isLoaded) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 text-blue-500 font-black">
        LOADING...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white p-5 sticky top-0 z-10 shadow-sm border-b">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-black text-gray-900">営業ダッシュボード</h1>
          <button onClick={resetFilters} className="text-[10px] font-black bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full uppercase tracking-widest active:bg-gray-200">
            Reset All
          </button>
        </div>

        {/* 表示切り替え（店長・キャストモード） */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1 h-3 bg-red-500 rounded-full"></span>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">表示切り替え</h3>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedCast('')}
              className={`whitespace-nowrap px-5 py-2 rounded-xl text-xs font-black transition-all ${
                selectedCast === '' ? 'bg-red-500 text-white shadow-lg' : 'bg-gray-100 text-gray-400'
              }`}
            >
              👑 全体（店長）
            </button>
            {allCasts.map(cast => (
              <button
                key={cast}
                onClick={() => setSelectedCast(cast)}
                className={`whitespace-nowrap px-5 py-2 rounded-xl text-xs font-black transition-all ${
                  selectedCast === cast ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'
                }`}
              >
                👩 {cast}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mb-6">
          <input
            type="text"
            placeholder="名前・ニックネーム検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-4 pl-12 rounded-2xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 text-gray-800"
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 absolute left-4 top-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* 並び替えセクション */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1 h-3 bg-indigo-600 rounded-full"></span>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">並び替え</h3>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-xl">
            {[
              { id: 'rank', label: 'ランク順', icon: '💎' },
              { id: 'today', label: '今日営業順', icon: '🔥' },
              { id: 'fukuoka', label: '福岡営業順', icon: '📍' }
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setSortMode(mode.id as SortMode)}
                className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all flex items-center justify-center gap-1 ${
                  sortMode === mode.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'
                }`}
              >
                <span>{mode.icon}</span>
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* フィルターセクション */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-3 bg-orange-500 rounded-full"></span>
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">攻略フィルター</h3>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <select name="phase" value={filters.phase} onChange={handleFilterChange} className="text-[11px] font-bold bg-gray-50 border-none ring-1 ring-gray-200 rounded-lg px-3 py-2 min-w-[100px] outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">フェーズ: 全て</option>
                {phases.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select name="trend" value={filters.trend} onChange={handleFilterChange} className="text-[11px] font-bold bg-gray-50 border-none ring-1 ring-gray-200 rounded-lg px-3 py-2 min-w-[100px] outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">温度変化: 全て</option>
                {trends.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select name="sales_expectation" value={filters.sales_expectation} onChange={handleFilterChange} className="text-[11px] font-bold bg-gray-50 border-none ring-1 ring-gray-200 rounded-lg px-3 py-2 min-w-[100px] outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">期待値: 全て</option>
                {expectations.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <select name="customer_rank" value={filters.customer_rank} onChange={handleFilterChange} className="text-[11px] font-bold bg-gray-50 border-none ring-1 ring-gray-200 rounded-lg px-3 py-2 min-w-[100px] outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">ランク: 全て</option>
                {ranks.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-3 bg-blue-500 rounded-full"></span>
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">条件フィルター</h3>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <select name="region" value={filters.region} onChange={handleFilterChange} className="text-[11px] font-bold bg-gray-50 border-none ring-1 ring-gray-200 rounded-lg px-3 py-2 min-w-[100px] outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">地域: 全て</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select name="occupation" value={filters.occupation} onChange={handleFilterChange} className="text-[11px] font-bold bg-gray-50 border-none ring-1 ring-gray-200 rounded-lg px-3 py-2 min-w-[100px] outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">職業: 全て</option>
                {occupations.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select name="relationship_type" value={filters.relationship_type} onChange={handleFilterChange} className="text-[11px] font-bold bg-gray-50 border-none ring-1 ring-gray-200 rounded-lg px-3 py-2 min-w-[100px] outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">関係: 全て</option>
                {relationships.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select name="spouse_status" value={filters.spouse_status} onChange={handleFilterChange} className="text-[11px] font-bold bg-gray-50 border-none ring-1 ring-gray-200 rounded-lg px-3 py-2 min-w-[100px] outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">配偶者: 全て</option>
                {spouseStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select name="nomination_route" value={filters.nomination_route} onChange={handleFilterChange} className="text-[11px] font-bold bg-gray-50 border-none ring-1 ring-gray-200 rounded-lg px-3 py-2 min-w-[100px] outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">経緯: 全て</option>
                {routes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <div className="flex justify-between items-center px-2 mb-2">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            {processedCustomers.length} Customers Found
          </span>
          <div className="flex gap-2">
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-50 px-2 py-0.5 rounded">
              {selectedCast === '' ? 'ALL MODE' : `CAST: ${selectedCast}`}
            </span>
            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded">
              {sortMode === 'rank' ? 'Rank' : (sortMode === 'today' ? 'Today' : 'Fukuoka')}
            </span>
          </div>
        </div>

        {processedCustomers.length > 0 ? (
          processedCustomers.map((customer) => {
            const isUrgent = customer.next_contact_date && customer.next_contact_date <= todayStr;
            const trendIcon = customer.trend === '上昇' ? '📈' : (customer.trend === '下降' ? '📉' : '➡️');
            const expectationColor = customer.sales_expectation === '高' ? 'text-green-600' : (customer.sales_expectation === '中' ? 'text-blue-600' : 'text-gray-400');
            
            return (
              <Link key={customer.id} href={`/customer/${customer.id}`}>
                <div className={`bg-white p-5 rounded-3xl shadow-sm border-2 transition-all flex flex-col gap-3 relative overflow-hidden ${
                  isUrgent ? 'border-red-500' : 'border-transparent'
                }`}>
                  {isUrgent && (
                    <div className="absolute top-0 left-0 px-3 py-1 bg-red-500 text-white text-[10px] font-black uppercase tracking-tighter rounded-br-xl">
                      TO-DO TODAY
                    </div>
                  )}

                  <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl font-black text-white text-xs ${
                    customer.customer_rank === 'S' ? 'bg-gradient-to-br from-yellow-400 to-orange-600' :
                    customer.customer_rank === 'A' ? 'bg-gradient-to-br from-red-400 to-pink-600' :
                    customer.customer_rank === 'B' ? 'bg-gradient-to-br from-blue-400 to-indigo-600' :
                    'bg-gray-400'
                  }`}>
                    {customer.customer_rank}
                  </div>

                  <div className="flex justify-between items-start mt-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-gray-900">
                          {customer.nickname || customer.customer_name}
                        </span>
                        <span className="text-sm">{trendIcon}</span>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-2">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-black">
                          {customer.phase}
                        </span>
                        <span className={`text-[10px] font-black uppercase ${expectationColor}`}>
                          期待値: {customer.sales_expectation}
                        </span>
                      </div>

                      <div className="mt-3 bg-gray-50 p-3 rounded-xl border-l-4 border-blue-500">
                        <p className="text-xs font-bold text-gray-700 leading-tight italic line-clamp-1">
                          「{customer.diagnosis.recommendedMemo}」
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="text-center py-20">
            <div className="text-4xl mb-4 text-gray-300">🍃</div>
            <div className="text-gray-400 font-bold text-lg uppercase">No Matches Found</div>
            <button onClick={resetFilters} className="mt-4 text-blue-600 font-bold text-sm underline">
              Clear All Filters & Reset Sort
            </button>
          </div>
        )}
      </main>

      <Link href={`/new${selectedCast ? `?cast=${encodeURIComponent(selectedCast)}` : ''}`}>
        <button className="fixed bottom-8 right-6 w-16 h-16 bg-blue-600 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:bg-blue-700 transition-transform active:scale-90 z-30">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </Link>
    </div>
  );
}
