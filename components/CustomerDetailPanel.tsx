'use client'

import { useCustomers } from '@/hooks/useCustomers'
import { diagnoseCustomer } from '@/lib/diagnosis'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Customer, CustomerVisit, CustomerContact, CustomerBottle } from '@/types'

// ─── カラーパレット ───────────────────────────────────────────────────
import { C } from '@/lib/colors'

// ─── 優先度バッジ ─────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    '高': { label: '最優先', color: C.white, bg: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})` },
    '中': { label: '注力', color: C.pink, bg: 'rgba(242,131,155,0.12)' },
    '低': { label: '維持', color: C.pinkMuted, bg: 'rgba(242,131,155,0.06)' },
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
        <div style={{ height: '1px', width: '24px', background: `linear-gradient(90deg, ${C.pink}, transparent)` }} />
        <p style={{ fontSize: '8px', letterSpacing: '0.35em', color: C.pink, margin: 0 }}>{label}</p>
      </div>
      {sub && <p style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.08em', marginTop: '2px', paddingLeft: '34px', margin: '2px 0 0 0' }}>{sub}</p>}
    </div>
  )
}

// ─── カード ───────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      boxShadow: '0 4px 24px rgba(232,135,155,0.06)',
    }}>
      <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})` }} />
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
      <span style={{ fontSize: '9px', color: C.pinkMuted, letterSpacing: '0.15em', minWidth: '88px', paddingTop: '1px' }}>{label}</span>
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
      background: 'rgba(232,135,155,0.05)',
      border: '1px solid rgba(232,135,155,0.2)',
    }}>
      <p style={{ fontSize: '7px', letterSpacing: '0.3em', color: 'rgba(232,135,155,0.7)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '18px', fontWeight: 300, color: C.pink, letterSpacing: '0.05em', margin: '4px 0 0 0' }}>{value}</p>
      {sub && <p style={{ fontSize: '9px', color: 'rgba(232,135,155,0.5)', letterSpacing: '0.05em', margin: '2px 0 0 0' }}>{sub}</p>}
      {pct !== null && (
        <div style={{ marginTop: '8px', height: '2px', background: 'rgba(232,135,155,0.15)', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight})`,
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
        <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pink, margin: 0 }}>{label}</p>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleCopy}
            style={{
              fontSize: '8px', letterSpacing: '0.15em',
              color: copied ? C.pinkLight : C.pinkMuted,
              border: `1px solid ${copied ? C.pink : C.border}`,
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
              color: C.dark, background: C.pink,
              border: `1px solid ${C.pink}`,
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
export default function CustomerDetailPanel({ customerId, isPC = false }: { customerId: string; isPC?: boolean }) {
  const router = useRouter()
  const { getCustomer, updateCustomer, deleteCustomer, getVisits, addVisit, updateVisit, deleteVisit, getContacts, addContact, deleteContact, getBottles, addBottle, updateBottle, deleteBottle } = useCustomers()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [visits, setVisits] = useState<CustomerVisit[]>([])
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [bottles, setBottles] = useState<CustomerBottle[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'diagnosis' | 'line' | 'visits' | 'bottle'>('info')

  const [newVisit, setNewVisit] = useState({
    visit_date: new Date().toISOString().slice(0, 10),
    amount_spent: '',
    party_size: '1',
    has_douhan: false,
    has_after: false,
    is_planned: false,
    companion_honshimei: '',
    companion_banai: '',
    memo: '',
  })
  const [addingVisit, setAddingVisit] = useState(false)
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null)
  const [editVisit, setEditVisit] = useState({
    visit_date: '', amount_spent: '', party_size: '1',
    has_douhan: false, has_after: false, is_planned: false,
    companion_honshimei: '', companion_banai: '', memo: '',
  })
  const [savingVisit, setSavingVisit] = useState(false)

  // 連絡記録
  const [newContactDate, setNewContactDate] = useState(new Date().toISOString().slice(0, 10))
  const [newContactMemo, setNewContactMemo] = useState('')
  const [addingContact, setAddingContact] = useState(false)

  // キープボトル
  const [newBottle, setNewBottle] = useState({ bottle_name: '', remaining_amount: '', notes: '' })
  const [addingBottle, setAddingBottle] = useState(false)
  const [editingBottleId, setEditingBottleId] = useState<string | null>(null)
  const [editBottle, setEditBottle] = useState({ bottle_name: '', remaining_amount: '', notes: '' })
  const [savingBottle, setSavingBottle] = useState(false)

  const [templates, setTemplates] = useState({
    thanks: '',
    sales: '',
    visit: '',
  })
  const [savingTemplate, setSavingTemplate] = useState<null | 'thanks' | 'sales' | 'visit'>(null)

  const fetchDetail = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    const c = await getCustomer(customerId)
    setCustomer(c)
    if (c) {
      setTemplates({
        thanks: c.recommended_line_thanks || '',
        sales: c.recommended_line_sales || '',
        visit: c.recommended_line_visit || '',
      })
      const [v, ct, bt] = await Promise.all([
        getVisits(customerId),
        getContacts(customerId),
        getBottles(customerId),
      ])
      setVisits(v)
      setContacts(ct)
      setBottles(bt)
    }
    setLoading(false)
  }, [customerId, getCustomer, getVisits, getContacts, getBottles])

  useEffect(() => {
    fetchDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  if (loading || !customer) {
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

  // 経過日数の計算
  const calcDaysAgo = (dateStr: string | null | undefined): number | null => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    const now = new Date()
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  }

  const lastVisitDate = visits.length > 0 ? visits[0].visit_date : null
  const daysSinceVisit = calcDaysAgo(lastVisitDate)
  const daysSinceContact = calcDaysAgo(customer.last_contact_date)

  // ─── アクション ─────────────────────────────────────────────────
  const handleDelete = async () => {
    const ok = window.confirm(
      `${customer.customer_name} さんを本当に削除しますか？\nこの操作は取り消せません。`
    )
    if (!ok) return
    const deleted = await deleteCustomer(customerId)
    if (deleted) router.push('/')
  }

  const handleAddVisit = async () => {
    if (!newVisit.visit_date) {
      alert('来店日を入力してください')
      return
    }
    setAddingVisit(true)
    const saved = await addVisit({
      customer_id: customerId,
      visit_date: newVisit.visit_date,
      amount_spent: Number(newVisit.amount_spent) || 0,
      party_size: Number(newVisit.party_size) || 1,
      has_douhan: newVisit.has_douhan,
      has_after: newVisit.has_after,
      is_planned: newVisit.is_planned,
      companion_honshimei: newVisit.companion_honshimei,
      companion_banai: newVisit.companion_banai,
      memo: newVisit.memo,
    })
    if (saved) {
      setVisits((prev) => [saved, ...prev])
      setNewVisit({
        visit_date: new Date().toISOString().slice(0, 10),
        amount_spent: '',
        party_size: '1',
        has_douhan: false,
        has_after: false,
        is_planned: false,
        companion_honshimei: '',
        companion_banai: '',
        memo: '',
      })
    }
    setAddingVisit(false)
  }

  const handleStartEditVisit = (v: CustomerVisit) => {
    setEditingVisitId(v.id)
    setEditVisit({
      visit_date: v.visit_date,
      amount_spent: String(v.amount_spent || 0),
      party_size: String(v.party_size || 1),
      has_douhan: v.has_douhan ?? false,
      has_after: v.has_after ?? false,
      is_planned: v.is_planned ?? false,
      companion_honshimei: v.companion_honshimei || '',
      companion_banai: v.companion_banai || '',
      memo: v.memo || '',
    })
  }

  const handleUpdateVisit = async () => {
    if (!editingVisitId || !editVisit.visit_date) return
    setSavingVisit(true)
    const updated = await updateVisit(editingVisitId, {
      visit_date: editVisit.visit_date,
      amount_spent: Number(editVisit.amount_spent) || 0,
      party_size: Number(editVisit.party_size) || 1,
      has_douhan: editVisit.has_douhan,
      has_after: editVisit.has_after,
      is_planned: editVisit.is_planned,
      companion_honshimei: editVisit.companion_honshimei,
      companion_banai: editVisit.companion_banai,
      memo: editVisit.memo,
    })
    if (updated) {
      setVisits((prev) => prev.map((v) => (v.id === editingVisitId ? updated : v)))
      setEditingVisitId(null)
    }
    setSavingVisit(false)
  }

  const handleDeleteVisit = async (visitId: string) => {
    if (!window.confirm('この来店記録を削除しますか？')) return
    const ok = await deleteVisit(visitId)
    if (ok) {
      setVisits((prev) => prev.filter((v) => v.id !== visitId))
    }
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
    const updated = await updateCustomer(customerId, patch)
    if (updated) {
      setCustomer(updated)
    }
    setSavingTemplate(null)
  }

  // ─── 連絡記録 ──────────────────────────────────────────────
  const handleAddContact = async () => {
    if (!newContactDate) { alert('連絡日を入力してください'); return }
    setAddingContact(true)
    const saved = await addContact({
      customer_id: customerId,
      contact_date: newContactDate,
      memo: newContactMemo,
    })
    if (saved) {
      setContacts((prev) => [saved, ...prev])
      // 最新の連絡日で last_contact_date を自動更新
      const allDates = [saved.contact_date, ...contacts.map(c => c.contact_date)]
      const latest = allDates.sort().reverse()[0]
      if (latest) {
        const updated = await updateCustomer(customerId, { ...customer, last_contact_date: latest })
        if (updated) setCustomer(updated)
      }
      setNewContactDate(new Date().toISOString().slice(0, 10))
      setNewContactMemo('')
    }
    setAddingContact(false)
  }

  const handleDeleteContact = async (contactId: string) => {
    if (!window.confirm('この連絡記録を削除しますか？')) return
    const ok = await deleteContact(contactId)
    if (ok) {
      const remaining = contacts.filter((c) => c.id !== contactId)
      setContacts(remaining)
      // 残りの中から最新日を last_contact_date に反映
      if (remaining.length > 0) {
        const latest = remaining.map(c => c.contact_date).sort().reverse()[0]
        const updated = await updateCustomer(customerId, { ...customer, last_contact_date: latest })
        if (updated) setCustomer(updated)
      } else {
        const updated = await updateCustomer(customerId, { ...customer, last_contact_date: '' })
        if (updated) setCustomer(updated)
      }
    }
  }

  // ─── キープボトル ──────────────────────────────────────────
  const handleAddBottle = async () => {
    if (!newBottle.bottle_name.trim()) { alert('ボトル名を入力してください'); return }
    setAddingBottle(true)
    const saved = await addBottle({
      customer_id: customerId,
      bottle_name: newBottle.bottle_name.trim(),
      remaining_amount: newBottle.remaining_amount.trim(),
      notes: newBottle.notes.trim(),
    })
    if (saved) {
      setBottles((prev) => [saved, ...prev])
      setNewBottle({ bottle_name: '', remaining_amount: '', notes: '' })
    }
    setAddingBottle(false)
  }

  const handleStartEditBottle = (b: CustomerBottle) => {
    setEditingBottleId(b.id)
    setEditBottle({
      bottle_name: b.bottle_name,
      remaining_amount: b.remaining_amount || '',
      notes: b.notes || '',
    })
  }

  const handleUpdateBottle = async () => {
    if (!editingBottleId) return
    setSavingBottle(true)
    const updated = await updateBottle(editingBottleId, {
      bottle_name: editBottle.bottle_name.trim(),
      remaining_amount: editBottle.remaining_amount.trim(),
      notes: editBottle.notes.trim(),
    })
    if (updated) {
      setBottles((prev) => prev.map((b) => (b.id === editingBottleId ? updated : b)))
      setEditingBottleId(null)
    }
    setSavingBottle(false)
  }

  const handleDeleteBottle = async (bottleId: string) => {
    if (!window.confirm('このボトル情報を削除しますか？')) return
    const ok = await deleteBottle(bottleId)
    if (ok) {
      setBottles((prev) => prev.filter((b) => b.id !== bottleId))
    }
  }

  const tabs = [
    { id: 'info' as const, label: 'PROFILE' },
    { id: 'diagnosis' as const, label: 'STRATEGY' },
    { id: 'line' as const, label: 'LINE' },
    { id: 'visits' as const, label: 'VISITS' },
    { id: 'bottle' as const, label: 'BOTTLE' },
  ]

  return (
    <div style={{ maxWidth: isPC ? '720px' : '420px', margin: '0 auto', padding: isPC ? '20px 24px' : '16px' }}>

      {/* ─── 顧客ヘッダーカード ─── */}
      <div style={{
        background: `linear-gradient(160deg, #FFE8EE 0%, #FFF2F5 100%)`,
        border: `1px solid ${C.border}`,
        marginBottom: '16px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-20px', right: '-20px',
          width: '120px', height: '120px',
          border: `1px solid rgba(242,131,155,0.15)`,
          borderRadius: '50%',
        }} />
        <div style={{
          position: 'absolute', top: '10px', right: '10px',
          width: '60px', height: '60px',
          border: `1px solid rgba(242,131,155,0.1)`,
          borderRadius: '50%',
        }} />
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})` }} />
        <div style={{ padding: '24px 20px', position: 'relative' }}>
          {/* EDIT / DEL — 小さなアクションボタン */}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <Link
              href={`/customer/${customerId}/edit`}
              style={{
                border: `1px solid ${C.pink}`, color: C.pink,
                fontSize: '8px', letterSpacing: '0.15em',
                padding: '3px 10px', textDecoration: 'none',
                background: 'rgba(255,255,255,0.6)',
              }}
            >
              EDIT
            </Link>
            <button
              onClick={handleDelete}
              style={{
                border: `1px solid ${C.dangerLight}`, color: C.dangerLight,
                background: 'rgba(255,255,255,0.6)',
                fontSize: '8px', letterSpacing: '0.15em',
                padding: '3px 10px', cursor: 'pointer',
              }}
            >
              DEL
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: isPC ? '22px' : '26px', fontWeight: 300, letterSpacing: '0.08em', color: C.dark, margin: 0 }}>
                {customer.customer_name}
              </p>
              {customer.nickname && customer.nickname !== customer.customer_name && (
                <p style={{ fontSize: '11px', color: C.pink, letterSpacing: '0.12em', fontStyle: 'italic', marginTop: '4px', margin: '4px 0 0 0' }}>
                  &ldquo;{customer.nickname}&rdquo;
                </p>
              )}
            </div>
            <div style={{
              background: `linear-gradient(160deg, rgba(232,135,155,0.2), rgba(232,135,155,0.05))`,
              border: `1px solid ${C.pink}`,
              color: C.pink,
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
            {customer.has_customer_staff && (
              <span style={{
                fontSize: '9px',
                color: '#fff',
                background: 'linear-gradient(135deg, #E8789A, #F4A5B8)',
                border: '1px solid #E8789A',
                padding: '3px 10px',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}>お客様担当</span>
            )}
            {customer.nomination_status && customer.nomination_status !== 'フリー' && (
              <span style={{
                fontSize: '9px',
                color: '#E8789A',
                border: '1px solid #E8789A',
                padding: '3px 10px',
                letterSpacing: '0.08em',
                fontWeight: 500,
                background: 'rgba(232,120,154,0.08)',
              }}>{customer.nomination_status}</span>
            )}
            {[
              customer.phase,
              customer.cast_name ? `担当: ${customer.cast_name}` : null,
              customer.region,
              customer.occupation,
            ].filter(Boolean).map((tag, i) => (
              <span key={i} style={{
                fontSize: '9px',
                color: 'rgba(232,135,155,0.8)',
                border: '1px solid rgba(232,135,155,0.25)',
                padding: '3px 10px',
                letterSpacing: '0.08em',
                background: 'rgba(232,135,155,0.06)',
              }}>{tag}</span>
            ))}
          </div>

          {/* 優先度 & 推奨接触頻度 */}
          <div style={{
            marginTop: '16px', paddingTop: '16px',
            borderTop: '1px solid rgba(232,135,155,0.15)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <PriorityBadge priority={d.sales_priority} />
            {d.recommended_contact_frequency && (
              <p style={{ fontSize: '9px', color: 'rgba(232,135,155,0.6)', letterSpacing: '0.05em', textAlign: 'right', maxWidth: '220px', lineHeight: 1.6, margin: 0 }}>
                {d.recommended_contact_frequency}
              </p>
            )}
          </div>

          {/* 統計ミニカード — PC: 4列1行 / Mobile: 2行 */}
          <div style={{ marginTop: '16px', display: 'flex', gap: isPC ? '6px' : '8px', flexWrap: isPC ? 'nowrap' : 'wrap' }}>
            <StatMini
              label="SALES"
              value={formatYen(totalSpent)}
              sub={customer.monthly_target_sales ? `目標 ${formatYen(Number(customer.monthly_target_sales))}` : undefined}
              rate={salesRate}
            />
            <StatMini
              label="VISITS"
              value={`${visitCount} 回`}
              sub={customer.monthly_target_visits ? `目標 ${customer.monthly_target_visits} 回` : undefined}
              rate={visitRate}
            />
            <StatMini
              label="最終入店"
              value={daysSinceVisit !== null ? `${daysSinceVisit}日前` : '—'}
            />
            <StatMini
              label="最終連絡"
              value={daysSinceContact !== null ? `${daysSinceContact}日前` : '—'}
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
              background: activeTab === tab.id ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})` : 'transparent',
              color: activeTab === tab.id ? C.white : C.pinkMuted,
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
            <InfoRow label="指名状況" value={customer.nomination_status} />
            <InfoRow label="指名経緯" value={customer.nomination_route} />
            <InfoRow label="関係性" value={customer.phase} />
            <InfoRow label="お客様担当" value={customer.has_customer_staff ? 'あり' : 'なし'} />
            <InfoRow label="配偶者" value={customer.spouse_status} />
            <InfoRow label="色恋関係値" value={
              customer.score !== undefined && customer.score !== null
                ? { 1: '1 - 軽いボディタッチ', 2: '2 - 0センチ接客', 3: '3 - 店外接客', 4: '4 - キスまで', 5: '5 - プライベートな関係' }[Number(customer.score)] ?? `${customer.score}`
                : null
            } />
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
              <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: '6px', margin: '0 0 6px 0' }}>推奨トーン</p>
              <p style={{ fontSize: '12px', color: C.dark, lineHeight: 1.6, margin: 0 }}>{d.recommended_tone}</p>
            </div>
            <div style={{ padding: '12px', background: C.tagBg, border: `1px solid ${C.border}` }}>
              <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: '6px', margin: '0 0 6px 0' }}>距離感</p>
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
              background: '#FFF0F0',
              border: `1px solid ${C.danger}`,
            }}>
              <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.danger}, ${C.dangerLight}, ${C.danger})` }} />
              <div style={{ padding: '20px' }}>
                <SectionTitle label="⚠ WARNING POINTS" />
                <p style={{ fontSize: '11px', color: C.danger, lineHeight: 1.9, letterSpacing: '0.03em', whiteSpace: 'pre-line', margin: 0 }}>
                  {d.warning_points}
                </p>
              </div>
            </div>
          )}

          {d.final_recommended_note && (
            <div style={{
              background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
              border: `1px solid rgba(232,135,155,0.3)`,
            }}>
              <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})` }} />
              <div style={{ padding: '20px' }}>
                <SectionTitle label="SUMMARY" />
                <p style={{ fontSize: '11px', color: C.white, lineHeight: 1.9, letterSpacing: '0.05em', whiteSpace: 'pre-line', margin: 0 }}>
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
          {/* 連絡記録 */}
          <Card>
            <SectionTitle label="CONTACT LOG" sub="連絡した日を記録 → 最終連絡日に自動反映" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              <div>
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>連絡日</p>
                <input
                  type="date"
                  value={newContactDate}
                  onChange={(e) => setNewContactDate(e.target.value)}
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
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>メモ（任意）</p>
                <input
                  type="text"
                  value={newContactMemo}
                  onChange={(e) => setNewContactMemo(e.target.value)}
                  placeholder="例: お礼LINE送った / 営業連絡"
                  className="eclat-input"
                  style={{
                    width: '100%', background: C.tagBg,
                    border: `1px solid ${C.border}`,
                    padding: '10px 12px', fontSize: '13px', color: C.dark,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={handleAddContact}
                disabled={addingContact}
                style={{
                  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  color: C.white, border: `1px solid ${C.pink}`,
                  padding: '10px', fontSize: '10px', letterSpacing: '0.3em',
                  cursor: addingContact ? 'default' : 'pointer',
                  opacity: addingContact ? 0.6 : 1,
                }}
              >
                {addingContact ? 'SAVING...' : '+ 連絡記録を追加'}
              </button>
            </div>

            {/* 連絡履歴 */}
            {contacts.length > 0 && (
              <div>
                <p style={{ fontSize: '8px', letterSpacing: '0.25em', color: C.pinkMuted, margin: '0 0 8px 0' }}>CONTACT HISTORY</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {contacts.map((c) => (
                    <div key={c.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: C.tagBg, border: `1px solid ${C.border}`, padding: '8px 12px',
                    }}>
                      <div>
                        <p style={{ fontSize: '13px', color: C.dark, margin: 0 }}>{c.contact_date}</p>
                        {c.memo && <p style={{ fontSize: '10px', color: C.pinkMuted, margin: '2px 0 0 0' }}>{c.memo}</p>}
                      </div>
                      <button
                        onClick={() => handleDeleteContact(c.id)}
                        style={{ fontSize: '10px', color: C.danger, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

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

      {/* ─── BOTTLE タブ ─── */}
      {activeTab === 'bottle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Card>
            <SectionTitle label="KEEP BOTTLES" sub="キープボトル管理" />
            {/* ボトル一覧 */}
            {bottles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {bottles.map((b) => (
                  <div key={b.id} style={{
                    background: C.tagBg,
                    border: `1px solid ${editingBottleId === b.id ? C.pink : C.border}`,
                    padding: '12px 14px',
                  }}>
                    {editingBottleId === b.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <p style={{ fontSize: '9px', color: C.pinkMuted, letterSpacing: '0.12em', margin: '0 0 4px 0' }}>ボトル名</p>
                          <input
                            type="text"
                            className="eclat-input"
                            value={editBottle.bottle_name}
                            onChange={(e) => setEditBottle({ ...editBottle, bottle_name: e.target.value })}
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div>
                          <p style={{ fontSize: '9px', color: C.pinkMuted, letterSpacing: '0.12em', margin: '0 0 4px 0' }}>残量</p>
                          <input
                            type="text"
                            className="eclat-input"
                            value={editBottle.remaining_amount}
                            onChange={(e) => setEditBottle({ ...editBottle, remaining_amount: e.target.value })}
                            placeholder="例: 半分、1/3、残り少し"
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div>
                          <p style={{ fontSize: '9px', color: C.pinkMuted, letterSpacing: '0.12em', margin: '0 0 4px 0' }}>備考</p>
                          <input
                            type="text"
                            className="eclat-input"
                            value={editBottle.notes}
                            onChange={(e) => setEditBottle({ ...editBottle, notes: e.target.value })}
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button
                            onClick={handleUpdateBottle}
                            disabled={savingBottle}
                            style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600, color: C.white, background: C.pink, border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}
                          >
                            {savingBottle ? '保存中...' : '保存'}
                          </button>
                          <button
                            onClick={() => setEditingBottleId(null)}
                            style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600, color: C.pinkMuted, background: 'transparent', border: `1px solid ${C.border}`, cursor: 'pointer', letterSpacing: '0.08em' }}
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <p style={{ fontSize: '14px', color: C.dark, letterSpacing: '0.05em', fontWeight: 500, margin: 0 }}>
                            {b.bottle_name}
                          </p>
                          {b.remaining_amount && (
                            <span style={{
                              fontSize: '11px', color: C.pink, letterSpacing: '0.05em',
                              background: 'rgba(242,131,155,0.1)', border: `1px solid ${C.border}`,
                              padding: '2px 8px',
                            }}>
                              残量: {b.remaining_amount}
                            </span>
                          )}
                        </div>
                        {b.notes && (
                          <p style={{ fontSize: '11px', color: C.pinkMuted, lineHeight: 1.6, margin: '6px 0 0 0' }}>
                            {b.notes}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                          <button
                            onClick={() => handleStartEditBottle(b)}
                            style={{ fontSize: '11px', color: C.pinkMuted, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteBottle(b.id)}
                            style={{ fontSize: '11px', color: C.danger, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                          >
                            削除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 新規ボトル追加 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>ボトル名 <span style={{ color: C.pink }}>*</span></p>
                <input
                  type="text"
                  value={newBottle.bottle_name}
                  onChange={(e) => setNewBottle({ ...newBottle, bottle_name: e.target.value })}
                  placeholder="例: ヘネシーXO"
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
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>残量</p>
                <input
                  type="text"
                  value={newBottle.remaining_amount}
                  onChange={(e) => setNewBottle({ ...newBottle, remaining_amount: e.target.value })}
                  placeholder="例: 半分、1/3、新品"
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
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>備考</p>
                <input
                  type="text"
                  value={newBottle.notes}
                  onChange={(e) => setNewBottle({ ...newBottle, notes: e.target.value })}
                  placeholder="例: お気に入り、次回追加分"
                  className="eclat-input"
                  style={{
                    width: '100%', background: C.tagBg,
                    border: `1px solid ${C.border}`,
                    padding: '10px 12px', fontSize: '13px', color: C.dark,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={handleAddBottle}
                disabled={addingBottle}
                style={{
                  marginTop: '4px',
                  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  color: C.white, border: `1px solid ${C.pink}`,
                  padding: '10px', fontSize: '10px', letterSpacing: '0.3em',
                  cursor: addingBottle ? 'default' : 'pointer',
                  opacity: addingBottle ? 0.6 : 1,
                }}
              >
                {addingBottle ? 'SAVING...' : '+ ボトルを追加'}
              </button>
            </div>
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
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>来店日</p>
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
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>売上 (円)</p>
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

              {/* 人数 */}
              <div>
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>人数</p>
                <input
                  type="number" inputMode="numeric" min="1"
                  value={newVisit.party_size}
                  onChange={(e) => setNewVisit({ ...newVisit, party_size: e.target.value })}
                  placeholder="1"
                  className="eclat-input"
                  style={{
                    width: '100%', background: C.tagBg,
                    border: `1px solid ${C.border}`,
                    padding: '10px 12px', fontSize: '13px', color: C.dark,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* 同伴・アフター・来店予定 チェックボックス */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { key: 'has_douhan' as const, label: '同伴あり', color: '#E8789A' },
                  { key: 'has_after' as const, label: 'アフターあり', color: '#D4607A' },
                  { key: 'is_planned' as const, label: '来店予定あり', color: '#7BAFCC' },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setNewVisit({ ...newVisit, [item.key]: !newVisit[item.key] })}
                    style={{
                      flex: 1, minWidth: '90px',
                      padding: '10px 6px', fontSize: '11px', fontFamily: 'inherit',
                      background: newVisit[item.key]
                        ? `linear-gradient(135deg, ${item.color}, ${item.color}CC)`
                        : C.tagBg,
                      color: newVisit[item.key] ? '#FFF' : C.pinkMuted,
                      border: `1px solid ${newVisit[item.key] ? item.color : C.border}`,
                      cursor: 'pointer', textAlign: 'center',
                      fontWeight: newVisit[item.key] ? 600 : 400,
                    }}
                  >
                    {newVisit[item.key] ? '✓ ' : ''}{item.label}
                  </button>
                ))}
              </div>

              {/* お連れ様 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>お連れ様の本指名</p>
                  <input
                    type="text"
                    value={newVisit.companion_honshimei}
                    onChange={(e) => setNewVisit({ ...newVisit, companion_honshimei: e.target.value })}
                    placeholder="キャスト名"
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
                  <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>お連れ様の場内指名</p>
                  <input
                    type="text"
                    value={newVisit.companion_banai}
                    onChange={(e) => setNewVisit({ ...newVisit, companion_banai: e.target.value })}
                    placeholder="キャスト名"
                    className="eclat-input"
                    style={{
                      width: '100%', background: C.tagBg,
                      border: `1px solid ${C.border}`,
                      padding: '10px 12px', fontSize: '13px', color: C.dark,
                      outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>メモ</p>
                <textarea
                  value={newVisit.memo}
                  onChange={(e) => setNewVisit({ ...newVisit, memo: e.target.value })}
                  rows={2}
                  placeholder="備考"
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
                  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  color: C.white,
                  border: `1px solid ${C.pink}`,
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
              <p style={{ fontSize: '11px', color: C.pinkMuted, textAlign: 'center', padding: '20px 0', margin: 0 }}>
                まだ来店記録がありません
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {visits.map((v) => (
                  <div key={v.id} style={{
                    background: C.tagBg,
                    border: `1px solid ${editingVisitId === v.id ? C.pink : C.border}`,
                    padding: '12px 14px',
                  }}>
                    {editingVisitId === v.id ? (
                      /* ── 編集モード ── */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0 }}>来店日</label>
                        <input
                          type="date"
                          className="eclat-input"
                          value={editVisit.visit_date}
                          onChange={(e) => setEditVisit({ ...editVisit, visit_date: e.target.value })}
                          style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                        <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0 }}>売上（円）</label>
                        <input
                          type="number"
                          className="eclat-input"
                          value={editVisit.amount_spent}
                          onChange={(e) => setEditVisit({ ...editVisit, amount_spent: e.target.value })}
                          style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                        <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0 }}>メモ</label>
                        <textarea
                          className="eclat-input"
                          value={editVisit.memo}
                          onChange={(e) => setEditVisit({ ...editVisit, memo: e.target.value })}
                          rows={2}
                          style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button
                            onClick={handleUpdateVisit}
                            disabled={savingVisit}
                            style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600, color: C.white, background: C.pink, border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}
                          >
                            {savingVisit ? '保存中...' : '保存'}
                          </button>
                          <button
                            onClick={() => setEditingVisitId(null)}
                            style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: 600, color: C.pinkMuted, background: 'transparent', border: `1px solid ${C.border}`, cursor: 'pointer', letterSpacing: '0.08em' }}
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── 表示モード ── */
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <p style={{ fontSize: '13px', color: C.dark, letterSpacing: '0.05em', fontWeight: 500, margin: 0 }}>
                              {v.visit_date}
                            </p>
                            {v.party_size > 1 && (
                              <span style={{ fontSize: '10px', color: C.pinkMuted }}>{v.party_size}名</span>
                            )}
                          </div>
                          <p style={{ fontSize: '13px', color: C.pink, letterSpacing: '0.05em', fontWeight: 500, margin: 0 }}>
                            {formatYen(Number(v.amount_spent) || 0)}
                          </p>
                        </div>
                        {/* バッジ行 */}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                          {v.has_douhan && (
                            <span style={{ fontSize: '9px', background: '#E8789A', color: '#FFF', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>同伴</span>
                          )}
                          {v.has_after && (
                            <span style={{ fontSize: '9px', background: '#D4607A', color: '#FFF', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>アフター</span>
                          )}
                          {v.is_planned && (
                            <span style={{ fontSize: '9px', background: '#7BAFCC', color: '#FFF', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>予定あり</span>
                          )}
                          {v.companion_honshimei && (
                            <span style={{ fontSize: '9px', background: C.tagBg, color: C.dark, padding: '2px 6px', borderRadius: '3px', border: `1px solid ${C.border}` }}>本指名: {v.companion_honshimei}</span>
                          )}
                          {v.companion_banai && (
                            <span style={{ fontSize: '9px', background: C.tagBg, color: C.dark, padding: '2px 6px', borderRadius: '3px', border: `1px solid ${C.border}` }}>場内: {v.companion_banai}</span>
                          )}
                        </div>
                        {v.memo && (
                          <p style={{ fontSize: '11px', color: C.pinkMuted, whiteSpace: 'pre-line', lineHeight: 1.6, margin: '6px 0 0 0' }}>
                            {v.memo}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                          <button
                            onClick={() => handleStartEditVisit(v)}
                            style={{ fontSize: '11px', color: C.pinkMuted, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteVisit(v.id)}
                            style={{ fontSize: '11px', color: C.danger, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                          >
                            削除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        button:active { opacity: 0.8; }
        a { text-decoration: none; }
        .eclat-input:focus {
          border-color: ${C.pink} !important;
          box-shadow: 0 0 0 2px rgba(232,135,155,0.18);
        }
      `}</style>
    </div>
  )
}
