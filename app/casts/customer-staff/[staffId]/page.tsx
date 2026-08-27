'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import Spinner from '@/components/ui/Spinner'
import { C } from '@/lib/colors'

type PageTab = 'customers' | 'sales'

type CustomerRow = {
  id: string
  customer_name: string | null
  nickname: string | null
  cast_name: string | null
  nomination_status: string | null
  customer_rank: string | null
  region: string | null
  total_spent: number
  visit_count: number
  avg_per_visit: number
  last_visit_date: string | null
  monthly_sales: number
  monthly_visits: number
}

type StaffPageData = {
  staff: { id: string; display_name: string }
  month: string
  summary: { customerCount: number; monthlySales: number; monthlyVisits: number }
  customers: CustomerRow[]
}

function currentJstMonth() {
  return new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
  }).slice(0, 7)
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${year}年${monthNumber}月`
}

function yen(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency', currency: 'JPY', maximumFractionDigits: 0,
  }).format(value)
}

function shortDate(value: string | null) {
  if (!value) return '未記録'
  const [, month, day] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: 24,
  padding: '4px 9px', borderRadius: 999, border: `1px solid ${C.border}`,
  background: '#FFF9FB', color: C.pinkMuted, fontSize: 9.5, fontWeight: 700,
}

export default function CustomerStaffPage() {
  const params = useParams<{ staffId: string }>()
  const staffId = params.staffId
  const [month, setMonth] = useState(currentJstMonth)
  const [activeTab, setActiveTab] = useState<PageTab>('customers')
  const [data, setData] = useState<StaffPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/customer-staff/${encodeURIComponent(staffId)}?month=${month}`, {
        cache: 'no-store',
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error || '読み込みに失敗しました')
      setData(json as StaffPageData)
    } catch (loadError) {
      setData(null)
      setError(loadError instanceof Error ? loadError.message : '読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [month, staffId])

  useEffect(() => { void load() }, [load])

  const salesRows = useMemo(() => (
    [...(data?.customers ?? [])].sort((a, b) => (
      b.monthly_sales - a.monthly_sales || b.monthly_visits - a.monthly_visits
    ))
  ), [data?.customers])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,249,251,0.96)',
        backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '12px 16px' }}>
          <Link href="/casts" style={{ color: C.pink, fontSize: 11, textDecoration: 'none', fontWeight: 700 }}>
            ← キャスト一覧へ戻る
          </Link>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', marginTop: 10 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, color: C.pink, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em' }}>
                お客様担当
              </p>
              <h1 style={{ margin: '4px 0 0', color: C.dark, fontSize: 23, overflowWrap: 'anywhere' }}>
                {data?.staff.display_name ?? '読み込み中…'}
              </h1>
            </div>
            <span style={{ ...badgeStyle, flexShrink: 0, background: '#E7F6EF', color: '#246B55', borderColor: '#C5E6D8' }}>
              黒服専用
            </span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: '14px 14px 30px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {[
            ['担当顧客', `${data?.summary.customerCount ?? 0}人`],
            ['今月の売上', yen(data?.summary.monthlySales ?? 0)],
            ['今月の来店', `${data?.summary.monthlyVisits ?? 0}回`],
          ].map(([label, value]) => (
            <div key={label} style={{
              minWidth: 0, padding: '13px 10px', background: C.white,
              border: `1px solid ${C.border}`, borderRadius: 15,
              boxShadow: '0 5px 16px rgba(232,135,154,0.06)',
            }}>
              <p style={{ margin: 0, fontSize: 8.5, color: C.pinkMuted, fontWeight: 700 }}>{label}</p>
              <p style={{ margin: '6px 0 0', color: C.dark, fontSize: 17, fontWeight: 800, overflowWrap: 'anywhere' }}>{value}</p>
            </div>
          ))}
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
          marginTop: 14, padding: 4, borderRadius: 14,
          background: 'rgba(255,255,255,0.85)', border: `1px solid ${C.border}`,
        }}>
          {([
            ['customers', '担当顧客'],
            ['sales', '売上・来店'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} style={{
              minHeight: 40, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              background: activeTab === key ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})` : 'transparent',
              color: activeTab === key ? C.white : C.pinkMuted,
              fontSize: 11, fontWeight: 800,
            }}>{label}</button>
          ))}
        </div>

        {activeTab === 'sales' && (
          <div style={{
            marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '9px 12px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
          }}>
            <button type="button" onClick={() => setMonth(value => shiftMonth(value, -1))} style={{ border: 'none', background: 'transparent', color: C.pink, cursor: 'pointer', fontSize: 18 }}>‹</button>
            <strong style={{ color: C.dark, fontSize: 12 }}>{monthLabel(month)}</strong>
            <button type="button" onClick={() => setMonth(value => shiftMonth(value, 1))} style={{ border: 'none', background: 'transparent', color: C.pink, cursor: 'pointer', fontSize: 18 }}>›</button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '70px 0', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="sm" label="読み込み中…" />
          </div>
        ) : error ? (
          <div style={{ marginTop: 16, padding: 24, textAlign: 'center', background: C.white, border: `1px solid ${C.border}`, borderRadius: 16 }}>
            <p style={{ margin: 0, color: C.danger, fontSize: 12 }}>{error}</p>
            <button type="button" onClick={() => void load()} style={{ marginTop: 12, border: `1px solid ${C.pink}`, background: C.white, color: C.pink, padding: '8px 14px', borderRadius: 10, cursor: 'pointer' }}>
              再読み込み
            </button>
          </div>
        ) : activeTab === 'customers' ? (
          <section style={{ marginTop: 12, display: 'grid', gap: 9 }}>
            {(data?.customers ?? []).length === 0 ? (
              <Empty message="担当顧客はまだいません" />
            ) : data?.customers.map(customer => (
              <CustomerCard key={customer.id} customer={customer} mode="customers" />
            ))}
          </section>
        ) : (
          <section style={{ marginTop: 12, display: 'grid', gap: 9 }}>
            {salesRows.length === 0 ? (
              <Empty message="対象の顧客はまだいません" />
            ) : salesRows.map(customer => (
              <CustomerCard key={customer.id} customer={customer} mode="sales" />
            ))}
          </section>
        )}
      </main>
      <BottomNav />
    </div>
  )
}

function CustomerCard({ customer, mode }: { customer: CustomerRow; mode: PageTab }) {
  return (
    <Link href={`/customer/${customer.id}`} prefetch={false} style={{
      display: 'block', padding: '14px 15px', background: C.white,
      border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.pink}`,
      borderRadius: 15, textDecoration: 'none', boxShadow: '0 5px 16px rgba(232,135,154,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', color: C.dark, fontSize: 15, overflowWrap: 'anywhere' }}>
            {customer.customer_name || 'お名前未登録'}
            {customer.nickname && <small style={{ marginLeft: 6, color: C.pinkMuted, fontWeight: 500 }}>（{customer.nickname}）</small>}
          </strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
            {[customer.customer_rank ? `${customer.customer_rank}ランク` : 'ランク未設定', customer.nomination_status || '指名未設定', customer.cast_name ? `担当：${customer.cast_name}` : '担当未設定'].map(text => (
              <span key={text} style={badgeStyle}>{text}</span>
            ))}
          </div>
        </div>
        <span style={{ color: C.pink, fontSize: 18, flexShrink: 0 }}>›</span>
      </div>
      <div style={{
        marginTop: 11, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7,
      }}>
        {(mode === 'sales' ? [
          ['今月売上', yen(customer.monthly_sales)],
          ['今月来店', `${customer.monthly_visits}回`],
          ['最終来店', shortDate(customer.last_visit_date)],
        ] : [
          ['累計売上', yen(customer.total_spent)],
          ['来店回数', `${customer.visit_count}回`],
          ['最終来店', shortDate(customer.last_visit_date)],
        ]).map(([label, value]) => (
          <div key={label} style={{ minWidth: 0, padding: '9px 8px', background: '#FFF9FB', borderRadius: 10 }}>
            <small style={{ display: 'block', color: C.pinkMuted, fontSize: 8 }}>{label}</small>
            <b style={{ display: 'block', color: C.dark, fontSize: 11, marginTop: 4, overflowWrap: 'anywhere' }}>{value}</b>
          </div>
        ))}
      </div>
    </Link>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <div style={{ padding: '60px 16px', textAlign: 'center', color: C.pinkMuted, fontSize: 11 }}>
      {message}
    </div>
  )
}
