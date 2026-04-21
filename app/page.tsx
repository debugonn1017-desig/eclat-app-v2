'use client'

import { useState, useMemo } from 'react'
import { useCustomers } from '@/hooks/useCustomers'
import Link from 'next/link'
import Image from 'next/image'
import { REGIONS } from '@/types'
import UserChip from '@/components/UserChip'

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'

// ─── ランク別カラーマップ ─────────────────────────────────────────
const rankStyle: Record<string, { color: string; bg: string; border: string }> = {
  S: { color: C.white, bg: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`, border: C.pink },
  A: { color: C.pink, bg: 'rgba(242,131,155,0.12)', border: C.pink },
  B: { color: C.pinkMuted, bg: 'rgba(242,131,155,0.06)', border: C.pinkLight },
  C: { color: '#B0A0A5', bg: C.tagBg, border: C.border },
}

export default function CustomerList() {
  const { customers, isLoaded } = useCustomers()
  const [searchTerm, setSearchTerm] = useState('')
  const [castFilter, setCastFilter] = useState('')
  const [rankFilter, setCustomerRankFilter] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [contactDaysFilter, setContactDaysFilter] = useState('')
  const [visitDaysFilter, setVisitDaysFilter] = useState('')

  const calcDaysAgo = (dateStr: string | null | undefined): number | null => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  }

  const matchesDaysFilter = (days: number | null, filter: string): boolean => {
    if (!filter) return true
    if (days === null) return filter === 'none'
    const n = Number(filter)
    if (filter === 'none') return days === null
    if (filter === '30+') return days >= 30
    return days >= n
  }

  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const nameMatch = (customer.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase())
      const nickMatch = (customer.nickname || '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesSearch = searchTerm === '' || nameMatch || nickMatch
      const matchesCast = castFilter === '' || customer.cast_name === castFilter
      const matchesRank = rankFilter === '' || customer.customer_rank === rankFilter
      const matchesPhase = phaseFilter === '' || customer.phase === phaseFilter
      const matchesRegion = regionFilter === '' || customer.region === regionFilter
      const contactDays = calcDaysAgo(customer.last_contact_date)
      const matchesContactDays = matchesDaysFilter(contactDays, contactDaysFilter)
      const visitDays = calcDaysAgo(customer.first_visit_date)
      const matchesVisitDays = matchesDaysFilter(visitDays, visitDaysFilter)
      return matchesSearch && matchesCast && matchesRank && matchesPhase && matchesRegion && matchesContactDays && matchesVisitDays
    })
  }, [customers, searchTerm, castFilter, rankFilter, phaseFilter, regionFilter, contactDaysFilter, visitDaysFilter])

  const uniqueCasts = useMemo(() => {
    return Array.from(new Set(customers.map(c => c.cast_name).filter(Boolean)))
  }, [customers])

  const uniqueRanks = ['S', 'A', 'B', 'C']
  const uniquePhases = ['認知', '場内', '初指名', 'リピート', '安定', '来店操作可能']

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{
          width: '32px', height: '32px',
          border: `1px solid ${C.pink}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const selectBase: React.CSSProperties = {
    width: '100%',
    background: C.white,
    border: `1px solid ${C.border}`,
    padding: '10px 28px 10px 12px',
    fontSize: '12px',
    color: C.dark,
    letterSpacing: '0.05em',
    outline: 'none',
    fontFamily: 'inherit',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '60px' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: C.headerBg,
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: '420px', margin: '0 auto',
          padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ textAlign: 'left' }}>
            <Image
              src="/logo.png"
              alt="Éclat"
              width={120}
              height={36}
              priority
              className="object-contain"
              style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
            <p style={{ fontSize: '7px', letterSpacing: '0.35em', color: C.pinkMuted, margin: '2px 0 0 0' }}>
              CUSTOMER LIST
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserChip />
            <Link
              href="/new"
              style={{
                background: `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                color: C.dark,
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.25em',
                padding: '10px 18px',
                border: `1px solid ${C.pink}`,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(232,135,155,0.25)',
              }}
            >
              + NEW
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '20px 16px' }}>
        {/* ─── セクションタイトル ─── */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ height: '1px', width: '32px', background: `linear-gradient(90deg, ${C.pink}, transparent)` }} />
            <p style={{ fontSize: '9px', letterSpacing: '0.35em', color: C.pink, margin: 0 }}>
              SEARCH &amp; FILTER
            </p>
          </div>
        </div>

        {/* ─── 検索 ─── */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <svg
            width="14" height="14"
            viewBox="0 0 24 24" fill="none"
            stroke={C.pinkMuted} strokeWidth="1.5"
            style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
          >
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="名前・ニックネームで検索"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="eclat-input"
            style={{
              width: '100%',
              background: C.white,
              border: `1px solid ${C.border}`,
              padding: '12px 14px 12px 38px',
              fontSize: '13px',
              color: C.dark,
              letterSpacing: '0.05em',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ─── フィルタ ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '24px' }}>
          {[
            {
              value: castFilter,
              onChange: setCastFilter,
              placeholder: '全てのキャスト',
              options: uniqueCasts,
            },
            {
              value: rankFilter,
              onChange: setCustomerRankFilter,
              placeholder: '全てのランク',
              options: uniqueRanks,
              formatOption: (r: string) => `RANK ${r}`,
            },
            {
              value: phaseFilter,
              onChange: setPhaseFilter,
              placeholder: '全ての関係性',
              options: uniquePhases,
            },
            {
              value: regionFilter,
              onChange: setRegionFilter,
              placeholder: '全ての地域',
              options: [...REGIONS],
            },
          ].map((f, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <select
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                className="eclat-input"
                style={selectBase}
              >
                <option value="">{f.placeholder}</option>
                {f.options.map((opt: string) => (
                  <option key={opt} value={opt}>
                    {f.formatOption ? f.formatOption(opt) : opt}
                  </option>
                ))}
              </select>
              <svg
                width="10" height="10"
                viewBox="0 0 24 24" fill="none"
                stroke={C.pinkMuted} strokeWidth="2"
                style={{
                  position: 'absolute', right: '12px', top: '50%',
                  transform: 'translateY(-50%)', pointerEvents: 'none',
                }}
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          ))}

          {/* 経過日数フィルター */}
          {[
            { value: contactDaysFilter, onChange: setContactDaysFilter, label: '最終連絡からの経過' },
            { value: visitDaysFilter, onChange: setVisitDaysFilter, label: '最終入店からの経過' },
          ].map((f, i) => (
            <div key={`days-${i}`} style={{ position: 'relative' }}>
              <select
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                className="eclat-input"
                style={selectBase}
              >
                <option value="">{f.label}</option>
                <option value="3">3日以上</option>
                <option value="7">7日以上</option>
                <option value="14">14日以上</option>
                <option value="30+">30日以上</option>
                <option value="none">未設定</option>
              </select>
              <svg
                width="10" height="10"
                viewBox="0 0 24 24" fill="none"
                stroke={C.pinkMuted} strokeWidth="2"
                style={{
                  position: 'absolute', right: '12px', top: '50%',
                  transform: 'translateY(-50%)', pointerEvents: 'none',
                }}
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          ))}
        </div>

        {/* ─── 顧客リスト ─── */}
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ height: '1px', width: '32px', background: `linear-gradient(90deg, ${C.pink}, transparent)` }} />
          <p style={{ fontSize: '9px', letterSpacing: '0.35em', color: C.pink, margin: 0 }}>
            CUSTOMERS &mdash; {filteredCustomers.length}
          </p>
        </div>

        {filteredCustomers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredCustomers.map((customer) => {
              const rs = rankStyle[customer.customer_rank] ?? rankStyle.C
              return (
                <Link
                  key={customer.id}
                  href={`/customer/${customer.id}`}
                  style={{
                    display: 'block',
                    background: C.white,
                    border: `1px solid ${C.border}`,
                    boxShadow: '0 2px 12px rgba(232,135,155,0.05)',
                    textDecoration: 'none',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})` }} />
                  <div style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: '18px', fontWeight: 400,
                          letterSpacing: '0.05em', color: C.dark,
                          margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {customer.customer_name}
                        </p>
                        {customer.nickname && customer.nickname !== customer.customer_name && (
                          <p style={{
                            fontSize: '10px', color: C.pinkMuted,
                            fontStyle: 'italic', letterSpacing: '0.1em',
                            margin: '2px 0 0 0',
                          }}>
                            &ldquo;{customer.nickname}&rdquo;
                          </p>
                        )}
                      </div>
                      <div style={{
                        background: rs.bg,
                        color: rs.color,
                        border: `1px solid ${rs.border}`,
                        fontSize: '10px',
                        letterSpacing: '0.15em',
                        padding: '4px 10px',
                        minWidth: '48px',
                        textAlign: 'center',
                        flexShrink: 0,
                      }}>
                        <div style={{ fontSize: '6px', letterSpacing: '0.3em', opacity: 0.6 }}>RANK</div>
                        <div style={{ fontSize: '13px', fontWeight: 400 }}>{customer.customer_rank ?? '—'}</div>
                      </div>
                    </div>

                    {/* タグ */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
                      {[
                        customer.phase,
                        customer.cast_name ? `担当: ${customer.cast_name}` : null,
                        customer.region,
                      ].filter(Boolean).map((tag, i) => (
                        <span key={i} style={{
                          fontSize: '9px',
                          color: C.pinkMuted,
                          border: `1px solid ${C.border}`,
                          background: C.tagBg,
                          padding: '3px 10px',
                          letterSpacing: '0.08em',
                        }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', letterSpacing: '0.3em', color: C.pinkMuted, margin: 0 }}>
              NO CUSTOMERS FOUND
            </p>
            <Link
              href="/new"
              style={{
                display: 'inline-block', marginTop: '20px',
                fontSize: '9px', letterSpacing: '0.2em',
                color: C.pink, border: `1px solid ${C.pink}`,
                padding: '10px 24px', textDecoration: 'none',
              }}
            >
              + 新規登録
            </Link>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .eclat-input:focus {
          border-color: ${C.pink} !important;
          box-shadow: 0 0 0 2px rgba(232,135,155,0.18);
        }
        a:active { opacity: 0.85; }
      `}</style>
    </div>
  )
}
