'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useCustomers } from '@/hooks/useCustomers';
import { diagnoseCustomer } from '@/lib/diagnosis';

export default function CustomerListPage() {
  const { customers, isLoaded } = useCustomers();
  const [searchQuery, setSearchQuery] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  const processedCustomers = useMemo(() => {
    return customers
      .map((c) => ({
        ...c,
        diagnosis: diagnoseCustomer(c),
      }))
      .filter((c) =>
        c.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.nickname.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        const aUrgent = a.next_contact_date && a.next_contact_date <= todayStr;
        const bUrgent = b.next_contact_date && b.next_contact_date <= todayStr;
        if (aUrgent && !bUrgent) return -1;
        if (!aUrgent && bUrgent) return 1;

        const priorityScore = { 高: 3, 中: 2, 低: 1 };
        const scoreA = priorityScore[a.diagnosis.priority];
        const scoreB = priorityScore[b.diagnosis.priority];
        if (scoreA !== scoreB) return scoreB - scoreA;

        const rankScore = { S: 4, A: 3, B: 2, C: 1 };
        return rankScore[b.customer_rank] - rankScore[a.customer_rank];
      });
  }, [customers, searchQuery, todayStr]);

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
        <h1 className="text-2xl font-black text-gray-900">営業ダッシュボード</h1>
        <div className="mt-4 relative">
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
      </header>

      <main className="p-4 space-y-4">
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
            <div className="text-gray-400 font-bold text-lg uppercase">All Caught Up!</div>
          </div>
        )}
      </main>

      <Link href="/new">
        <button className="fixed bottom-8 right-6 w-16 h-16 bg-blue-600 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:bg-blue-700 transition-transform active:scale-90 z-30">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </Link>
    </div>
  );
}
