'use client'

import { useCustomers } from '@/hooks/useCustomers'
import { diagnoseCustomer } from '@/lib/diagnosis'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { Customer, CustomerVisit } from '@/types'

// ─── カラーパレット ───────────────────────────────────────────────────
const C = {
  bg: '#FBF6F2',
  dark: '#1A0F0A',
  dark2: '#2D1A10',
  gold: '#C9A84C',
  goldLight: '#E8C98A',
  goldMuted: '#9A7A50',
  border: '#E8D8CC',
  tagBg: '#FAF5F0',
  tagText: '#9A7A60',
  white: '#FFFFFF',
  danger: '#8B3A2A',
  dangerLight: '#B85A48',
}

// ─── 優先度バッジ ─────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    '高': { label: '最優先', color: '#C9A84C', bg: 'linear-gradient(160deg, #1A0F0A, #2D1A10)' },
    '中': { label: '注力', color: '#E8C98A', bg: 'linear-gradient(160deg, #2D1A10, #3D2518)' },
    '低': { label: '維持', color: '#9A7A50', bg: 'linear-gradient(160deg, #3A2A20, #2D1A10)' },
  }
  const s = map[priority] ?? map['低']
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}`,
      fontSize: '9px',
      letterSpacing: '0.25em',
      padding: '4px 12px',
      display: 'inline-block',
    }}>
      {s.label}
    </span>
  )
}

// ─── セクションヘッダー ───────────────────────────────────────────────
function SectionTitle({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ height: '1px', width: '24px', background: `linear-gradient(90deg, ${C.gold}, transparent)` }} />
        <p style={{ fontSize: '8px', letterSpacing: '0.35em', color: C.gold, margin: 0 }}>{label}</p>
      </div>
      {sub && <p style={{ fontSize: '10px', color: C.goldMuted, letterSpacing: '0.08em', marginTop: '2px', paddingLeft: '34px', margin: '2px 0 0 0' }}>{sub}</p>}
    </div>
  )
}

// ─── カード ───────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      boxShadow: '0 4px 24px rgba(180,120,80,0.06)',
    }}>
      <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight}, ${C.gold})` }} />
      <div style={{ padding: '20px' }}>
        {children}
      </div>
    </div>
  )
}

// ─── 情報行 ───────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: '9px', color: C.goldMuted, letterSpacing: '0.15em', minWidth: '88px', paddingTop: '1px' }}>{label}</span>
      <span style={{ fontSize: '12px', color: C.dark, letterSpacing: '0.05em', flex: 1 }}>{value}</span>
    </div>
  )
}

// ─── 統計ミニカード ───────────────────────────────────────────────────
function StatMini({
  label,
  value,
  sub,
  rate,
}: {
  label: string
  value: string
  sub?: string
  rate?: number
}) {
  const pct = rate !== undefined ? Math.min(100, Math.max(0, rate)) : null
  return (
    <div style={{
      flex: 1,
      padding: '12px',
      background: 'rgba(201,168,76,0.05)',
      border: '1px solid rgba(201,168,76,0.2)',
    }}>
      <p style={{ fontSize: '7px', letterSpacing: '0.3em', color: 'rgba(201,168,76,0.7)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '18px', fontWeight: 300, color: C.gold, letterSpacing: '0.05em', margin: '4px 0 0 0' }}>{value}</p>
      {sub && <p style={{ fontSize: '9px', color: 'rgba(201,168,76,0.5)', letterSpacing: '0.05em', margin: '2px 0 0 0' }}>{sub}</p>}
      {pct !== null && (
        <div style={{ marginTop: '8px', height: '2px', background: 'rgba(201,168,76,0.15)', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight})`,
            transition: 'width 0.4s ease',
          }} />
        </div>
      )}
    </div>
  )
}

// ─── LINE テンプレート (編集可能) ──────────────────────────────────
function LineTemplateEditor({
  label,
  value,
  onChange,
  onSave,
  saving,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onSave: () => void
  saving: boolean
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.gold, margin: 0 }}>{label}</p>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleCopy}
            style={{
              fontSize: '8px', letterSpacing: '0.15em',
              color: copied ? C.goldLight : C.goldMuted,
              border: `1px solid ${copied ? C.gold : C.border}`,
              padding: '3px 10px', background: 'transparent', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {copied ? 'COPIED ✓' : 'COPY'}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              fontSize: '8px', letterSpacing: '0.15em',
              color: C.dark, background: C.gold,
              border: `1px solid ${C.gold}`,
              padding: '3px 10px', cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
          >
            {saving ? '...' : 'SAVE'}
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="eclat-input"
        style={{
          width: '100%',
          background: C.tagBg,
          border: `1px solid ${C.border}`,
          padding: '14px',
          fontSize: '12px',
          color: C.dark,
          lineHeight: '1.8',
          letterSpacing: '0.03em',
          resize: 'vertical',
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ─── メイン ──────────────────────────────────────────────────────────
export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const { getCustomer, updateCustomer, deleteCustomer, getVisits, addVisit } = useCustomers()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [visits, setVisits] = useState<CustomerVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'diagnosis' | 'line' | 'visits'>('info')

  const [newVisit, setNewVisit] = useState({
    visit_date: new Date().toISOString().slice(0, 10),
    amount_spent: '',
    memo: '',
  })
  const [addingVisit, setAddingVisit] = useState(false)

  const [templates, setTemplates] = useState({
    thanks: '',
    sales: '',
    visit: '',
  })
  const [savingTemplate, setSavingTemplate] = useState<null | 'thanks' | 'sales' | 'visit'>(null)

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const c = await getCustomer(id)
    setCustomer(c)
    if (c) {
      setTemplates({
        thanks: c.recommended_line_thanks || '',
        sales: c.recommended_line_sales || '',
        visit: c.recommended_line_visit || '',
      })
      const v = await getVisits(id)
      setVisits(v)
    }
    setLoading(false)
  }, [id, getCustomer, getVisits])

  useEffect(() => {
    fetchDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading || !customer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{
          width: '32px', height: '32px',
          border: `1px solid ${C.gold}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // 診断 (既に保存済みの値を優先、無ければ動的に算出)
  const fresh = diagnoseCustomer(customer)
  const d = {
    sales_priority: customer.sales_priority || fresh.sales_priority,
    sales_objective: customer.sales_objective || fresh.sales_objective,
    recommended_tone: customer.recommended_tone || fresh.recommended_tone,
    recommended_distance: customer.recommended_distance || fresh.recommended_distance,
    recommended_contact_frequency: customer.recommended_contact_frequency || fresh.recommended_contact_frequency,
    best_time_to_contact: customer.best_time_to_contact || fresh.best_time_to_contact,
    ng_contact_time: customer.ng_contact_time || fresh.ng_contact_time,
    ng_contact_day: customer.ng_contact_day || fresh.ng_contact_day,
    warning_points: customer.warning_points || fresh.warning_points,
    important_points: customer.important_points || fresh.important_points,
    final_recommended_note: customer.final_recommended_note || fresh.final_recommended_note,
  }

  // 集計
  const totalSpent = visits.reduce((sum, v) => sum + (Number(v.amount_spent) || 0), 0)
  const visitCount = visits.length
  const visitRate = customer.monthly_target_visits
    ? (visitCount / Number(customer.monthly_target_visits)) * 100
    : undefined
  const salesRate = customer.monthly_target_sales
    ? (totalSpent / Number(customer.monthly_target_sales)) * 100
    : undefined

  const formatYen = (n: number) =>
    n.toLocaleString('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })

  // ─── アクション ─────────────────────────────────────────────────
  const handleDelete = async () => {
    const ok = window.confirm(
      `${customer.customer_name} さんを本当に削除しますか？\nこの操作は取り消せません。`
    )
    if (!ok) return
    const deleted = await deleteCustomer(id)
    if (deleted) router.push('/')
  }

  const handleAddVisit = async () => {
    if (!newVisit.visit_date) {
      alert('来店日を入力してください')
      return
    }
    setAddingVisit(true)
    const saved = await addVisit({
      customer_id: id,
      visit_date: newVisit.visit_date,
      amount_spent: Number(newVisit.amount_spent) || 0,
      memo: newVisit.memo,
    })
    if (saved) {
      setVisits((prev) => [saved, ...prev])
      setNewVisit({
        visit_date: new Date().toISOString().slice(0, 10),
        amount_spent: '',
        memo: '',
      })
    }
    setAddingVisit(false)
  }

  const handleSaveTemplate = async (key: 'thanks' | 'sales' | 'visit') => {
    setSavingTemplate(key)
    const fieldMap = {
      thanks: 'recommended_line_thanks',
      sales: 'recommended_line_sales',
      visit: 'recommended_line_visit',
    } as const
    const patch: Partial<Customer> = {
      ...customer,
      [fieldMap[key]]: templates[key],
    }
    const updated = await updateCustomer(id, patch)
    if (updated) {
      setCustomer(updated)
    }
    setSavingTemplate(null)
  }

  const tabs = [
    { id: 'info' as const, label: 'PROFILE' },
    { id: 'diagnosis' as const, label: 'STRATEGY' },
    { id: 'line' as const, label: 'LINE' },
    { id: 'visits' as const, label: 'VISITS' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '60px' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: `linear-gradient(160deg, ${C.dark} 0%, ${C.dark2} 100%)`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: '420px', margin: '0 auto',
          padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              color: C.goldMuted, fontSize: '9px', letterSpacing: '0.2em',
              padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            BACK
          </button>
          <div style={{ textAlign: 'center' }}>
            <Image
              src="/logo.png"
              alt="Éclat"
              width={100}
              height={30}
              priority
              className="object-contain"
              style={{ filter: 'brightness(1.8) sepia(1) saturate(3) hue-rotate(10deg)' }}
            />
            <p style={{ fontSize: '7px', letterSpacing: '0.35em', color: C.goldMuted, marginTop: '2px', margin: '2px 0 0 0' }}>
              CUSTOMER DETAIL
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Link
              href={`/customer/${id}/edit`}
              style={{
                border: `1px solid ${C.gold}`, color: C.gold,
                fontSize: '9px', letterSpacing: '0.2em',
                padding: '6px 10px', textDecoration: 'none',
              }}
            >
              EDIT
            </Link>
            <button
              onClick={handleDelete}
              style={{
                border: `1px solid ${C.dangerLight}`, color: C.dangerLight,
                background: 'transparent',
                fontSize: '9px', letterSpacing: '0.2em',
                padding: '6px 10px', cursor: 'pointer',
              }}
            >
              DEL
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '16px' }}>
        {/* ─── 顧客ヘッダーカード ─── */}
        <div style={{
          background: `linear-gradient(160deg, ${C.dark} 0%, ${C.dark2} 100%)`,
          border: `1px solid rgba(201,168,76,0.3)`,
          marginBottom: '16px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '-20px', right: '-20px',
            width: '120px', height: '120px',
            border: `1px solid rgba(201,168,76,0.1)`,
            borderRadius: '50%',
          }} />
          <div style={{
            position: 'absolute', top: '10px', right: '10px',
            width: '60px', height: '60px',
            border: `1px solid rgba(201,168,76,0.08)`,
            borderRadius: '50%',
          }} />
          <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight}, ${C.gold})` }} />
          <div style={{ padding: '24px 20px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '0.08em', color: C.white, margin: 0 }}>
                  {customer.customer_name}
                </p>
                {customer.nickname && customer.nickname !== customer.customer_name && (
                  <p style={{ fontSize: '11px', color: C.gold, letterSpacing: '0.12em', fontStyle: 'italic', marginTop: '4px', margin: '4px 0 0 0' }}>
                    &ldquo;{customer.nickname}&rdquo;
                  </p>
                )}
              </div>
              <div style={{
                background: `linear-gradient(160deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))`,
                border: `1px solid ${C.gold}`,
                color: C.gold,
                fontSize: '20px',
                fontWeight: 300,
                letterSpacing: '0.1em',
                padding: '8px 16px',
                textAlign: 'center',
                minWidth: '64px',
              }}>
                <div style={{ fontSize: '7px', letterSpacing: '0.3em', marginBottom: '2px', opacity: 0.7 }}>RANK</div>
                {customer.customer_rank ?? '—'}
              </div>
            </div>

            {/* タグ群 */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '16px', flexWrap: 'wrap' }}>
              {[
                customer.phase,
                customer.cast_name ? `担当: ${customer.cast_name}` : null,
                customer.region,
                customer.occupation,
              ].filter(Boolean).map((tag, i) => (
                <span key={i} style={{
                  fontSize: '9px',
                  color: 'rgba(201,168,76,0.8)',
                  border: '1px solid rgba(201,168,76,0.25)',
                  padding: '3px 10px',
                  letterSpacing: '0.08em',
                  background: 'rgba(201,168,76,0.06)',
                }}>{tag}</span>
              ))}
            </div>

            {/* 優先度 & 推奨接触頻度 */}
            <div style={{
              marginTop: '16px', paddingTop: '16px',
              borderTop: '1px solid rgba(201,168,76,0.15)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <PriorityBadge priority={d.sales_priority} />
              {d.recommended_contact_frequency && (
                <p style={{ fontSize: '9px', color: 'rgba(201,168,76,0.6)', letterSpacing: '0.05em', textAlign: 'right', maxWidth: '220px', lineHeight: 1.6, margin: 0 }}>
                  {d.recommended_contact_frequency}
                </p>
              )}
            </div>

            {/* 統計ミニカード */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <StatMini
                label="SALES (累計)"
                value={formatYen(totalSpent)}
                sub={customer.monthly_target_sales ? `目標 ${formatYen(Number(customer.monthly_target_sales))}` : undefined}
                rate={salesRate}
              />
              <StatMini
                label="VISITS (累計)"
                value={`${visitCount} 回`}
                sub={customer.monthly_target_visits ? `目標 ${customer.monthly_target_visits} 回` : undefined}
                rate={visitRate}
              />
            </div>
          </div>
        </div>

        {/* ─── タブ ─── */}
        <div style={{ display: 'flex', border: `1px solid ${C.border}`, marginBottom: '16px', background: C.white }}>
          {tabs.map((tab, idx) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '12px 0',
                fontSize: '9px',
                letterSpacing: '0.25em',
                background: activeTab === tab.id ? `linear-gradient(160deg, ${C.dark}, ${C.dark2})` : 'transparent',
                color: activeTab === tab.id ? C.gold : C.goldMuted,
                border: 'none',
                borderRight: idx !== tabs.length - 1 ? `1px solid ${C.border}` : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── PROFILE タブ ─── */}
        {activeTab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Card>
              <SectionTitle label="BASIC INFO" />
              <InfoRow label="年齢層" value={customer.age_group} />
              <InfoRow label="職業" value={customer.occupation} />
              <InfoRow label="エリア" value={customer.region} />
              <InfoRow label="担当キャスト" value={customer.cast_name} />
              <InfoRow label="キャストタイプ" value={customer.cast_type} />
              <InfoRow label="血液型" value={customer.blood_type} />
            </Card>

            <Card>
              <SectionTitle label="RELATIONSHIP" />
              <InfoRow label="関係タイプ" value={customer.relationship_type} />
              <InfoRow label="指名経緯" value={customer.nomination_route} />
              <InfoRow label="フェーズ" value={customer.phase} />
              <InfoRow label="配偶者" value={customer.spouse_status} />
              <InfoRow label="色恋度" value={customer.score !== undefined ? `${customer.score} / 5` : null} />
              <InfoRow label="初来店日" value={customer.first_visit_date} />
              <InfoRow label="最終連絡" value={customer.last_contact_date} />
              <InfoRow label="次回連絡" value={customer.next_contact_date} />
            </Card>

            <Card>
              <SectionTitle label="PREFERENCE" />
              <InfoRow label="好みタイプ" value={customer.favorite_type} />
              <InfoRow label="趣味・興味" value={customer.hobby} />
              <InfoRow label="NGトピック" value={customer.ng_items} />
            </Card>

            <Card>
              <SectionTitle label="GOALS" />
              <InfoRow label="月間目標(回数)" value={customer.monthly_target_visits ? `${customer.monthly_target_visits} 回` : null} />
              <InfoRow label="月間目標(売上)" value={customer.monthly_target_sales ? formatYen(Number(customer.monthly_target_sales)) : null} />
              <InfoRow label="実来店頻度" value={customer.actual_visit_frequency} />
              <InfoRow label="期待売上" value={customer.sales_expectation} />
              <InfoRow label="トレンド" value={customer.trend} />
            </Card>

            {customer.memo && (
              <Card>
                <SectionTitle label="MEMO" />
                <p style={{ fontSize: '12px', color: C.dark, lineHeight: 1.8, letterSpacing: '0.03em', whiteSpace: 'pre-line', margin: 0 }}>
                  {customer.memo}
                </p>
              </Card>
            )}
          </div>
        )}

        {/* ─── STRATEGY タブ ─── */}
        {activeTab === 'diagnosis' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Card>
              <SectionTitle label="SALES OBJECTIVE" sub="今すぐやること" />
              <p style={{ fontSize: '11px', color: C.dark, lineHeight: 1.9, letterSpacing: '0.03em', whiteSpace: 'pre-line', margin: 0 }}>
                {d.sales_objective}
              </p>
            </Card>

            <Card>
              <SectionTitle label="TONE & DISTANCE" />
              <div style={{ marginBottom: '12px', padding: '12px', background: C.tagBg, border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.goldMuted, marginBottom: '6px', margin: '0 0 6px 0' }}>推奨トーン</p>
                <p style={{ fontSize: '12px', color: C.dark, lineHeight: 1.6, margin: 0 }}>{d.recommended_tone}</p>
              </div>
              <div style={{ padding: '12px', background: C.tagBg, border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.goldMuted, marginBottom: '6px', margin: '0 0 6px 0' }}>距離感</p>
                <p style={{ fontSize: '12px', color: C.dark, lineHeight: 1.6, margin: 0 }}>{d.recommended_distance}</p>
              </div>
            </Card>

            <Card>
              <SectionTitle label="CONTACT TIMING" />
              <InfoRow label="推奨頻度" value={d.recommended_contact_frequency} />
              <InfoRow label="ベスト時間" value={d.best_time_to_contact} />
              <InfoRow label="NG時間" value={d.ng_contact_time} />
              <InfoRow label="NG曜日" value={d.ng_contact_day} />
            </Card>

            {d.important_points && (
              <Card>
                <SectionTitle label="IMPORTANT POINTS" sub="意識すること" />
                <p style={{ fontSize: '11px', color: C.dark, lineHeight: 1.9, letterSpacing: '0.03em', whiteSpace: 'pre-line', margin: 0 }}>
                  {d.important_points}
                </p>
              </Card>
            )}

            {d.warning_points && d.warning_points !== '特になし' && (
              <div style={{
                background: 'linear-gradient(160deg, #1A0F0A, #2D1A10)',
                border: `1px solid rgba(201,168,76,0.4)`,
              }}>
                <div style={{ height: '2px', background: `linear-gradient(90deg, #C9A84C55, ${C.gold}, #C9A84C55)` }} />
                <div style={{ padding: '20px' }}>
                  <SectionTitle label="⚠ WARNING POINTS" />
                  <p style={{ fontSize: '11px', color: 'rgba(232,201,138,0.85)', lineHeight: 1.9, letterSpacing: '0.03em', whiteSpace: 'pre-line', margin: 0 }}>
                    {d.warning_points}
                  </p>
                </div>
              </div>
            )}

            {d.final_recommended_note && (
              <div style={{
                background: `linear-gradient(160deg, ${C.dark}, ${C.dark2})`,
                border: `1px solid rgba(201,168,76,0.3)`,
              }}>
                <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight}, ${C.gold})` }} />
                <div style={{ padding: '20px' }}>
                  <SectionTitle label="SUMMARY" />
                  <p style={{ fontSize: '11px', color: 'rgba(232,201,138,0.85)', lineHeight: 1.9, letterSpacing: '0.05em', whiteSpace: 'pre-line', margin: 0 }}>
                    {d.final_recommended_note}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── LINE タブ ─── */}
        {activeTab === 'line' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Card>
              <SectionTitle label="LINE TEMPLATES" sub="編集 → SAVE で保存／COPY でクリップボード" />
              <LineTemplateEditor
                label="AFTER VISIT — お礼LINE"
                value={templates.thanks}
                onChange={(v) => setTemplates({ ...templates, thanks: v })}
                onSave={() => handleSaveTemplate('thanks')}
                saving={savingTemplate === 'thanks'}
              />
              <LineTemplateEditor
                label="SALES — 営業LINE"
                value={templates.sales}
                onChange={(v) => setTemplates({ ...templates, sales: v })}
                onSave={() => handleSaveTemplate('sales')}
                saving={savingTemplate === 'sales'}
              />
              <LineTemplateEditor
                label="INVITE — 来店誘導LINE"
                value={templates.visit}
                onChange={(v) => setTemplates({ ...templates, visit: v })}
                onSave={() => handleSaveTemplate('visit')}
                saving={savingTemplate === 'visit'}
              />
            </Card>
          </div>
        )}

        {/* ─── VISITS タブ ─── */}
        {activeTab === 'visits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* 来店記録入力 */}
            <Card>
              <SectionTitle label="NEW VISIT" sub="来店記録を追加" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.goldMuted, margin: '0 0 4px 0' }}>来店日</p>
                  <input
                    type="date"
                    value={newVisit.visit_date}
                    onChange={(e) => setNewVisit({ ...newVisit, visit_date: e.target.value })}
                    className="eclat-input"
                    style={{
                      width: '100%', background: C.tagBg,
                      border: `1px solid ${C.border}`,
                      padding: '10px 12px', fontSize: '13px', color: C.dark,
                      outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.goldMuted, margin: '0 0 4px 0' }}>売上 (円)</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newVisit.amount_spent}
                    onChange={(e) => setNewVisit({ ...newVisit, amount_spent: e.target.value })}
                    placeholder="0"
                    className="eclat-input"
                    style={{
                      width: '100%', background: C.tagBg,
                      border: `1px solid ${C.border}`,
                      padding: '10px 12px', fontSize: '13px', color: C.dark,
                      outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.goldMuted, margin: '0 0 4px 0' }}>メモ (人数・席・同席者など)</p>
                  <textarea
                    value={newVisit.memo}
                    onChange={(e) => setNewVisit({ ...newVisit, memo: e.target.value })}
                    rows={3}
                    placeholder="例: 3名で来店／VIP席／取引先同席"
                    className="eclat-input"
                    style={{
                      width: '100%', background: C.tagBg,
                      border: `1px solid ${C.border}`,
                      padding: '10px 12px', fontSize: '13px', color: C.dark,
                      outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                      boxSizing: 'border-box', lineHeight: 1.6,
                    }}
                  />
                </div>

                <button
                  onClick={handleAddVisit}
                  disabled={addingVisit}
                  style={{
                    marginTop: '4px',
                    background: `linear-gradient(160deg, ${C.dark}, ${C.dark2})`,
                    color: C.gold,
                    border: `1px solid ${C.gold}`,
                    padding: '12px',
                    fontSize: '10px',
                    letterSpacing: '0.3em',
                    cursor: addingVisit ? 'default' : 'pointer',
                    opacity: addingVisit ? 0.6 : 1,
                  }}
                >
                  {addingVisit ? 'SAVING...' : '+ ADD VISIT'}
                </button>
              </div>
            </Card>

            {/* 来店履歴 */}
            <Card>
              <SectionTitle label="VISIT HISTORY" sub={`累計 ${visitCount} 回 / ${formatYen(totalSpent)}`} />
              {visits.length === 0 ? (
                <p style={{ fontSize: '11px', color: C.goldMuted, textAlign: 'center', padding: '20px 0', margin: 0 }}>
                  まだ来店記録がありません
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {visits.map((v) => (
                    <div key={v.id} style={{
                      background: C.tagBg,
                      border: `1px solid ${C.border}`,
                      padding: '12px 14px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <p style={{ fontSize: '13px', color: C.dark, letterSpacing: '0.05em', fontWeight: 500, margin: 0 }}>
                          {v.visit_date}
                        </p>
                        <p style={{ fontSize: '13px', color: C.gold, letterSpacing: '0.05em', fontWeight: 500, margin: 0 }}>
                          {formatYen(Number(v.amount_spent) || 0)}
                        </p>
                      </div>
                      {v.memo && (
                        <p style={{ fontSize: '11px', color: C.goldMuted, marginTop: '6px', whiteSpace: 'pre-line', lineHeight: 1.6, margin: '6px 0 0 0' }}>
                          {v.memo}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        button:active { opacity: 0.8; }
        a { text-decoration: none; }
        .eclat-input:focus {
          border-color: ${C.gold} !important;
          box-shadow: 0 0 0 2px rgba(201,168,76,0.18);
        }
      `}</style>
    </div>
  )
}
