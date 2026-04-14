'use client'

import { useState, useMemo } from 'react'
import { useCustomers } from '@/hooks/useCustomers'
import Link from 'next/link'
import Image from 'next/image'
import { REGIONS } from '@/types'

export default function CustomerList() {
  const { customers, isLoaded } = useCustomers()
  const [searchTerm, setSearchTerm] = useState('')
  const [castFilter, setCastFilter] = useState('')
  const [rankFilter, setCustomerRankFilter] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')

  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const nameMatch = (customer.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase())
      const nickMatch = (customer.nickname || '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesSearch = searchTerm === '' || nameMatch || nickMatch
      
      const matchesCast = castFilter === '' || customer.cast_name === castFilter
      const matchesRank = rankFilter === '' || customer.customer_rank === rankFilter
      const matchesPhase = phaseFilter === '' || customer.phase === phaseFilter
      const matchesRegion = regionFilter === '' || customer.region === regionFilter

      return matchesSearch && matchesCast && matchesRank && matchesPhase && matchesRegion
    })
  }, [customers, searchTerm, castFilter, rankFilter, phaseFilter, regionFilter])

  const uniqueCasts = useMemo(() => {
    return Array.from(new Set(customers.map(c => c.cast_name).filter(Boolean)))
  }, [customers])

  const uniqueRanks = ['S', 'A', 'B', 'C']
  const uniquePhases = ['興味付け', '接点維持', '距離を縮める', '来店を増やす', '固定化する']

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-24">
      {/* ヘッダー */}
      <div className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-20 px-6 py-2 md:py-3">
        <div className="max-w-[420px] mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Image 
              src="/logo.png" 
              alt="Éclat" 
              width={170} 
              height={50} 
              priority
              className="object-contain w-[140px] md:w-[170px]"
            />
          </div>
          <Link 
            href="/new" 
            className="eclat-gradient text-white text-[10px] md:text-xs font-black px-4 md:px-6 py-2 md:py-3 rounded-full shadow-lg shadow-primary/30 active:scale-95 transition-all ring-4 ring-primary/5"
          >
            新規登録
          </Link>
        </div>
      </div>

      <div className="max-w-[420px] mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
        {/* 検索・フィルタ */}
        <div className="space-y-3 md:space-y-4">
          <div className="relative group">
            <input
              type="text"
              placeholder="名前やニックネームで検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-primary/5 rounded-2xl p-4 md:p-5 pl-12 md:pl-14 text-sm md:text-base shadow-soft focus:ring-2 focus:ring-primary/20 focus:bg-white outline-none transition-all placeholder:text-gray-300 font-medium"
            />
            <svg className="w-5 h-5 md:w-6 md:h-6 text-primary/30 absolute left-4 md:left-5 top-4 md:top-5 group-focus-within:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <div className="relative">
              <select
                value={castFilter}
                onChange={(e) => setCastFilter(e.target.value)}
                className="w-full bg-white border border-primary/5 rounded-xl md:rounded-2xl p-3 md:p-4 text-[11px] md:text-sm shadow-soft appearance-none focus:ring-2 focus:ring-primary/20 outline-none text-gray-600 font-bold cursor-pointer"
              >
                <option value="">全てのキャスト</option>
                {uniqueCasts.map(cast => (
                  <option key={cast} value={cast}>{cast}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary/40">
                <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>

            <div className="relative">
              <select
                value={rankFilter}
                onChange={(e) => setCustomerRankFilter(e.target.value)}
                className="w-full bg-white border border-primary/5 rounded-xl md:rounded-2xl p-3 md:p-4 text-[11px] md:text-sm shadow-soft appearance-none focus:ring-2 focus:ring-primary/20 outline-none text-gray-600 font-bold cursor-pointer"
              >
                <option value="">全てのランク</option>
                {uniqueRanks.map(rank => (
                  <option key={rank} value={rank}>ランク {rank}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary/40">
                <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>

            <div className="relative">
              <select
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
                className="w-full bg-white border border-primary/5 rounded-xl md:rounded-2xl p-3 md:p-4 text-[11px] md:text-sm shadow-soft appearance-none focus:ring-2 focus:ring-primary/20 outline-none text-gray-600 font-bold cursor-pointer"
              >
                <option value="">全てのフェーズ</option>
                {uniquePhases.map(phase => (
                  <option key={phase} value={phase}>{phase}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary/40">
                <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>

            <div className="relative">
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="w-full bg-white border border-primary/5 rounded-xl md:rounded-2xl p-3 md:p-4 text-[11px] md:text-sm shadow-soft appearance-none focus:ring-2 focus:ring-primary/20 outline-none text-gray-600 font-bold cursor-pointer"
              >
                <option value="">全ての地域</option>
                {REGIONS.map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary/40">
                <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>
        </div>

        {/* 顧客リスト */}
        <div className="space-y-4 md:space-y-5">
          <p className="text-[10px] md:text-[11px] font-black text-primary-light tracking-widest uppercase ml-1 opacity-80">Customer List — {filteredCustomers.length}</p>
          
          {filteredCustomers.length > 0 ? (
            filteredCustomers.map((customer) => (
              <Link 
                key={customer.id} 
                href={`/customer/${customer.id}`} 
                className="block eclat-card p-5 md:p-7 border border-white hover:border-primary/10 active:scale-[0.98] transition-all relative overflow-hidden group shadow-md"
              >
                <div className="absolute top-0 right-0 w-20 md:w-24 h-20 md:h-24 bg-primary/5 rounded-full -mr-10 md:-mr-12 -mt-10 md:-mt-12 group-hover:scale-110 transition-transform duration-500"></div>
                
                <div className="flex items-start justify-between mb-4 md:mb-5 relative z-10">
                  <div className="flex flex-col">
                    <span className="text-xl md:text-2xl font-black text-gray-800 leading-tight tracking-tight mb-1 group-hover:text-primary transition-colors">
                      {customer.customer_name}
                    </span>
                    <span className="text-xs md:text-sm font-bold text-primary-light/80">
                      {customer.nickname ? `「${customer.nickname}」` : 'ニックネームなし'}
                    </span>
                  </div>
                  <div className={`px-4 md:px-5 py-1.5 md:py-2 rounded-full text-[9px] md:text-[11px] font-black shadow-sm ring-2 ring-white ${
                    customer.customer_rank === 'S' ? 'bg-yellow-400 text-white shadow-yellow-200/50' : 
                    customer.customer_rank === 'A' ? 'eclat-gradient text-white shadow-primary/20' : 
                    customer.customer_rank === 'B' ? 'bg-primary-light text-white' : 
                    'bg-gray-200 text-gray-500'
                  }`}>
                    RANK {customer.customer_rank}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 md:gap-3 mt-4 md:mt-6 text-[9px] md:text-[10px] font-extrabold relative z-10">
                  <div className="bg-gray-50/80 text-gray-500 p-2 md:p-3 rounded-xl flex items-center justify-center border border-gray-100">
                    担当: {customer.cast_name || '未設定'}
                  </div>
                  <div className="bg-gray-50/80 text-gray-500 p-2 md:p-3 rounded-xl flex items-center justify-center border border-gray-100">
                    {customer.region || '地域未設定'}
                  </div>
                  <div className="bg-primary/5 text-primary p-2 md:p-3 rounded-xl flex items-center justify-center col-span-2 border border-primary/10">
                    {customer.phase || 'フェーズ不明'}
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="py-20 md:py-24 text-center space-y-4 md:space-y-5">
              <div className="text-5xl md:text-6xl opacity-20 grayscale">🌸</div>
              <p className="text-primary/40 font-black text-xs md:text-sm tracking-[0.2em]">NO CUSTOMERS FOUND</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
