'use client'

import { useCustomers } from '@/hooks/useCustomers'
import { diagnoseCustomer } from '@/lib/diagnosis'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Customer, CustomerVisit, CustomerContact, CustomerBottle, CustomerMemo, PlannedVisit } from '@/types'
import { NG_DESCRIPTIONS } from '@/data/ng-items'
import { createClient } from '@/lib/supabase/client'
import CustomerForm from '@/components/CustomerForm'
import { getCache, setCache } from '@/lib/cache'

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
  const supabase = useMemo(() => createClient(), [])
  const { getCustomer, updateCustomer, deleteCustomer, getVisits, addVisit, updateVisit, deleteVisit, getContacts, addContact, deleteContact, getBottles, addBottle, updateBottle, deleteBottle, getMemos, addMemo, deleteMemo } = useCustomers()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [visits, setVisits] = useState<CustomerVisit[]>([])
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [bottles, setBottles] = useState<CustomerBottle[]>([])
  const [memos, setMemos] = useState<CustomerMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'diagnosis' | 'line' | 'visits' | 'bottle'>('info')
  const [isEditing, setIsEditing] = useState(false)

  // メモタイムライン
  const [newMemoDate, setNewMemoDate] = useState(new Date().toISOString().slice(0, 10))
  const [newMemoCategory, setNewMemoCategory] = useState<CustomerMemo['category']>('メモ')
  const [newMemoContent, setNewMemoContent] = useState('')
  const [addingMemo, setAddingMemo] = useState(false)

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

  // 担当キャストID
  const [castProfileId, setCastProfileId] = useState<string | null>(null)

  // 来店予定
  const [plannedVisits, setPlannedVisits] = useState<PlannedVisit[]>([])
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [newPlan, setNewPlan] = useState({
    planned_date: '', planned_time: '', party_size: '', has_douhan: false, memo: '',
  })
  const [addingPlan, setAddingPlan] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null)
  const [editPlan, setEditPlan] = useState({
    planned_date: '', planned_time: '', party_size: '', has_douhan: false, memo: '',
  })
  const [savingPlan, setSavingPlan] = useState(false)

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
    const cacheKey = `customerDetail:${customerId}`

    // キャッシュがあれば即座に復元
    const cached = getCache<{
      customer: Customer; visits: CustomerVisit[]; contacts: CustomerContact[];
      bottles: CustomerBottle[]; memos: CustomerMemo[];
      plannedVisits: PlannedVisit[]; castProfileId: string | null;
    }>(cacheKey)
    if (cached) {
      setCustomer(cached.customer)
      setVisits(cached.visits)
      setContacts(cached.contacts)
      setBottles(cached.bottles)
      setMemos(cached.memos)
      setPlannedVisits(cached.plannedVisits)
      if (cached.castProfileId) setCastProfileId(cached.castProfileId)
      const reqFields = [cached.customer.customer_rank, cached.customer.cast_type, cached.customer.favorite_type, cached.customer.phase, cached.customer.occupation, cached.customer.age_group]
      const enoughData = reqFields.filter(Boolean).length >= 3
      const ph = '顧客情報を登録してください'
      setTemplates({
        thanks: enoughData ? (cached.customer.recommended_line_thanks || '') : ph,
        sales: enoughData ? (cached.customer.recommended_line_sales || '') : ph,
        visit: enoughData ? (cached.customer.recommended_line_visit || '') : ph,
      })
      setLoading(false)
    } else {
      setLoading(true)
    }

    // 裏で最新データを取得
    const c = await getCustomer(customerId)
    setCustomer(c)
    if (c) {
      const reqFields = [c.customer_rank, c.cast_type, c.favorite_type, c.phase, c.occupation, c.age_group];
      const enoughData = reqFields.filter(Boolean).length >= 3;
      const ph = '顧客情報を登録してください';
      setTemplates({
        thanks: enoughData ? (c.recommended_line_thanks || '') : ph,
        sales: enoughData ? (c.recommended_line_sales || '') : ph,
        visit: enoughData ? (c.recommended_line_visit || '') : ph,
      })
      const [v, ct, bt, mm] = await Promise.all([
        getVisits(customerId),
        getContacts(customerId),
        getBottles(customerId),
        getMemos(customerId),
      ])
      setVisits(v)
      setContacts(ct)
      setBottles(bt)
      setMemos(mm)

      // 来店予定取得
      let pv: PlannedVisit[] = []
      try {
        const pvRes = await fetch(`/api/planned-visits?customer_id=${customerId}`)
        if (pvRes.ok) {
          const pvData = await pvRes.json()
          pv = Array.isArray(pvData) ? pvData : []
          setPlannedVisits(pv)
        }
      } catch { /* ignore */ }

      // 担当キャストのprofile ID取得
      let cpId: string | null = null
      if (c.cast_name) {
        try {
          const { data: castData } = await supabase
            .from('profiles')
            .select('id')
            .eq('cast_name', c.cast_name)
            .eq('role', 'cast')
            .single()
          if (castData) {
            setCastProfileId(castData.id)
            cpId = castData.id
          }
        } catch { /* ignore */ }
      }

      // キャッシュに保存
      setCache(cacheKey, {
        customer: c, visits: v, contacts: ct, bottles: bt, memos: mm,
        plannedVisits: pv, castProfileId: cpId,
      })
    }
    setLoading(false)
  }, [customerId, getCustomer, getVisits, getContacts, getBottles, getMemos])

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

  // 診断に必要な主要項目が揃っているかチェック
  const diagnosisRequiredFields = [
    customer.customer_rank,
    customer.cast_type,
    customer.favorite_type,
    customer.phase,
    customer.occupation,
    customer.age_group,
  ];
  const hasEnoughDataForDiagnosis = diagnosisRequiredFields.filter(Boolean).length >= 3;
  const diagnosisPlaceholder = '顧客情報を登録してください';

  // 診断 (データ不足ならプレースホルダー、十分なら既存値 or 動的算出)
  const fresh = diagnoseCustomer(customer)
  const d = hasEnoughDataForDiagnosis ? {
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
  } : {
    sales_priority: '',
    sales_objective: diagnosisPlaceholder,
    recommended_tone: diagnosisPlaceholder,
    recommended_distance: diagnosisPlaceholder,
    recommended_contact_frequency: '',
    best_time_to_contact: '',
    ng_contact_time: '',
    ng_contact_day: '',
    warning_points: '',
    important_points: diagnosisPlaceholder,
    final_recommended_note: diagnosisPlaceholder,
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
      is_first_visit: false,
      table_number: '',
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

  // ─── 編集モード ───
  if (isEditing && customer) {
    const handleEditSubmit = async (data: Partial<Customer>) => {
      const updated = await updateCustomer(customerId, data)
      if (updated) {
        setCustomer(updated)
        setIsEditing(false)
      }
    }
    return (
      <div style={{ maxWidth: isPC ? '720px' : '420px', margin: '0 auto', padding: isPC ? '20px 24px' : '16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          <button
            onClick={() => setIsEditing(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'transparent', border: 'none',
              color: C.pink, fontSize: '13px', fontFamily: 'inherit',
              cursor: 'pointer', padding: 0,
            }}
          >
            <span style={{ fontSize: '16px' }}>←</span>
            <span style={{ letterSpacing: '0.05em' }}>詳細に戻る</span>
          </button>
          <span style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted }}>
            EDIT — {customer.customer_name}
          </span>
        </div>
        <CustomerForm
          initialData={customer}
          onSubmit={handleEditSubmit}
          onCancel={() => setIsEditing(false)}
          inOverlay
        />
      </div>
    )
  }

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
            <button
              onClick={() => setIsEditing(true)}
              style={{
                border: `1px solid ${C.pink}`, color: C.pink,
                fontSize: '8px', letterSpacing: '0.15em',
                padding: '3px 10px', cursor: 'pointer',
                background: 'rgba(255,255,255,0.6)',
                fontFamily: 'inherit',
              }}
            >
              EDIT
            </button>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <p style={{ fontSize: isPC ? '22px' : '26px', fontWeight: 300, letterSpacing: '0.08em', color: C.dark, margin: 0 }}>
                  {customer.customer_name}
                </p>
                {customer.cast_name && (
                  <button
                    onClick={() => castProfileId && router.push(`/casts/${castProfileId}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      background: castProfileId ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})` : 'rgba(232,135,155,0.1)',
                      color: castProfileId ? '#FFF' : C.pink,
                      border: `1px solid ${C.pink}`,
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      cursor: castProfileId ? 'pointer' : 'default',
                      fontFamily: 'inherit',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    {customer.cast_name}
                  </button>
                )}
              </div>
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
            <InfoRow label="誕生日" value={customer.birthday ? customer.birthday.replace(/-/g, '/') : null} />
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
            {/* NGタグ表示 */}
            {customer.ng_items ? (() => {
              const tags = customer.ng_items.split(',').filter(Boolean)
              return (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.pinkMuted, margin: '0 0 8px 0' }}>
                    NG項目 — {tags.length}件
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {tags.map(tag => (
                      <span key={tag} style={{
                        padding: '4px 10px',
                        fontSize: '10px',
                        background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                        color: C.white,
                        border: `1px solid ${C.pink}`,
                        letterSpacing: '0.04em',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={{
                    padding: '10px',
                    background: '#FFF8F9',
                    border: `1px solid ${C.border}`,
                    display: 'flex', flexDirection: 'column', gap: '4px',
                  }}>
                    {tags.map(tag => (
                      <div key={tag} style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: C.dark, flexShrink: 0 }}>・{tag}</span>
                        {NG_DESCRIPTIONS[tag] && (
                          <span style={{ fontSize: '10px', color: C.pinkMuted, lineHeight: 1.5 }}>
                            {NG_DESCRIPTIONS[tag]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })() : <InfoRow label="NG項目" value={null} />}
          </Card>

          <Card>
            <SectionTitle label="GOALS" />
            <InfoRow label="月間目標(回数)" value={customer.monthly_target_visits ? `${customer.monthly_target_visits} 回` : null} />
            <InfoRow label="月間目標(売上)" value={customer.monthly_target_sales ? formatYen(Number(customer.monthly_target_sales)) : null} />
            <InfoRow label="実来店頻度" value={customer.actual_visit_frequency} />
            <InfoRow label="期待売上" value={customer.sales_expectation} />
            <InfoRow label="トレンド" value={customer.trend} />
          </Card>

          {/* 固定メモ */}
          {customer.memo && (
            <Card>
              <SectionTitle label="MEMO" />
              <p style={{ fontSize: '12px', color: C.dark, lineHeight: 1.8, letterSpacing: '0.03em', whiteSpace: 'pre-line', margin: 0 }}>
                {customer.memo}
              </p>
            </Card>
          )}

          {/* メモタイムライン */}
          <Card>
            <SectionTitle label="MEMO TIMELINE" sub="日付付きメモを追加" />

            {/* 新規メモ追加フォーム */}
            <div style={{
              padding: '10px', marginBottom: '12px',
              background: C.tagBg, border: `1px solid ${C.border}`,
            }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <input
                  type="date"
                  value={newMemoDate}
                  onChange={(e) => setNewMemoDate(e.target.value)}
                  className="eclat-input"
                  style={{
                    flex: 1, fontSize: '11px', padding: '6px 8px',
                    border: `1px solid ${C.border}`, background: C.white,
                    color: C.dark, fontFamily: 'inherit',
                  }}
                />
                <select
                  value={newMemoCategory}
                  onChange={(e) => setNewMemoCategory(e.target.value as CustomerMemo['category'])}
                  className="eclat-input"
                  style={{
                    fontSize: '11px', padding: '6px 8px',
                    border: `1px solid ${C.border}`, background: C.white,
                    color: C.dark, fontFamily: 'inherit',
                  }}
                >
                  {['メモ', '重要', '来店時', '連絡', 'その他'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <textarea
                  value={newMemoContent}
                  onChange={(e) => setNewMemoContent(e.target.value)}
                  placeholder="メモ内容を入力..."
                  rows={2}
                  className="eclat-input"
                  style={{
                    flex: 1, fontSize: '11px', padding: '6px 8px',
                    border: `1px solid ${C.border}`, background: C.white,
                    color: C.dark, fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
                <button
                  disabled={addingMemo || !newMemoContent.trim()}
                  onClick={async () => {
                    if (!newMemoContent.trim()) return
                    setAddingMemo(true)
                    const result = await addMemo({
                      customer_id: customerId,
                      memo_date: newMemoDate,
                      category: newMemoCategory,
                      content: newMemoContent.trim(),
                    })
                    if (result) {
                      setMemos(prev => [result, ...prev])
                      setNewMemoContent('')
                    }
                    setAddingMemo(false)
                  }}
                  style={{
                    background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                    color: C.white, border: 'none',
                    fontSize: '10px', fontWeight: 600,
                    padding: '6px 14px', cursor: 'pointer',
                    opacity: addingMemo || !newMemoContent.trim() ? 0.5 : 1,
                    alignSelf: 'flex-end',
                  }}
                >
                  {addingMemo ? '...' : '追加'}
                </button>
              </div>
            </div>

            {/* タイムライン表示 */}
            {memos.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                {memos.map((m, idx) => {
                  const catColor: Record<string, string> = {
                    '重要': '#FF6B6B',
                    '来店時': '#4ECDC4',
                    '連絡': '#45B7D1',
                    'メモ': C.pink,
                    'その他': C.pinkMuted,
                  }
                  const color = catColor[m.category] || C.pink
                  return (
                    <div key={m.id} style={{
                      display: 'flex', gap: '10px',
                      padding: '8px 0',
                      borderBottom: idx < memos.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}>
                      {/* タイムラインドット */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        minWidth: '12px', paddingTop: '4px',
                      }}>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: color, flexShrink: 0,
                        }} />
                        {idx < memos.length - 1 && (
                          <div style={{
                            width: '1px', flex: 1, background: C.border, marginTop: '4px',
                          }} />
                        )}
                      </div>

                      {/* コンテンツ */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', color: C.pinkMuted }}>
                              {m.memo_date?.replace(/-/g, '/')}
                            </span>
                            <span style={{
                              fontSize: '8px', letterSpacing: '0.1em',
                              color: color, border: `1px solid ${color}`,
                              padding: '1px 6px',
                            }}>
                              {m.category}
                            </span>
                          </div>
                          <button
                            onClick={async () => {
                              if (!confirm('このメモを削除しますか？')) return
                              const ok = await deleteMemo(m.id)
                              if (ok) setMemos(prev => prev.filter(x => x.id !== m.id))
                            }}
                            style={{
                              background: 'transparent', border: 'none',
                              color: C.pinkMuted, fontSize: '10px',
                              cursor: 'pointer', padding: '0 2px',
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <p style={{
                          fontSize: '11px', color: C.dark,
                          lineHeight: 1.6, whiteSpace: 'pre-line',
                          margin: '4px 0 0 0',
                        }}>
                          {m.content}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ fontSize: '10px', color: C.pinkMuted, textAlign: 'center', margin: '12px 0' }}>
                メモはまだありません
              </p>
            )}
          </Card>
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

          {/* NG項目 */}
          {customer.ng_items && (() => {
            const tags = customer.ng_items.split(',').filter(Boolean)
            if (tags.length === 0) return null
            return (
              <div style={{
                background: '#FFF0F0',
                border: `1px solid ${C.danger}`,
              }}>
                <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.danger}, ${C.dangerLight}, ${C.danger})` }} />
                <div style={{ padding: '20px' }}>
                  <SectionTitle label="⛔ NG ITEMS" sub="絶対にやってはいけないこと" />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                    {tags.map(tag => (
                      <span key={tag} style={{
                        padding: '4px 10px',
                        fontSize: '10px',
                        background: `linear-gradient(135deg, ${C.danger}, ${C.dangerLight})`,
                        color: C.white,
                        border: `1px solid ${C.danger}`,
                        letterSpacing: '0.04em',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {tags.map(tag => (
                      <div key={tag} style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: C.danger, flexShrink: 0 }}>・{tag}</span>
                        {NG_DESCRIPTIONS[tag] && (
                          <span style={{ fontSize: '10px', color: C.dark, lineHeight: 1.5 }}>
                            {NG_DESCRIPTIONS[tag]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

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

          {/* ─── 来店予定セクション ─── */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <SectionTitle label="PLANNED VISITS" sub="来店予定" />
              <button
                type="button"
                onClick={() => {
                  setShowPlanForm(v => !v)
                  setNewPlan({ planned_date: '', planned_time: '', party_size: '', has_douhan: false, memo: '' })
                }}
                style={{
                  background: showPlanForm ? 'transparent' : `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  color: showPlanForm ? C.pink : C.white,
                  border: `1px solid ${C.pink}`,
                  padding: '6px 14px', fontSize: '10px', letterSpacing: '0.15em',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {showPlanForm ? 'キャンセル' : '+ 来店予定を追加'}
              </button>
            </div>

            {/* 予定追加フォーム */}
            {showPlanForm && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: C.tagBg, border: `1px solid ${C.border}`, marginBottom: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.pinkMuted, margin: '0 0 4px 0' }}>来店予定日</p>
                    <input type="date" value={newPlan.planned_date}
                      onChange={e => setNewPlan({ ...newPlan, planned_date: e.target.value })}
                      className="eclat-input"
                      style={{ width: '100%', background: C.white, border: `1px solid ${C.border}`, padding: '8px', fontSize: '12px', color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.pinkMuted, margin: '0 0 4px 0' }}>予定時間</p>
                    <input type="time" value={newPlan.planned_time}
                      onChange={e => setNewPlan({ ...newPlan, planned_time: e.target.value })}
                      className="eclat-input"
                      style={{ width: '100%', background: C.white, border: `1px solid ${C.border}`, padding: '8px', fontSize: '12px', color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.pinkMuted, margin: '0 0 4px 0' }}>人数</p>
                    <input type="number" inputMode="numeric" value={newPlan.party_size} placeholder="任意"
                      onChange={e => setNewPlan({ ...newPlan, party_size: e.target.value })}
                      className="eclat-input"
                      style={{ width: '100%', background: C.white, border: `1px solid ${C.border}`, padding: '8px', fontSize: '12px', color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: C.dark }}>
                      <input type="checkbox" checked={newPlan.has_douhan}
                        onChange={e => setNewPlan({ ...newPlan, has_douhan: e.target.checked })}
                      /> 同伴あり
                    </label>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.pinkMuted, margin: '0 0 4px 0' }}>メモ</p>
                  <input type="text" value={newPlan.memo} placeholder="任意"
                    onChange={e => setNewPlan({ ...newPlan, memo: e.target.value })}
                    className="eclat-input"
                    style={{ width: '100%', background: C.white, border: `1px solid ${C.border}`, padding: '8px', fontSize: '12px', color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
                <button
                  type="button"
                  disabled={!newPlan.planned_date || addingPlan}
                  onClick={async () => {
                    setAddingPlan(true)
                    try {
                      const res = await fetch('/api/planned-visits', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          customer_id: customerId,
                          planned_date: newPlan.planned_date,
                          planned_time: newPlan.planned_time || null,
                          party_size: newPlan.party_size ? Number(newPlan.party_size) : null,
                          has_douhan: newPlan.has_douhan || null,
                          memo: newPlan.memo || null,
                        }),
                      })
                      if (res.ok) {
                        setShowPlanForm(false)
                        setNewPlan({ planned_date: '', planned_time: '', party_size: '', has_douhan: false, memo: '' })
                        // refetch
                        const pvRes = await fetch(`/api/planned-visits?customer_id=${customerId}`)
                        if (pvRes.ok) setPlannedVisits(await pvRes.json())
                      }
                    } catch { /* ignore */ }
                    setAddingPlan(false)
                  }}
                  style={{
                    background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                    color: C.white, border: `1px solid ${C.pink}`,
                    padding: '10px', fontSize: '10px', letterSpacing: '0.3em',
                    cursor: addingPlan || !newPlan.planned_date ? 'default' : 'pointer',
                    opacity: addingPlan || !newPlan.planned_date ? 0.5 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {addingPlan ? '登録中...' : '来店予定を登録'}
                </button>
              </div>
            )}

            {/* 来店予定一覧 */}
            {plannedVisits.filter(pv => pv.status === '予定').length === 0 && !showPlanForm && (
              <p style={{ fontSize: '11px', color: C.pinkMuted, textAlign: 'center', padding: '12px 0', margin: 0 }}>
                来店予定はありません
              </p>
            )}
            {plannedVisits.filter(pv => pv.status === '予定').map(pv => (
              <div key={pv.id} style={{
                padding: '10px', background: '#FFF8F9', border: `1px solid ${C.border}`,
                marginBottom: '6px',
              }}>
                {editingPlanId === pv.id ? (
                  /* 編集モード */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="date" value={editPlan.planned_date}
                        onChange={e => setEditPlan({ ...editPlan, planned_date: e.target.value })}
                        className="eclat-input"
                        style={{ flex: 1, background: C.white, border: `1px solid ${C.border}`, padding: '6px', fontSize: '11px', color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                      <input type="time" value={editPlan.planned_time}
                        onChange={e => setEditPlan({ ...editPlan, planned_time: e.target.value })}
                        className="eclat-input"
                        style={{ flex: 1, background: C.white, border: `1px solid ${C.border}`, padding: '6px', fontSize: '11px', color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="number" inputMode="numeric" value={editPlan.party_size} placeholder="人数"
                        onChange={e => setEditPlan({ ...editPlan, party_size: e.target.value })}
                        className="eclat-input"
                        style={{ width: '60px', background: C.white, border: `1px solid ${C.border}`, padding: '6px', fontSize: '11px', color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                      <label style={{ fontSize: '10px', color: C.dark, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input type="checkbox" checked={editPlan.has_douhan}
                          onChange={e => setEditPlan({ ...editPlan, has_douhan: e.target.checked })}
                        /> 同伴
                      </label>
                    </div>
                    <input type="text" value={editPlan.memo} placeholder="メモ"
                      onChange={e => setEditPlan({ ...editPlan, memo: e.target.value })}
                      className="eclat-input"
                      style={{ width: '100%', background: C.white, border: `1px solid ${C.border}`, padding: '6px', fontSize: '11px', color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="button" disabled={savingPlan}
                        onClick={async () => {
                          setSavingPlan(true)
                          await fetch(`/api/planned-visits/${pv.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              planned_date: editPlan.planned_date,
                              planned_time: editPlan.planned_time || null,
                              party_size: editPlan.party_size ? Number(editPlan.party_size) : null,
                              has_douhan: editPlan.has_douhan,
                              memo: editPlan.memo || null,
                            }),
                          })
                          setEditingPlanId(null)
                          setSavingPlan(false)
                          const pvRes = await fetch(`/api/planned-visits?customer_id=${customerId}`)
                          if (pvRes.ok) setPlannedVisits(await pvRes.json())
                        }}
                        style={{ flex: 1, padding: '6px', fontSize: '10px', background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`, color: C.white, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {savingPlan ? '保存中...' : '保存'}
                      </button>
                      <button type="button"
                        onClick={() => setEditingPlanId(null)}
                        style={{ flex: 1, padding: '6px', fontSize: '10px', background: 'transparent', color: C.pinkMuted, border: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 表示モード */
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: C.dark }}>
                          {pv.planned_date}
                        </span>
                        {pv.planned_time && (
                          <span style={{ fontSize: '11px', color: C.pinkMuted, marginLeft: '8px' }}>
                            {pv.planned_time}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '9px', letterSpacing: '0.1em', padding: '2px 8px',
                        background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                        color: C.white,
                      }}>
                        予定
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: C.pinkMuted, marginTop: '4px', display: 'flex', gap: '12px' }}>
                      {pv.party_size && <span>{pv.party_size}名</span>}
                      {pv.has_douhan && <span>同伴あり</span>}
                      {pv.memo && <span>{pv.memo}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      <button type="button"
                        onClick={() => {
                          setEditingPlanId(pv.id)
                          setEditPlan({
                            planned_date: pv.planned_date,
                            planned_time: pv.planned_time || '',
                            party_size: pv.party_size ? String(pv.party_size) : '',
                            has_douhan: pv.has_douhan || false,
                            memo: pv.memo || '',
                          })
                        }}
                        style={{ padding: '4px 10px', fontSize: '9px', background: 'transparent', color: C.pink, border: `1px solid ${C.pink}`, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.1em' }}
                      >
                        編集
                      </button>
                      <button type="button"
                        onClick={async () => {
                          // 来店済みに変換 → 来店記録入力欄に日付をセット
                          setNewVisit(prev => ({
                            ...prev,
                            visit_date: pv.planned_date,
                            party_size: pv.party_size ? String(pv.party_size) : '1',
                            has_douhan: pv.has_douhan || false,
                            memo: pv.memo || '',
                          }))
                          await fetch(`/api/planned-visits/${pv.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: '来店済み' }),
                          })
                          const pvRes = await fetch(`/api/planned-visits?customer_id=${customerId}`)
                          if (pvRes.ok) setPlannedVisits(await pvRes.json())
                        }}
                        style={{ padding: '4px 10px', fontSize: '9px', background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`, color: C.white, border: 'none', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.1em' }}
                      >
                        来店済み
                      </button>
                      <button type="button"
                        onClick={async () => {
                          if (!confirm('この来店予定をキャンセルしますか？')) return
                          await fetch(`/api/planned-visits/${pv.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'キャンセル' }),
                          })
                          const pvRes = await fetch(`/api/planned-visits?customer_id=${customerId}`)
                          if (pvRes.ok) setPlannedVisits(await pvRes.json())
                        }}
                        style={{ padding: '4px 10px', fontSize: '9px', background: 'transparent', color: C.pinkMuted, border: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.1em' }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 過去の来店予定（来店済み・キャンセル） */}
            {plannedVisits.filter(pv => pv.status !== '予定').length > 0 && (
              <details style={{ marginTop: '4px' }}>
                <summary style={{ fontSize: '9px', color: C.pinkMuted, cursor: 'pointer', letterSpacing: '0.15em' }}>
                  過去の来店予定 ({plannedVisits.filter(pv => pv.status !== '予定').length}件)
                </summary>
                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {plannedVisits.filter(pv => pv.status !== '予定').map(pv => (
                    <div key={pv.id} style={{
                      padding: '8px', background: C.tagBg, border: `1px solid ${C.border}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      opacity: 0.7,
                    }}>
                      <span style={{ fontSize: '11px', color: C.dark }}>{pv.planned_date}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '9px', padding: '2px 8px',
                          background: pv.status === '来店済み' ? '#E8F5E9' : '#FFF0F0',
                          color: pv.status === '来店済み' ? '#2E7D32' : C.danger,
                          letterSpacing: '0.1em',
                        }}>
                          {pv.status}
                        </span>
                        <button onClick={async () => {
                          if (!window.confirm('この来店予定を削除しますか？')) return
                          const res = await fetch(`/api/planned-visits/${pv.id}`, { method: 'DELETE' })
                          if (res.ok) {
                            const pvRes = await fetch(`/api/planned-visits?customer_id=${customer.id}`)
                            if (pvRes.ok) setPlannedVisits(await pvRes.json())
                          }
                        }} style={{
                          background: 'transparent', border: 'none',
                          color: C.pinkMuted, fontSize: '12px', cursor: 'pointer',
                          padding: '2px 4px', lineHeight: 1,
                        }} title="削除">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </Card>

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
                        <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0 }}>人数</label>
                        <input
                          type="number" min="1"
                          className="eclat-input"
                          value={editVisit.party_size}
                          onChange={(e) => setEditVisit({ ...editVisit, party_size: e.target.value })}
                          style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                        {/* 同伴・アフター・予定 トグル */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {[
                            { key: 'has_douhan' as const, label: '同伴あり', color: '#E8789A' },
                            { key: 'has_after' as const, label: 'アフターあり', color: '#D4607A' },
                            { key: 'is_planned' as const, label: '来店予定あり', color: '#7BAFCC' },
                          ].map(item => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setEditVisit({ ...editVisit, [item.key]: !editVisit[item.key] })}
                              style={{
                                flex: 1, minWidth: '80px',
                                padding: '8px 4px', fontSize: '10px', fontFamily: 'inherit',
                                background: editVisit[item.key]
                                  ? `linear-gradient(135deg, ${item.color}, ${item.color}CC)`
                                  : C.white,
                                color: editVisit[item.key] ? '#FFF' : C.pinkMuted,
                                border: `1px solid ${editVisit[item.key] ? item.color : C.border}`,
                                cursor: 'pointer', textAlign: 'center',
                                fontWeight: editVisit[item.key] ? 600 : 400,
                              }}
                            >
                              {editVisit[item.key] ? '✓ ' : ''}{item.label}
                            </button>
                          ))}
                        </div>
                        {/* お連れ様 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <div>
                            <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0, display: 'block', marginBottom: '3px' }}>お連れ様の本指名</label>
                            <input
                              type="text"
                              className="eclat-input"
                              value={editVisit.companion_honshimei}
                              onChange={(e) => setEditVisit({ ...editVisit, companion_honshimei: e.target.value })}
                              placeholder="キャスト名"
                              style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0, display: 'block', marginBottom: '3px' }}>お連れ様の場内指名</label>
                            <input
                              type="text"
                              className="eclat-input"
                              value={editVisit.companion_banai}
                              onChange={(e) => setEditVisit({ ...editVisit, companion_banai: e.target.value })}
                              placeholder="キャスト名"
                              style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                          </div>
                        </div>
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
