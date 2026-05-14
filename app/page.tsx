'use client'

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useCustomers } from '@/hooks/useCustomers'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import { REGIONS } from '@/types'
import Link from 'next/link'
import PageNav from '@/components/PageNav'
import UserChip from '@/components/UserChip'
import BottomNav from '@/components/BottomNav'
import NotificationBell from '@/components/NotificationBell'
import Avatar, { type CustomerRank as AvatarCustomerRank } from '@/components/ui/Avatar'
import { useViewMode } from '@/hooks/useViewMode'

// ─── ⚡ 動的読み込み（初期バンドルから外して初回表示を高速化） ────
//  これらは「条件付き表示」または「重い」コンポーネント。
//  必要になったタイミング（モーダル開く・スクロール・ロール判定後等）に
//  遅延ロードすることで初期 JS のサイズを大幅削減。
//  2026-05-14 ホーム要素削除済み: AnnouncementBanner / BirthdayReminder /
//  SalesAlertBanner / CastHomeDashboard / AdminHomeDashboard / PushSubscriptionButton /
//  SalesListExportModal はすべて /home に集約。
//  お知らせはヘッダーの NotificationBell から見る。
const CustomerDetailPanel = dynamic(() => import('@/components/CustomerDetailPanel'), { ssr: false, loading: () => null })
const CustomerForm = dynamic(() => import('@/components/CustomerForm'), { ssr: false, loading: () => null })

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'

// 2026-05-14: 旧 rankStyle マップは Avatar コンポーネントの customerRank バッジに統合済みのため撤去。
// Avatar が S=深紅 / A=濃ピンク / B=淡ピンク / C=極淡 の 4 段階を一元管理する。

export default function CustomerList() {
  const { customers, isLoaded, addCustomer } = useCustomers()
  const { isPC, toggle, ready } = useViewMode()
  const [isAdmin, setIsAdmin] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // 顧客詳細パネルの権限切替用に admin/owner だけ取得する。
  // ホーム要素は /home に集約したためキャスト用 state は廃止。
  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', user.id)
          .single()
        setIsAdmin(profile?.role === 'admin' || profile?.role === 'owner')
      }
    }
    checkRole()
  }, [supabase])
  const [searchTerm, setSearchTerm] = useState('')
  const [castFilter, setCastFilter] = useState('')
  const [rankFilter, setCustomerRankFilter] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('')
  const [nominationFilter, setNominationFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [contactDaysFilter, setContactDaysFilter] = useState('')
  const [visitDaysFilter, setVisitDaysFilter] = useState('')
  const [staffFilter, setStaffFilter] = useState('')
  const [incompleteFilter, setIncompleteFilter] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'rank' | 'lastVisit' | 'nomination'>('name')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(true)
  // モバイル専用: 検索フィルターはデフォルト開
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(true)
  // モバイルの折りたたみ閉じバーで「絞り込みN件」を出すための件数
  const activeFilterCount = useMemo(() => {
    return [
      castFilter, rankFilter, phaseFilter, nominationFilter, regionFilter,
      contactDaysFilter, visitDaysFilter, staffFilter, incompleteFilter,
    ].filter(v => v !== '' && v !== null && v !== undefined).length + (searchTerm ? 1 : 0)
  }, [searchTerm, castFilter, rankFilter, phaseFilter, nominationFilter, regionFilter, contactDaysFilter, visitDaysFilter, staffFilter, incompleteFilter])

  // 未登録チェック対象フィールド（血液型・誕生日・趣味・NG項目・注意点・メモ以外）
  const incompleteFields: { key: string; label: string }[] = [
    { key: 'age_group', label: '年代' },
    { key: 'region', label: '地域' },
    { key: 'spouse_status', label: '配偶者' },
    { key: 'occupation', label: '職業' },
    { key: 'cast_type', label: 'キャストタイプ' },
    { key: 'nomination_route', label: '指名経緯' },
    { key: 'nomination_status', label: '指名状況' },
    { key: 'phase', label: 'フェーズ' },
    { key: 'customer_rank', label: 'ランク' },
    { key: 'sales_expectation', label: '売上期待' },
    { key: 'trend', label: 'トレンド' },
    { key: 'favorite_type', label: '好みタイプ' },
    { key: 'score', label: '色恋関係値' },
  ]

  const hasIncomplete = (customer: Record<string, unknown>) => {
    return incompleteFields.some(f => {
      const v = customer[f.key]
      return v === null || v === undefined || v === '' || v === 0
    })
  }

  const getIncompleteLabels = (customer: Record<string, unknown>) => {
    return incompleteFields
      .filter(f => {
        const v = customer[f.key]
        return v === null || v === undefined || v === '' || v === 0
      })
      .map(f => f.label)
  }

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
    const filtered = customers.filter(customer => {
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
      const matchesIncomplete = incompleteFilter === ''
        || (incompleteFilter === 'incomplete' && hasIncomplete(customer as unknown as Record<string, unknown>))
        || (incompleteFilter === 'complete' && !hasIncomplete(customer as unknown as Record<string, unknown>))
      return matchesSearch && matchesCast && matchesRank && matchesPhase && matchesRegion && matchesContactDays && matchesVisitDays && matchesStaff && matchesNomination && matchesIncomplete
    })

    // ソート
    const rankOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 }
    return [...filtered].sort((a, b) => {
      if (sortKey === 'rank') {
        return (rankOrder[a.customer_rank] ?? 9) - (rankOrder[b.customer_rank] ?? 9)
      }
      if (sortKey === 'lastVisit') {
        const da = a.last_contact_date ? new Date(a.last_contact_date).getTime() : 0
        const db = b.last_contact_date ? new Date(b.last_contact_date).getTime() : 0
        return db - da // 新しい順
      }
      if (sortKey === 'nomination') {
        const nOrder: Record<string, number> = { '本指名': 0, '場内': 1, 'フリー': 2 }
        return (nOrder[a.nomination_status] ?? 9) - (nOrder[b.nomination_status] ?? 9)
      }
      return (a.customer_name || '').localeCompare(b.customer_name || '', 'ja')
    })
  }, [customers, searchTerm, castFilter, rankFilter, phaseFilter, regionFilter, contactDaysFilter, visitDaysFilter, staffFilter, nominationFilter, incompleteFilter, sortKey])

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
    background: 'rgba(255,255,255,0.95)',
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: '10px 28px 10px 12px',
    fontSize: 12,
    color: C.dark,
    letterSpacing: '0.05em',
    outline: 'none',
    fontFamily: 'inherit',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(232,135,154,0.06)',
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
  const searchFilters = (
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
            background: 'rgba(255,255,255,0.95)',
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: '11px 14px 11px 38px',
            fontSize: 13,
            color: C.dark,
            letterSpacing: '0.05em',
            outline: 'none',
            fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(232,135,154,0.08)',
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
          { value: incompleteFilter, onChange: setIncompleteFilter, placeholder: '登録状況', options: ['incomplete', 'complete'], formatOption: (v: string) => v === 'incomplete' ? '未登録あり' : '全項目登録済' },
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
  const selectCustomer = (id: string) => {
    setShowNewCustomerForm(false)
    setSelectedCustomerId(id)
  }

  const CustomerCardPC = ({ customer }: { customer: typeof filteredCustomers[0] }) => {
    const isActive = selectedCustomerId === customer.id
    return (
      <button
        onClick={() => selectCustomer(customer.id)}
        className="eclat-customer-card-pc"
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: isActive
            ? 'linear-gradient(135deg, #FFF1F4 0%, #FFFAFC 100%)'
            : C.white,
          borderLeft: isActive ? `3px solid ${C.pink}` : '3px solid transparent',
          borderTop: 'none',
          borderRight: 'none',
          borderBottom: `1px solid ${C.border}`,
          padding: '14px 18px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.18s ease, padding-left 0.18s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Avatar：イニシャル円＋customerRank バッジ */}
          <Avatar
            name={customer.customer_name || '?'}
            customerRank={(customer.customer_rank ?? null) as AvatarCustomerRank}
            size="md"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 15, fontWeight: 600, color: C.dark,
              margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}>
              {customer.customer_name}
            </p>
            <p style={{
              fontSize: 10.5, color: C.pinkMuted,
              margin: '3px 0 0 0', letterSpacing: '0.05em',
            }}>
              {customer.cast_name ? `担当 ${customer.cast_name}` : '—'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
          {customer.has_customer_staff && (
            <span style={{
              fontSize: 9.5, color: '#fff',
              background: 'linear-gradient(135deg, #E8789A, #F4A5B8)',
              padding: '3px 10px',
              letterSpacing: '0.05em', fontWeight: 600,
              borderRadius: 10,
              boxShadow: '0 2px 6px rgba(232,135,154,0.22)',
            }}>お客様担当</span>
          )}
          {[customer.phase, customer.region].filter(Boolean).map((tag, i) => (
            <span key={i} style={{
              fontSize: 9.5, color: C.pinkMuted,
              border: `1px solid ${C.border}`,
              background: 'rgba(255,255,255,0.85)',
              padding: '3px 10px', letterSpacing: '0.05em',
              borderRadius: 10,
            }}>{tag}</span>
          ))}
          {incompleteFilter === 'incomplete' && (() => {
            const labels = getIncompleteLabels(customer as unknown as Record<string, unknown>)
            return labels.length > 0 ? (
              <span style={{
                fontSize: 9, color: C.danger,
                border: `1px solid ${C.pinkLight}`,
                background: '#FFEBED',
                padding: '3px 9px', letterSpacing: '0.03em',
                borderRadius: 10, fontWeight: 600,
              }}>未登録: {labels.join('・')}</span>
            ) : null
          })()}
        </div>
      </button>
    )
  }

  // ─── 顧客カード（Mobile用：フルサイズ） ─────────────────────────
  const CustomerCardMobile = ({ customer }: { customer: typeof filteredCustomers[0] }) => {
    return (
      <div
        onClick={() => setSelectedCustomerId(customer.id)}
        style={{
          display: 'block',
          background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          boxShadow: '0 8px 22px rgba(232,135,154,0.08), 0 2px 6px rgba(232,135,154,0.04)',
          textDecoration: 'none', position: 'relative', overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        <div style={{ height: 2, background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})` }} />
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Avatar：イニシャル円＋customerRank バッジ */}
            <Avatar
              name={customer.customer_name || '?'}
              customerRank={(customer.customer_rank ?? null) as AvatarCustomerRank}
              size="lg"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 17, fontWeight: 700, letterSpacing: '0.03em',
                color: C.dark, margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                {customer.customer_name}
              </p>
              {customer.nickname && customer.nickname !== customer.customer_name && (
                <p style={{
                  fontSize: 10, color: C.pink,
                  fontStyle: 'italic', letterSpacing: '0.1em',
                  margin: '3px 0 0 0',
                }}>
                  &ldquo;{customer.nickname}&rdquo;
                </p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {customer.has_customer_staff && (
              <span style={{
                fontSize: 9.5, color: '#fff',
                background: 'linear-gradient(135deg, #E8789A, #F4A5B8)',
                padding: '4px 11px',
                letterSpacing: '0.05em', fontWeight: 600,
                borderRadius: 11,
                boxShadow: '0 2px 6px rgba(232,135,154,0.22)',
              }}>お客様担当</span>
            )}
            {[customer.phase, customer.cast_name ? `担当 ${customer.cast_name}` : null, customer.region].filter(Boolean).map((tag, i) => (
              <span key={i} style={{
                fontSize: 9.5, color: C.pinkMuted,
                border: `1px solid ${C.border}`,
                background: 'rgba(255,255,255,0.85)',
                padding: '4px 11px', letterSpacing: '0.05em',
                borderRadius: 11,
              }}>{tag}</span>
            ))}
            {incompleteFilter === 'incomplete' && (() => {
              const labels = getIncompleteLabels(customer as unknown as Record<string, unknown>)
              return labels.length > 0 ? (
                <span style={{
                  fontSize: 9, color: C.danger,
                  border: `1px solid ${C.pinkLight}`,
                  background: '#FFEBED',
                  padding: '3px 9px', letterSpacing: '0.03em',
                  borderRadius: 10, fontWeight: 600,
                }}>未登録: {labels.join('・')}</span>
              ) : null
            })()}
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // PC モード：2カラム + 折りたたみ式バナー＆フィルター
  // ═══════════════════════════════════════════════════════════════════
  if (isPC) {
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 60px)', background: C.bg }}>
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
            flexShrink: 0,
          }}>
            {/* 上段: ロゴ + モード切替 + ユーザー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <Link href="/home" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} aria-label="ホームへ">
                <Image
                  src="/logo.png" alt="Éclat" width={100} height={30}
                  className="object-contain"
                  style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
                />
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ViewToggle />
                <NotificationBell />
                <UserChip />
              </div>
            </div>
            {/* ナビゲーション */}
            <PageNav />
          </div>

          {/* ─── 折りたたみ: FILTERS ─── */}
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '10px 18px',
              background: 'linear-gradient(135deg, #FFF8FA 0%, #FFFFFF 100%)',
              border: 'none', borderBottom: `1px solid ${C.border}`,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-block', width: 3, height: 11,
                background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                borderRadius: 2,
              }} />
              <span style={{
                fontSize: 9.5, letterSpacing: '0.22em',
                color: C.pink, fontWeight: 700,
              }}>
                SEARCH & FILTER
              </span>
            </span>
            <span style={{
              fontSize: 10, color: C.pinkMuted,
              transition: 'transform 0.2s',
              transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}>▼</span>
          </button>
          <div style={{
            overflow: 'hidden', transition: 'max-height 0.3s ease',
            maxHeight: filtersOpen ? '500px' : '0px',
            borderBottom: filtersOpen ? `1px solid ${C.border}` : 'none',
            flexShrink: 0,
          }}>
            <div style={{ padding: '10px 18px' }}>
              {searchFilters}
              {/* ソートボタン（pill 型） */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  { key: 'name' as const, label: '名前順' },
                  { key: 'rank' as const, label: 'ランク順' },
                  { key: 'lastVisit' as const, label: '最終連絡順' },
                  { key: 'nomination' as const, label: '指名順' },
                ]).map(s => (
                  <button
                    key={s.key}
                    onClick={() => setSortKey(s.key)}
                    style={{
                      background: sortKey === s.key
                        ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                        : 'rgba(255,255,255,0.85)',
                      color: sortKey === s.key ? C.white : C.pinkMuted,
                      border: `1px solid ${sortKey === s.key ? C.pink : C.border}`,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      padding: '6px 12px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: sortKey === s.key
                        ? '0 3px 8px rgba(232,135,154,0.28)'
                        : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 顧客数 + NEWボタン */}
          <div style={{
            padding: '10px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
            background: 'linear-gradient(135deg, #FFFAFC 0%, #FFFFFF 100%)',
          }}>
            <p style={{
              fontSize: 10.5, letterSpacing: '0.28em',
              color: C.pink, margin: 0, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                display: 'inline-block', width: 3, height: 11,
                background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                borderRadius: 2,
              }} />
              CUSTOMERS — {filteredCustomers.length}
            </p>
            <button
              onClick={() => setShowNewCustomerForm(true)}
              style={{
                background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                color: C.white, fontSize: 11, fontWeight: 600,
                letterSpacing: '0.15em', padding: '8px 16px',
                border: `1px solid ${C.pink}`, cursor: 'pointer', fontFamily: 'inherit',
                borderRadius: 14,
                boxShadow: '0 4px 12px rgba(232,135,154,0.28)',
              }}
            >
              + NEW
            </button>
          </div>

          {/* リスト（残り全部スクロール） */}
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

        {/* ─── 右パネル：顧客詳細 or 新規登録 ─── */}
        <div style={{ flex: 1, overflowY: 'auto', background: C.bg }}>
          {showNewCustomerForm ? (
            <>
              <div style={{
                position: 'sticky', top: 0, zIndex: 10,
                background: C.headerBg,
                borderBottom: `1px solid ${C.border}`,
                padding: '10px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <button
                  onClick={() => setShowNewCustomerForm(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'transparent', border: 'none',
                    color: C.pink, fontSize: '13px', fontFamily: 'inherit',
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  <span style={{ fontSize: '16px' }}>←</span>
                  <span style={{ letterSpacing: '0.05em' }}>戻る</span>
                </button>
                <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: C.dark, fontWeight: 600 }}>
                  新規顧客登録
                </span>
                <div style={{ width: '60px' }} />
              </div>
              <CustomerForm
                inOverlay
                onCancel={() => setShowNewCustomerForm(false)}
                onSubmit={async (data) => {
                  const result = await addCustomer(data)
                  if (result) {
                    setShowNewCustomerForm(false)
                    if (result.id) setSelectedCustomerId(result.id)
                  }
                }}
              />
            </>
          ) : selectedCustomerId ? (
            <CustomerDetailPanel customerId={selectedCustomerId} isPC={true} isAdmin={isAdmin} />
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

        {/* PC でも他ページに遷移できるよう BottomNav を表示（fixed なので overlay） */}
        <BottomNav />
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
            <Link href="/home" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} aria-label="ホームへ">
              <Image
                src="/logo.png" alt="Éclat" width={120} height={36}
                className="object-contain"
                style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
              />
            </Link>
            <p style={{ fontSize: '7px', letterSpacing: '0.35em', color: C.pinkMuted, margin: '2px 0 0 0' }}>
              CUSTOMER LIST · 顧客一覧
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ViewToggle />
            <NotificationBell />
            <UserChip />
            <button
              onClick={() => setShowNewCustomerForm(true)}
              style={{
                background: `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                color: C.white, fontSize: '10px', fontWeight: 600,
                letterSpacing: '0.25em', padding: '10px 18px',
                border: `1px solid ${C.pink}`, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 12px rgba(232,120,154,0.25)',
              }}
            >
              + NEW
            </button>
          </div>
        </div>
      </div>


      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '12px 16px 0' }}>
        {/* サーチ＆フィルター（基本は表示・折りたたみ可） */}
        <div style={{
          background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          marginBottom: 12, overflow: 'hidden',
          boxShadow: '0 4px 14px rgba(232,135,154,0.06)',
        }}>
          <button
            onClick={() => setMobileFiltersOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: 'transparent', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px' }}>🔍</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: C.dark, letterSpacing: '0.1em' }}>
                SEARCH &amp; FILTER
              </span>
              {(activeFilterCount > 0) && (
                <span style={{
                  fontSize: '9px', fontWeight: 700, color: C.white,
                  background: C.pink, padding: '1px 8px', borderRadius: '10px',
                }}>{activeFilterCount}</span>
              )}
            </div>
            <span style={{
              fontSize: '10px', color: C.pinkMuted,
              transition: 'transform 0.2s',
              transform: mobileFiltersOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}>▼</span>
          </button>
          <div style={{
            overflow: 'hidden',
            maxHeight: mobileFiltersOpen ? '700px' : '0px',
            transition: 'max-height 0.3s ease',
          }}>
            <div style={{ padding: '4px 14px 10px' }}>
              {searchFilters}
              {/* ソートボタン（pill 型） */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  { key: 'name' as const, label: '名前順' },
                  { key: 'rank' as const, label: 'ランク順' },
                  { key: 'lastVisit' as const, label: '最終連絡順' },
                  { key: 'nomination' as const, label: '指名順' },
                ]).map(s => (
                  <button
                    key={s.key}
                    onClick={() => setSortKey(s.key)}
                    style={{
                      background: sortKey === s.key
                        ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                        : 'rgba(255,255,255,0.85)',
                      color: sortKey === s.key ? C.white : C.pinkMuted,
                      border: `1px solid ${sortKey === s.key ? C.pink : C.border}`,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      padding: '7px 13px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: sortKey === s.key
                        ? '0 3px 8px rgba(232,135,154,0.28)'
                        : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 顧客リスト */}
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-block', width: 3, height: 12,
            background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
            borderRadius: 2,
          }} />
          <p style={{ fontSize: 10, letterSpacing: '0.28em', color: C.pink, margin: 0, fontWeight: 700 }}>
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
            <button
              onClick={() => setShowNewCustomerForm(true)}
              style={{
                marginTop: '20px',
                fontSize: '9px', letterSpacing: '0.2em',
                color: C.pink, border: `1px solid ${C.pink}`,
                padding: '10px 24px', background: 'transparent',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              + 新規登録
            </button>
          </div>
        )}
      </div>

      {/* ─── フローティング新規登録ボタン ─── */}
      <button
        onClick={() => setShowNewCustomerForm(true)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          zIndex: 30,
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
          color: C.white,
          border: 'none',
          boxShadow: '0 4px 16px rgba(232,120,154,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          fontWeight: 300,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        +
      </button>

      <BottomNav />

      {/* ─── 新規顧客登録オーバーレイ（モバイル） ─── */}
      {showNewCustomerForm && (
        <>
          <div
            onClick={() => setShowNewCustomerForm(false)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.3)', zIndex: 100,
            }}
          />
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: C.bg, zIndex: 101,
            overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              background: C.headerBg,
              borderBottom: `1px solid ${C.border}`,
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button
                onClick={() => setShowNewCustomerForm(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'transparent', border: 'none',
                  color: C.pink, fontSize: '13px', fontFamily: 'inherit',
                  cursor: 'pointer', padding: 0,
                }}
              >
                <span style={{ fontSize: '16px' }}>←</span>
                <span style={{ letterSpacing: '0.05em' }}>戻る</span>
              </button>
              <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: C.dark, fontWeight: 600 }}>
                新規顧客登録
              </span>
              <div style={{ width: '60px' }} />
            </div>
            <CustomerForm
              inOverlay
              onCancel={() => setShowNewCustomerForm(false)}
              onSubmit={async (data) => {
                const result = await addCustomer(data)
                if (result) {
                  setShowNewCustomerForm(false)
                  // 作成した顧客の詳細を表示
                  if (result.id) setSelectedCustomerId(result.id)
                }
              }}
            />
          </div>
        </>
      )}

      {/* ─── 顧客詳細オーバーレイパネル（モバイル） ─── */}
      {selectedCustomerId && (
        <>
          <div
            onClick={() => setSelectedCustomerId(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.3)', zIndex: 100,
            }}
          />
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: C.bg, zIndex: 101,
            overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              background: C.headerBg,
              borderBottom: `1px solid ${C.border}`,
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button
                onClick={() => setSelectedCustomerId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'transparent', border: 'none',
                  color: C.pink, fontSize: '13px', fontFamily: 'inherit',
                  cursor: 'pointer', padding: 0,
                }}
              >
                <span style={{ fontSize: '16px' }}>←</span>
                <span style={{ letterSpacing: '0.05em' }}>一覧に戻る</span>
              </button>
            </div>
            <CustomerDetailPanel customerId={selectedCustomerId} isPC={false} isAdmin={isAdmin} />
          </div>
        </>
      )}

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
