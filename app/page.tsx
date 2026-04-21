'use client'

import { useState, useMemo } from 'react'
import { useCustomers } from '@/hooks/useCustomers'
import Link from 'next/link'
import Image from 'next/image'
import { REGIONS } from '@/types'
import PageNav from '@/components/PageNav'
import UserChip from '@/components/UserChip'
import CustomerDetailPanel from '@/components/CustomerDetailPanel'
import BottomNav from '@/components/BottomNav'
import { useViewMode } from '@/hooks/useViewMode'

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'

// ─── ランク別カラーマップ ─────────────────────────────────────────
const rankStyle: Record<string, { color: string; bg: string; border: string }> = {
  S: { color: C.white, bg: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`, border: C.pink },
  A: { color: C.pink, bg: 'rgba(232,120,154,0.12)', border: C.pink },
  B: { color: C.pinkMuted, bg: 'rgba(232,120,154,0.06)', border: C.pinkLight },
  C: { color: '#B0A0A5', bg: C.tagBg, border: C.border },
}

export default function CustomerList() {
  const { customers, isLoaded } = useCustomers()
  const { isPC, toggle, ready } = useViewMode()
  const [searchTerm, setSearchTerm] = useState('')
  const [castFilter, setCastFilter] = useState('')
  const [rankFilter, setCustomerRankFilter] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('')
  const [nominationFilter, setNominationFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [contactDaysFilter, setContactDaysFilter] = useState('')
  const [visitDaysFilter, setVisitDaysFilter] = useState('')
  const [staffFilter, setStaffFilter] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  const calcDaysAgo = (dateStr: string | null | undefined): number | null => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  }

  const matchesDaysFilter = (days: number | null, filter: string): boolean => {
    if (!filter) return true
    if (days === null) return filter === 'none'
    if (filter === 'none') return days === null
    if (filter === '30+') return days >= 30
    return days >= Number(filter)
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
      const matchesStaff = staffFilter === ''
        || (staffFilter === 'yes' && customer.has_customer_staff)
        || (staffFilter === 'no' && !customer.has_customer_staff)
      const matchesNomination = nominationFilter === '' || customer.nomination_status === nominationFilter
      return matchesSearch && matchesCast && matchesRank && matchesPhase && matchesRegion && matchesContactDays && matchesVisitDays && matchesStaff && matchesNomination
    })
  }, [customers, searchTerm, castFilter, rankFilter, phaseFilter, regionFilter, contactDaysFilter, visitDaysFilter, staffFilter, nominationFilter])

  const uniqueCasts = useMemo(() => {
    return Array.from(new Set(customers.map(c => c.cast_name).filter(Boolean)))
  }, [customers])

  const uniqueRanks = ['S', 'A', 'B', 'C']
  const uniquePhases = ['認知', '場内', '初指名', 'リピート', '安定', '来店操作可能']

  if (!isLoaded || !ready) {
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

  // ─── ビューモード切替ボタン ────────────────────────────────────────
  const ViewToggle = () => (
    <button
      onClick={toggle}
      style={{
        background: isPC
          ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
          : C.white,
        border: `1px solid ${C.pink}`,
        color: isPC ? C.white : C.pink,
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.15em',
        padding: '8px 14px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
      }}
    >
      {isPC ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
          </svg>
          MOBILE
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          PC
        </>
      )}
    </button>
  )

  // ─── 検索＆フィルターUI ─────────────────────────────────────────
  const SearchFilters = () => (
    <>
      {/* 検索 */}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
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
            padding: '10px 14px 10px 38px',
            fontSize: '13px',
            color: C.dark,
            letterSpacing: '0.05em',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* フィルタ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
        {[
          { value: castFilter, onChange: setCastFilter, placeholder: '全キャスト', options: uniqueCasts },
          { value: rankFilter, onChange: setCustomerRankFilter, placeholder: '全ランク', options: uniqueRanks, formatOption: (r: string) => `RANK ${r}` },
          { value: nominationFilter, onChange: setNominationFilter, placeholder: '指名状況', options: ['フリー', '場内', '本指名'] },
          { value: regionFilter, onChange: setRegionFilter, placeholder: '全地域', options: [...REGIONS] },
          { value: staffFilter, onChange: setStaffFilter, placeholder: 'お客様担当', options: ['yes', 'no'], formatOption: (v: string) => v === 'yes' ? 'お客様担当あり' : 'お客様担当なし' },
        ].map((f, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="eclat-input"
              style={{ ...selectBase, padding: '8px 28px 8px 10px', fontSize: '11px' }}
            >
              <option value="">{f.placeholder}</option>
              {f.options.map((opt: string) => (
                <option key={opt} value={opt}>
                  {f.formatOption ? f.formatOption(opt) : opt}
                </option>
              ))}
            </select>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke={C.pinkMuted} strokeWidth="2"
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        ))}
        {[
          { value: contactDaysFilter, onChange: setContactDaysFilter, label: '最終連絡' },
          { value: visitDaysFilter, onChange: setVisitDaysFilter, label: '最終入店' },
        ].map((f, i) => (
          <div key={`days-${i}`} style={{ position: 'relative' }}>
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="eclat-input"
              style={{ ...selectBase, padding: '8px 28px 8px 10px', fontSize: '11px' }}
            >
              <option value="">{f.label}</option>
              <option value="3">3日以上</option>
              <option value="7">7日以上</option>
              <option value="14">14日以上</option>
              <option value="30+">30日以上</option>
              <option value="none">未設定</option>
            </select>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke={C.pinkMuted} strokeWidth="2"
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        ))}
      </div>
    </>
  )

  // ─── 顧客カード（PC用：モックアップ準拠の大きめサイズ） ──────────
  const CustomerCardPC = ({ customer }: { customer: typeof filteredCustomers[0] }) => {
    const rs = rankStyle[customer.customer_rank] ?? rankStyle.C
    const isActive = selectedCustomerId === customer.id
    return (
      <button
        onClick={() => setSelectedCustomerId(customer.id)}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: isActive ? '#FFF0F3' : C.white,
          borderLeft: isActive ? `3px solid ${C.pink}` : '3px solid transparent',
          borderTop: 'none',
          borderRight: 'none',
          borderBottom: `1px solid ${C.border}`,
          padding: '14px 18px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: '16px', fontWeight: 500, color: C.dark,
              margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {customer.customer_name}
            </p>
            <p style={{ fontSize: '11px', color: C.pinkMuted, margin: '3px 0 0 0' }}>
              {customer.cast_name ? `担当: ${customer.cast_name}` : ''}
            </p>
          </div>
          <div style={{
            background: rs.bg, color: rs.color, border: `1px solid ${rs.border}`,
            fontSize: '13px', fontWeight: 500, padding: '4px 12px', textAlign: 'center', flexShrink: 0,
            minWidth: '36px',
          }}>
            {customer.customer_rank ?? '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
          {customer.has_customer_staff && (
            <span style={{
              fontSize: '10px', color: '#fff',
              background: `linear-gradient(135deg, #E8789A, #F4A5B8)`,
              border: `1px solid ${C.pink}`,
              padding: '2px 8px', letterSpacing: '0.05em', fontWeight: 600,
            }}>お客様担当</span>
          )}
          {[customer.phase, customer.region].filter(Boolean).map((tag, i) => (
            <span key={i} style={{
              fontSize: '10px', color: C.pinkMuted,
              border: `1px solid ${C.border}`, background: C.tagBg,
              padding: '2px 8px', letterSpacing: '0.05em',
            }}>{tag}</span>
          ))}
        </div>
      </button>
    )
  }

  // ─── 顧客カード（Mobile用：フルサイズ） ─────────────────────────
  const CustomerCardMobile = ({ customer }: { customer: typeof filteredCustomers[0] }) => {
    const rs = rankStyle[customer.customer_rank] ?? rankStyle.C
    return (
      <Link
        href={`/customer/${customer.id}`}
        style={{
          display: 'block', background: C.white,
          border: `1px solid ${C.border}`,
          boxShadow: '0 2px 12px rgba(232,135,155,0.05)',
          textDecoration: 'none', position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})` }} />
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: '18px', fontWeight: 400, letterSpacing: '0.05em', color: C.dark,
                margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {customer.customer_name}
              </p>
              {customer.nickname && customer.nickname !== customer.customer_name && (
                <p style={{ fontSize: '10px', color: C.pinkMuted, fontStyle: 'italic', letterSpacing: '0.1em', margin: '2px 0 0 0' }}>
                  &ldquo;{customer.nickname}&rdquo;
                </p>
              )}
            </div>
            <div style={{
              background: rs.bg, color: rs.color, border: `1px solid ${rs.border}`,
              fontSize: '10px', letterSpacing: '0.15em', padding: '4px 10px',
              minWidth: '48px', textAlign: 'center', flexShrink: 0,
            }}>
              <div style={{ fontSize: '6px', letterSpacing: '0.3em', opacity: 0.6 }}>RANK</div>
              <div style={{ fontSize: '13px', fontWeight: 400 }}>{customer.customer_rank ?? '—'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
            {customer.has_customer_staff && (
              <span style={{
                fontSize: '9px', color: '#fff',
                background: `linear-gradient(135deg, #E8789A, #F4A5B8)`,
                border: `1px solid ${C.pink}`,
                padding: '3px 10px', letterSpacing: '0.08em', fontWeight: 600,
              }}>お客様担当</span>
            )}
            {[customer.phase, customer.cast_name ? `担当: ${customer.cast_name}` : null, customer.region].filter(Boolean).map((tag, i) => (
              <span key={i} style={{
                fontSize: '9px', color: C.pinkMuted,
                border: `1px solid ${C.border}`, background: C.tagBg,
                padding: '3px 10px', letterSpacing: '0.08em',
              }}>{tag}</span>
            ))}
          </div>
        </div>
      </Link>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // PC モード：2カラムレイアウト
  // ═══════════════════════════════════════════════════════════════════
  if (isPC) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: C.bg }}>
        {/* ─── 左パネル：顧客リスト ─── */}
        <div style={{
          width: '420px', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${C.border}`,
          background: C.white,
        }}>
          {/* ヘッダー */}
          <div style={{
            background: C.headerBg,
            borderBottom: `1px solid ${C.border}`,
            padding: '14px 18px',
          }}>
            {/* 上段: ロゴ + モード切替 + ユーザー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <Image
                src="/logo.png" alt="Éclat" width={100} height={30} priority
                className="object-contain"
                style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ViewToggle />
                <UserChip />
              </div>
            </div>
            {/* ナビゲーション */}
            <div style={{ marginBottom: '10px' }}>
              <PageNav />
            </div>

            {/* 下段: CUSTOMERS数 + NEWボタン */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '10px', letterSpacing: '0.3em', color: C.pink, margin: 0, fontWeight: 500 }}>
                CUSTOMERS — {filteredCustomers.length}
              </p>
              <Link
                href="/new"
                style={{
                  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  color: C.white, fontSize: '11px', fontWeight: 600,
                  letterSpacing: '0.15em', padding: '8px 16px',
                  border: `1px solid ${C.pink}`, textDecoration: 'none',
                }}
              >
                + NEW
              </Link>
            </div>
          </div>

          {/* 検索＆フィルター */}
          <div style={{ padding: '14px 18px 0' }}>
            <SearchFilters />
          </div>

          {/* リスト */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => (
                <CustomerCardPC key={customer.id} customer={customer} />
              ))
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', letterSpacing: '0.3em', color: C.pinkMuted }}>NO CUSTOMERS</p>
              </div>
            )}
          </div>
        </div>

        {/* ─── 右パネル：顧客詳細 ─── */}
        <div style={{ flex: 1, overflowY: 'auto', background: C.bg }}>
          {selectedCustomerId ? (
            <CustomerDetailPanel customerId={selectedCustomerId} isPC={true} />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', flexDirection: 'column', gap: '12px',
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={C.border} strokeWidth="1">
                <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
              </svg>
              <p style={{ fontSize: '10px', letterSpacing: '0.25em', color: C.pinkMuted }}>
                左の一覧から顧客を選択
              </p>
            </div>
          )}
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .eclat-input:focus {
            border-color: ${C.pink} !important;
            box-shadow: 0 0 0 2px rgba(232,120,154,0.18);
          }
          button:hover { opacity: 0.9; }
        `}</style>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // Mobile モード：従来のレイアウト
  // ═══════════════════════════════════════════════════════════════════
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
              src="/logo.png" alt="Éclat" width={120} height={36} priority
              className="object-contain"
              style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
            <p style={{ fontSize: '7px', letterSpacing: '0.35em', color: C.pinkMuted, margin: '2px 0 0 0' }}>
              CUSTOMER LIST
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ViewToggle />
            <UserChip />
            <Link
              href="/new"
              style={{
                background: `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                color: C.white, fontSize: '10px', fontWeight: 600,
                letterSpacing: '0.25em', padding: '10px 18px',
                border: `1px solid ${C.pink}`, textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(232,120,154,0.25)',
              }}
            >
              + NEW
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '20px 16px' }}>
        {/* セクションタイトル */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ height: '1px', width: '32px', background: `linear-gradient(90deg, ${C.pink}, transparent)` }} />
            <p style={{ fontSize: '9px', letterSpacing: '0.35em', color: C.pink, margin: 0 }}>
              SEARCH &amp; FILTER
            </p>
          </div>
        </div>

        <SearchFilters />

        {/* 顧客リスト */}
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ height: '1px', width: '32px', background: `linear-gradient(90deg, ${C.pink}, transparent)` }} />
          <p style={{ fontSize: '9px', letterSpacing: '0.35em', color: C.pink, margin: 0 }}>
            CUSTOMERS &mdash; {filteredCustomers.length}
          </p>
        </div>

        {filteredCustomers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredCustomers.map((customer) => (
              <CustomerCardMobile key={customer.id} customer={customer} />
            ))}
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

      <BottomNav />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .eclat-input:focus {
          border-color: ${C.pink} !important;
          box-shadow: 0 0 0 2px rgba(232,120,154,0.18);
        }
        a:active { opacity: 0.85; }
      `}</style>
    </div>
  )
}
