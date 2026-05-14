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
import { todayJST } from '@/lib/dateUtils'

// ─── カラーパレット ───────────────────────────────────────────────────
import { C } from '@/lib/colors'
import { useUndoToast } from '@/hooks/useUndoToast'
import { exportSingleCustomer } from '@/lib/excelExport'
import Avatar, { type CustomerRank as AvatarCustomerRank } from '@/components/ui/Avatar'
import dynamic from 'next/dynamic'
const LineMessageProposerModal = dynamic(() => import('@/components/LineMessageProposerModal'), { ssr: false })
const RankExplanationModal = dynamic(() => import('@/components/RankExplanationModal'), { ssr: false })
import { evaluateUnreplied, calcAvgReplyHours } from '@/lib/contactTracking'
import ClearableInput from '@/components/ClearableInput'

// ─── 優先度バッジ（リブランド版：pill＋桜影） ───────────────────────
//  「最優先」だけ濃い色＋影で目立たせる。お守りお札の重要マーク的に。
function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; color: string; bg: string; shadow: string }> = {
    '高': {
      label: '最優先',
      color: C.white,
      bg: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
      shadow: '0 4px 12px rgba(232,135,154,0.28)',
    },
    '中': {
      label: '注力',
      color: C.pink,
      bg: 'rgba(242,131,155,0.12)',
      shadow: 'none',
    },
    '低': {
      label: '維持',
      color: C.pinkMuted,
      bg: 'rgba(242,131,155,0.06)',
      shadow: 'none',
    },
  }
  const s = map[priority] ?? map['低']
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${priority === '高' ? C.pink : 'rgba(232,135,155,0.3)'}`,
      fontSize: 10,
      letterSpacing: '0.22em',
      fontWeight: 700,
      padding: '5px 14px',
      borderRadius: 14,
      display: 'inline-block',
      boxShadow: s.shadow,
    }}>
      {s.label}
    </span>
  )
}

// ─── セクションヘッダー（リブランド版） ─────────────────────────────
//  ピンクの細い棒＋大文字ラベル。お守り札の見出し風。
function SectionTitle({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          display: 'inline-block',
          width: 3, height: 12,
          background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
          borderRadius: 2,
        }} />
        <p style={{
          fontSize: 9, letterSpacing: '0.32em',
          color: C.pink, fontWeight: 700, margin: 0,
        }}>{label}</p>
      </div>
      {sub && <p style={{
        fontSize: 10, color: C.pinkMuted,
        letterSpacing: '0.08em', paddingLeft: 13,
        margin: '4px 0 0 0',
      }}>{sub}</p>}
    </div>
  )
}

// ─── カード（リブランド版：角丸＋桜影） ───────────────────────────
//  上端2pxピンクライン＋角丸18px＋柔らかい桜影で「お守り」感を出す。
//  全タブ共通で使うのでここを変えれば全カードに波及する。
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 18,
      boxShadow: '0 8px 24px rgba(232,135,154,0.08), 0 2px 6px rgba(232,135,154,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})` }} />
      <div style={{ padding: '20px 20px 18px' }}>
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

// ─── 統計ミニカード（リブランド版） ─────────────────────────────────
//  ヒーロー部の4ミニカード。白半透明＋ピンクグラデ数字＋進捗バー。
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
  // 数字が長いとカード幅をはみ出すので、文字数で自動縮小（CSS だけで完結）
  const valueFontSize = value.length > 8 ? 14 : value.length > 6 ? 16 : 18
  return (
    <div style={{
      minWidth: 0,
      padding: '12px 14px',
      background: 'rgba(255,255,255,0.85)',
      border: '1px solid rgba(255, 218, 228, 0.7)',
      borderRadius: 14,
      boxShadow: '0 4px 10px rgba(232,135,154,0.08)',
    }}>
      <p style={{
        fontSize: 8.5, letterSpacing: '0.28em',
        color: C.pink, fontWeight: 700, margin: 0,
      }}>{label}</p>
      <p style={{
        fontSize: valueFontSize, fontWeight: 700,
        background: 'linear-gradient(135deg, #D45060 0%, #E8879B 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        letterSpacing: '0.01em',
        margin: '6px 0 0 0',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{value}</p>
      {sub && <p style={{
        fontSize: 9, color: C.pinkMuted,
        letterSpacing: '0.04em', margin: '4px 0 0 0',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{sub}</p>}
      {pct !== null && (
        <div style={{
          marginTop: 8, height: 4,
          background: '#FCE6EE', borderRadius: 3,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.pinkLight} 0%, ${C.pink} 100%)`,
            transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
            borderRadius: 3,
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
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{
          fontSize: 10, letterSpacing: '0.22em',
          color: C.pink, fontWeight: 700, margin: 0,
        }}>{label}</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleCopy}
            style={{
              fontSize: 9, letterSpacing: '0.15em',
              color: copied ? C.white : C.pink,
              background: copied
                ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                : 'rgba(255,255,255,0.85)',
              border: `1px solid ${copied ? C.pink : C.border}`,
              padding: '5px 12px',
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontFamily: 'inherit',
              fontWeight: 600,
              boxShadow: copied ? '0 3px 10px rgba(232,135,154,0.28)' : 'none',
            }}
          >
            {copied ? 'COPIED ✓' : 'COPY'}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              fontSize: 9, letterSpacing: '0.15em',
              color: C.white,
              background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
              border: `1px solid ${C.pink}`,
              padding: '5px 14px',
              borderRadius: 12,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
              transition: 'all 0.2s',
              fontFamily: 'inherit',
              fontWeight: 600,
              boxShadow: '0 3px 10px rgba(232,135,154,0.28)',
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
          background: 'rgba(255,250,252,0.9)',
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 14,
          fontSize: 12,
          color: C.dark,
          lineHeight: 1.8,
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
export default function CustomerDetailPanel({ customerId, isPC = false, isAdmin = false }: { customerId: string; isPC?: boolean; isAdmin?: boolean }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { getCustomer, updateCustomer, deleteCustomer, getVisits, addVisit, updateVisit, deleteVisit, getContacts, addContact, deleteContact, getBottles, addBottle, updateBottle, deleteBottle, getMemos, addMemo, deleteMemo } = useCustomers()
  // 削除アクションのUndoトースト
  const undoToast = useUndoToast()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [visits, setVisits] = useState<CustomerVisit[]>([])
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [bottles, setBottles] = useState<CustomerBottle[]>([])
  const [memos, setMemos] = useState<CustomerMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'diagnosis' | 'line' | 'visits' | 'bottle'>('info')
  const [isEditing, setIsEditing] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)

  // メモタイムライン
  const [newMemoDate, setNewMemoDate] = useState(todayJST())
  const [newMemoCategory, setNewMemoCategory] = useState<CustomerMemo['category']>('メモ')
  const [newMemoContent, setNewMemoContent] = useState('')
  const [addingMemo, setAddingMemo] = useState(false)

  const [newVisit, setNewVisit] = useState({
    visit_date: todayJST(),
    visit_time: '',
    extension_minutes: '0',
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
    visit_date: '', visit_time: '', extension_minutes: '0',
    amount_spent: '', party_size: '1',
    has_douhan: false, has_after: false, is_planned: false,
    companion_honshimei: '', companion_banai: '', memo: '',
  })
  const [savingVisit, setSavingVisit] = useState(false)

  // 連絡記録
  const [newContactDate, setNewContactDate] = useState(todayJST())
  const [newContactMemo, setNewContactMemo] = useState('')
  const [newContactDirection, setNewContactDirection] = useState<'sent' | 'received'>('sent')
  const [newContactChannel, setNewContactChannel] = useState<'LINE' | '電話' | 'メール' | '来店中' | 'その他'>('LINE')
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
  // v6 (2026-05-12): C-2 LINE 動的文面提案モーダル
  const [showLineProposer, setShowLineProposer] = useState(false)
  // v6 (D-3 2026-05-12): ランク判定理由モーダル
  const [showRankExplanation, setShowRankExplanation] = useState(false)

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
      } catch (e) { console.error('[CustomerDetailPanel] planned-visits fetch', e) }

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
        } catch (e) { console.error('[CustomerDetailPanel] cast profile fetch', e) }
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

  // ─── 来店周期分析 ───
  //   visits は visit_date 降順前提。連続する visit 間の日数を計算して、
  //   平均周期、直近3回の平均、傾向（短くなってる/長くなってる/横ばい）を出す。
  const visitPattern = (() => {
    if (visits.length < 2) return null
    const dates = visits
      .map(v => v.visit_date)
      .filter(Boolean)
      .map(d => new Date(d).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => b - a) // 降順（新しい順）
    if (dates.length < 2) return null
    const intervals: number[] = []
    for (let i = 0; i < dates.length - 1; i++) {
      const days = Math.round((dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24))
      if (days > 0) intervals.push(days)
    }
    if (intervals.length === 0) return null
    const avgAll = Math.round(intervals.reduce((s, n) => s + n, 0) / intervals.length)
    // 直近3回の平均（あれば）
    const recent = intervals.slice(0, 3)
    const avgRecent = recent.length > 0
      ? Math.round(recent.reduce((s, n) => s + n, 0) / recent.length)
      : avgAll
    // 傾向: 直近平均 と 全体平均の差で判定（±20%以内は横ばい）
    const diffPct = avgAll > 0 ? ((avgRecent - avgAll) / avgAll) * 100 : 0
    let trend: 'shorter' | 'longer' | 'stable'
    if (diffPct < -20) trend = 'shorter'  // 周期が短くなってる = 来店頻度UP
    else if (diffPct > 20) trend = 'longer' // 周期が長くなってる = 来店頻度DOWN
    else trend = 'stable'
    return { avgAll, avgRecent, trend, sampleSize: intervals.length }
  })()

  // ─── アクション ─────────────────────────────────────────────────
  const handleDelete = async () => {
    const ok = window.confirm(
      `${customer.customer_name} さんを本当に削除しますか？\nこの操作は取り消せません。`
    )
    if (!ok) return
    const deleted = await deleteCustomer(customerId)
    if (deleted) router.push('/')
  }

  const handleExportExcel = async () => {
    if (!customer) return
    setExportingExcel(true)
    try {
      await exportSingleCustomer({ customer, visits })
    } catch (err) {
      console.error('exportSingleCustomer error:', err)
      alert('エクセル出力に失敗しました')
    } finally {
      setExportingExcel(false)
    }
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
      visit_time: newVisit.visit_time || null,
      extension_minutes: Number(newVisit.extension_minutes) || 0,
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
        visit_date: todayJST(),
        visit_time: '',
        extension_minutes: '0',
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
      visit_time: v.visit_time ?? '',
      extension_minutes: String(v.extension_minutes ?? 0),
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
      visit_time: editVisit.visit_time || null,
      extension_minutes: Number(editVisit.extension_minutes) || 0,
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
    // Undoトーストで戻せるので確認ダイアログは省略
    const snapshot = visits.find(v => v.id === visitId)
    const ok = await deleteVisit(visitId)
    if (ok) {
      setVisits((prev) => prev.filter((v) => v.id !== visitId))
      if (snapshot) {
        undoToast.show('来店記録を削除しました', async () => {
          // 削除前のフィールドで再挿入（id は新規発行）
          const { id: _id, created_at: _ca, ...rest } = snapshot as any
          const inserted = await addVisit(rest)
          if (inserted) {
            setVisits((prev) => [inserted, ...prev])
          }
        })
      }
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
      direction: newContactDirection,
      channel: newContactChannel,
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
      setNewContactDate(todayJST())
      setNewContactMemo('')
      // direction / channel は次の入力でも同じ流れが多いはずなので保持
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

      {/* ─── 顧客ヘッダーカード（リブランド版） ───
          世界観：桜・お守り・やわらか
          - 白基調＋桜放射グラデ装飾を多層化
          - 角丸 + 柔らかいピンク影
          - Avatar (イニシャル円 + customerRank バッジ) でリッチ化
          - 顔写真は廃止（イニシャル円で代用） */}
      <div style={{
        background: 'linear-gradient(160deg, #FFFFFF 0%, #FFF8FA 60%, #FFFAFC 100%)',
        border: '1px solid rgba(255, 218, 228, 0.7)',
        borderRadius: 28,
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 18px 44px rgba(232,135,154,0.16), 0 4px 12px rgba(232,135,154,0.06)',
      }}>
        {/* 装飾：放射ピンク（右上）— モックアップに寄せて強め */}
        <div aria-hidden style={{
          position: 'absolute', top: -60, right: -50,
          width: 240, height: 240,
          background: 'radial-gradient(circle, rgba(255,190,210,0.65) 0%, rgba(255,190,210,0) 65%)',
          pointerEvents: 'none',
        }} />
        {/* 装飾：放射ピンク（左下） */}
        <div aria-hidden style={{
          position: 'absolute', bottom: -50, left: -40,
          width: 200, height: 200,
          background: 'radial-gradient(circle, rgba(255,215,228,0.5) 0%, rgba(255,215,228,0) 60%)',
          pointerEvents: 'none',
        }} />
        {/* 装飾：中央うっすら */}
        <div aria-hidden style={{
          position: 'absolute', top: '40%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 320, height: 320,
          background: 'radial-gradient(circle, rgba(255,240,245,0.35) 0%, rgba(255,240,245,0) 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ padding: isPC ? '28px 30px' : '24px 22px', position: 'relative', zIndex: 1 }}>
          {/* ─── アクションボタン群（EXCEL / EDIT / DEL） ─── */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              style={{
                border: `1px solid ${C.border}`,
                color: exportingExcel ? C.pinkMuted : C.pink,
                fontSize: 9, letterSpacing: '0.15em',
                padding: '5px 12px',
                borderRadius: 12,
                cursor: exportingExcel ? 'not-allowed' : 'pointer',
                background: 'rgba(255,255,255,0.85)',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
                boxShadow: '0 2px 6px rgba(232,135,154,0.08)',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              {exportingExcel ? 'OUTPUT…' : 'EXCEL'}
            </button>
            <button
              onClick={() => setIsEditing(true)}
              style={{
                border: `1px solid ${C.pink}`,
                color: '#FFF',
                background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                fontSize: 9, letterSpacing: '0.15em',
                padding: '5px 14px',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(232,135,154,0.25)',
              }}
            >
              EDIT
            </button>
            <button
              onClick={handleDelete}
              style={{
                border: `1px solid ${C.border}`,
                color: C.dangerLight,
                background: 'rgba(255,255,255,0.85)',
                fontSize: 9, letterSpacing: '0.15em',
                padding: '5px 12px',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 2px 6px rgba(232,135,154,0.08)',
              }}
            >
              DEL
            </button>
          </div>

          {/* ─── メインビュー: Avatar + 顧客名 + 担当キャスト + ランク詳細トリガ ─── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: isPC ? 20 : 16, marginTop: 8 }}>
            {/* Avatar：イニシャル円＋customerRank バッジ。タップでランク根拠モーダル
                周囲に桜のオーラ風放射グラデを敷いて存在感アップ */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div aria-hidden style={{
                position: 'absolute', top: -8, left: -8, right: -8, bottom: -8,
                background: 'radial-gradient(circle, rgba(255,200,215,0.55) 0%, rgba(255,200,215,0) 70%)',
                borderRadius: '50%',
                pointerEvents: 'none',
              }} />
              <Avatar
                name={customer.customer_name || '?'}
                customerRank={(customer.customer_rank ?? null) as AvatarCustomerRank}
                size="xl"
                onClick={() => setShowRankExplanation(true)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <p style={{
                  fontSize: isPC ? 28 : 24,
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  color: C.dark,
                  margin: 0,
                  lineHeight: 1.25,
                  background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  wordBreak: 'break-word',
                }}>
                  {customer.customer_name}
                </p>
              </div>
              {customer.nickname && customer.nickname !== customer.customer_name && (
                <p style={{
                  fontSize: 12, color: C.pink,
                  letterSpacing: '0.12em', fontStyle: 'italic',
                  margin: '5px 0 0 0',
                }}>
                  &ldquo;{customer.nickname}&rdquo;
                </p>
              )}

              {/* 担当キャストチップ */}
              {customer.cast_name && (
                <button
                  onClick={() => castProfileId && router.push(`/casts/${castProfileId}`)}
                  style={{
                    marginTop: 10,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: castProfileId
                      ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                      : 'rgba(232,135,155,0.1)',
                    color: castProfileId ? '#FFF' : C.pink,
                    border: `1px solid ${C.pink}`,
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    borderRadius: 14,
                    cursor: castProfileId ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                    boxShadow: castProfileId ? '0 3px 10px rgba(232,135,154,0.28)' : 'none',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  担当 {customer.cast_name}
                </button>
              )}

              {/* ランク根拠リンク（Avatar の onClick と同じ動作） */}
              <button
                onClick={() => setShowRankExplanation(true)}
                style={{
                  marginTop: 8,
                  marginLeft: customer.cast_name ? 6 : 0,
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: 'rgba(255,255,255,0.65)',
                  border: `1px solid ${C.border}`,
                  color: C.pinkMuted,
                  padding: '4px 10px',
                  fontSize: 9.5,
                  letterSpacing: '0.1em',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ランク基準 →
              </button>
            </div>
          </div>

          {/* タグ群（pill 型） */}
          <div style={{ display: 'flex', gap: 7, marginTop: 18, flexWrap: 'wrap' }}>
            {customer.has_customer_staff && (
              <span style={{
                fontSize: 9.5,
                color: '#fff',
                background: 'linear-gradient(135deg, #E8789A, #F4A5B8)',
                padding: '4px 12px',
                letterSpacing: '0.08em',
                fontWeight: 600,
                borderRadius: 12,
                boxShadow: '0 2px 6px rgba(232,135,154,0.22)',
              }}>お客様担当</span>
            )}
            {customer.nomination_status && customer.nomination_status !== 'フリー' && (
              <span style={{
                fontSize: 9.5,
                color: '#E8789A',
                border: '1px solid rgba(232,135,155,0.4)',
                padding: '4px 12px',
                letterSpacing: '0.08em',
                fontWeight: 600,
                background: 'rgba(232,120,154,0.08)',
                borderRadius: 12,
              }}>{customer.nomination_status}</span>
            )}
            {[
              customer.phase,
              customer.region,
              customer.occupation,
            ].filter(Boolean).map((tag, i) => (
              <span key={i} style={{
                fontSize: 9.5,
                color: C.pinkMuted,
                border: `1px solid ${C.border}`,
                padding: '4px 12px',
                letterSpacing: '0.08em',
                background: 'rgba(255,255,255,0.7)',
                borderRadius: 12,
              }}>{tag}</span>
            ))}
          </div>

          {/* 優先度 & 推奨接触頻度 */}
          <div style={{
            marginTop: 18, paddingTop: 18,
            borderTop: '1px solid rgba(232,135,155,0.18)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 12, flexWrap: 'wrap',
          }}>
            <PriorityBadge priority={d.sales_priority} />
            {d.recommended_contact_frequency && (
              <p style={{ fontSize: '9px', color: 'rgba(232,135,155,0.6)', letterSpacing: '0.05em', textAlign: 'right', maxWidth: '220px', lineHeight: 1.6, margin: 0 }}>
                {d.recommended_contact_frequency}
              </p>
            )}
          </div>

          {/* 統計ミニカード ─ PC: 4列1行 / Mobile: 2x2 グリッド
              SALES の金額が長くなるとモバイルでカード幅をはみ出すので
              CSS Grid で min-width=0 を保証しつつ均等分割する */}
          <div style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: isPC ? 'repeat(4, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
            gap: 10,
          }}>
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

          {/* 来店周期インジケータ（visit が2件以上あるときだけヘッダー内に出す） */}
          {visitPattern && (() => {
            const trendInfo = visitPattern.trend === 'shorter'
              ? { label: '短くなってる', color: C.pink, desc: '来店頻度が上がっています' }
              : visitPattern.trend === 'longer'
              ? { label: '長くなってる', color: C.danger, desc: '足が遠のき気味です' }
              : { label: '横ばい', color: C.pinkMuted, desc: '安定して来店中' }
            return (
              <div style={{
                marginTop: '12px',
                background: 'rgba(255,255,255,0.55)',
                border: `1px solid rgba(232,135,155,0.25)`,
                padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '8px', letterSpacing: '0.2em', color: C.pinkMuted }}>平均来店周期</span>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: C.dark }}>
                    {visitPattern.avgAll}<span style={{ fontSize: '10px', marginLeft: '2px' }}>日</span>
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '8px', letterSpacing: '0.2em', color: C.pinkMuted }}>直近の周期</span>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: C.dark }}>
                    {visitPattern.avgRecent}<span style={{ fontSize: '10px', marginLeft: '2px' }}>日</span>
                  </span>
                </div>
                <div style={{
                  marginLeft: 'auto',
                  display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end',
                }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, color: trendInfo.color,
                    padding: '2px 8px', background: '#FFF', border: `1px solid ${trendInfo.color}`,
                    borderRadius: '10px',
                  }}>
                    {trendInfo.label}
                  </span>
                  <span style={{ fontSize: '8px', color: C.pinkMuted }}>{trendInfo.desc}</span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ─── タブ（リブランド版：pill + ピンク影） ─── */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        marginBottom: 16,
        background: 'rgba(255,255,255,0.85)',
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        boxShadow: '0 4px 16px rgba(232,135,154,0.06)',
        overflow: 'hidden',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '10px 0',
              fontSize: 9.5,
              letterSpacing: '0.22em',
              fontWeight: 600,
              background: activeTab === tab.id
                ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                : 'transparent',
              color: activeTab === tab.id ? C.white : C.pinkMuted,
              border: 'none',
              borderRadius: 14,
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              boxShadow: activeTab === tab.id
                ? '0 4px 12px rgba(232,135,154,0.32)'
                : 'none',
              fontFamily: 'inherit',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── PROFILE タブ ─── */}
      {activeTab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* リブランド方針：顧客の顔写真は使わず、ヒーロー部の Avatar
              （イニシャル円＋ランクバッジ）で代用。CustomerPhotoCard 撤去済。 */}

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
                <div style={{ flex: 1 }}>
                  <ClearableInput
                    type="date"
                    value={newMemoDate}
                    onChange={(v) => setNewMemoDate(v)}
                    className="eclat-input"
                    style={{
                      fontSize: '11px', padding: '6px 8px',
                      border: `1px solid ${C.border}`, background: C.white,
                      color: C.dark, fontFamily: 'inherit',
                    }}
                  />
                </div>
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
                  // リブランド：桜系の階調で色分け（旧・青/緑/赤を撤去）
                  const catColor: Record<string, string> = {
                    '重要': C.danger,        // 深紅で目立たせる
                    '来店時': C.pink,        // 中ピンク
                    '連絡': C.pinkLight,     // 淡ピンク
                    'メモ': C.pinkMuted,     // ミュート
                    'その他': '#C2A8B0',     // グレイッシュピンク
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
            <SectionTitle label="CONTACT LOG" sub="送受信・チャネル別に時系列で記録 → 最終連絡日も自動更新" />
            {/* 未返信ステータス + 平均返信時間 */}
            {(() => {
              const status = evaluateUnreplied(
                contacts.map(c => ({
                  contact_date: c.contact_date,
                  direction: (c.direction === 'sent' || c.direction === 'received') ? c.direction : 'sent',
                })),
                3
              )
              const avgHrs = calcAvgReplyHours(
                contacts.map(c => ({
                  contact_date: c.contact_date,
                  direction: (c.direction === 'sent' || c.direction === 'received') ? c.direction : 'sent',
                }))
              )
              if (!status.unreplied && avgHrs == null) return null
              return (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {status.unreplied && status.daysSinceSent != null && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '4px 10px',
                        // 桜世界観：警告も橙ではなく深紅・濃ピンク階調で
                        background: status.daysSinceSent >= 7 ? '#FCEBEB' : '#FFF0F5',
                        color: status.daysSinceSent >= 7 ? C.danger : C.pink,
                        border: `1px solid ${status.daysSinceSent >= 7 ? '#F5A5A5' : C.pinkLight}`,
                        borderRadius: 12,
                        fontWeight: 600,
                      }}
                    >
                      未返信 {status.daysSinceSent}日経過
                    </span>
                  )}
                  {avgHrs != null && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '4px 10px',
                        background: '#F9F6F7',
                        color: C.dark,
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                      }}
                    >
                      平均返信 {avgHrs >= 24 ? `${(avgHrs / 24).toFixed(1)}日` : `${avgHrs}時間`}
                    </span>
                  )}
                </div>
              )
            })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              {/* 方向トグル: 送った / もらった */}
              <div>
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>方向</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {([
                    // 桜世界観：もらった側も青ではなく淡ピンクで
                    { v: 'sent' as const, l: '↑ 送った', color: C.pink },
                    { v: 'received' as const, l: '↓ もらった', color: C.pinkMuted },
                  ]).map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setNewContactDirection(opt.v)}
                      style={{
                        flex: 1, padding: '8px 10px', fontSize: '12px', fontWeight: 600,
                        background: newContactDirection === opt.v ? opt.color : 'transparent',
                        color: newContactDirection === opt.v ? '#FFF' : opt.color,
                        border: `1px solid ${opt.color}`,
                        cursor: 'pointer', fontFamily: 'inherit',
                        letterSpacing: '0.05em',
                      }}
                    >{opt.l}</button>
                  ))}
                </div>
              </div>

              {/* チャネル: LINE / 電話 / メール / 来店中 / その他 */}
              <div>
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>チャネル</p>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {(['LINE', '電話', 'メール', '来店中', 'その他'] as const).map(ch => {
                    const active = newContactChannel === ch
                    return (
                      <button
                        key={ch}
                        onClick={() => setNewContactChannel(ch)}
                        style={{
                          padding: '6px 12px', fontSize: '11px', borderRadius: '20px',
                          background: active ? '#FBEAF0' : C.tagBg,
                          color: active ? '#72243E' : C.tagText,
                          border: `1px solid ${active ? '#ED93B1' : C.border}`,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >{ch}</button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>連絡日</p>
                <ClearableInput
                  type="date"
                  value={newContactDate}
                  onChange={(v) => setNewContactDate(v)}
                  className="eclat-input"
                  style={{
                    background: C.tagBg,
                    border: `1px solid ${C.border}`,
                    padding: '10px 12px', fontSize: '13px', color: C.dark,
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
              <div>
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>内容（メモ）</p>
                <input
                  type="text"
                  value={newContactMemo}
                  onChange={(e) => setNewContactMemo(e.target.value)}
                  placeholder={newContactDirection === 'sent' ? '例: お礼LINE / 出勤連絡 / 営業誘い' : '例: 出勤聞かれた / 体調連絡 / 来店相談'}
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

            {/* 連絡履歴（タイムライン） */}
            {contacts.length > 0 && (
              <div>
                <p style={{ fontSize: '8px', letterSpacing: '0.25em', color: C.pinkMuted, margin: '0 0 8px 0' }}>CONTACT HISTORY</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {contacts.map((c) => {
                    const isSent = c.direction !== 'received'
                    // 桜世界観：もらった側も青ではなく淡ピンクで
                    const arrowColor = isSent ? C.pink : C.pinkMuted
                    const arrowChar = isSent ? '↑' : '↓'
                    return (
                      <div key={c.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        background: C.tagBg, border: `1px solid ${C.border}`,
                        padding: '8px 12px', borderLeft: `3px solid ${arrowColor}`,
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', color: arrowColor, fontWeight: 700 }}>{arrowChar}</span>
                            <span style={{ fontSize: '13px', color: C.dark }}>{c.contact_date}</span>
                            {c.channel && (
                              <span style={{
                                fontSize: '9px', fontWeight: 600,
                                color: arrowColor, background: '#FFF',
                                border: `1px solid ${arrowColor}`,
                                padding: '1px 7px', borderRadius: '8px',
                                letterSpacing: '0.05em',
                              }}>{c.channel}</span>
                            )}
                          </div>
                          {c.memo && <p style={{ fontSize: '11px', color: C.dark, margin: '4px 0 0 0' }}>{c.memo}</p>}
                        </div>
                        <button
                          onClick={() => handleDeleteContact(c.id)}
                          style={{ fontSize: '10px', color: C.danger, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', flexShrink: 0 }}
                        >
                          削除
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* v6 (2026-05-12): C-2 LINE 動的文面提案 */}
          <Card>
            <SectionTitle label="SUGGEST TEMPLATES" sub="色恋関係値 × 状況 で 5 パターンを動的生成" />
            <button
              onClick={() => setShowLineProposer(true)}
              style={{
                width: '100%', padding: '12px 16px', marginTop: 6,
                background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                color: '#FFF', border: 'none', borderRadius: 10,
                fontSize: 13, fontWeight: 600, letterSpacing: '0.05em',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              💌 LINE 文面を動的に提案する
            </button>
            <p style={{ fontSize: 10, color: '#9E8089', marginTop: 8, lineHeight: 1.5 }}>
              顧客の色恋関係値・誕生日・最終連絡日などから状況を自動判定して、
              気遣い 7 割・誘い 3 割のメッセージを 5 パターン生成します。
            </p>
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
                        {isAdmin && (
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
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 新規ボトル追加（管理者のみ） */}
            {isAdmin && (
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
            )}
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
                    <ClearableInput type="date" value={newPlan.planned_date}
                      onChange={(v) => setNewPlan({ ...newPlan, planned_date: v })}
                      className="eclat-input"
                      style={{ background: C.white, border: `1px solid ${C.border}`, padding: '8px', fontSize: '12px', color: C.dark, fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.pinkMuted, margin: '0 0 4px 0' }}>予定時間</p>
                    <ClearableInput type="time" value={newPlan.planned_time}
                      onChange={(v) => setNewPlan({ ...newPlan, planned_time: v })}
                      className="eclat-input"
                      style={{ background: C.white, border: `1px solid ${C.border}`, padding: '8px', fontSize: '12px', color: C.dark, fontFamily: 'inherit' }}
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
                      } else {
                        // ⚠ 旧: 失敗してもユーザーに何も伝えなかった → 登録したつもりが消えてた
                        const errBody = await res.json().catch(() => null) as { error?: string } | null
                        alert(errBody?.error || `来店予定の登録に失敗しました（HTTP ${res.status}）`)
                      }
                    } catch (err) {
                      console.error('add planned visit error:', err)
                      alert('来店予定の登録に失敗しました（通信エラー）')
                    }
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
                      <div style={{ flex: 1 }}>
                        <ClearableInput type="date" value={editPlan.planned_date}
                          onChange={(v) => setEditPlan({ ...editPlan, planned_date: v })}
                          className="eclat-input"
                          style={{ background: C.white, border: `1px solid ${C.border}`, padding: '6px', fontSize: '11px', color: C.dark, fontFamily: 'inherit' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <ClearableInput type="time" value={editPlan.planned_time}
                          onChange={(v) => setEditPlan({ ...editPlan, planned_time: v })}
                          className="eclat-input"
                          style={{ background: C.white, border: `1px solid ${C.border}`, padding: '6px', fontSize: '11px', color: C.dark, fontFamily: 'inherit' }}
                        />
                      </div>
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
                          // 桜世界観：成功色も緑ではなく濃ピンクのグラデで
                          background: pv.status === '来店済み' ? '#FFF0F5' : '#FFEBED',
                          color: pv.status === '来店済み' ? C.pink : C.danger,
                          letterSpacing: '0.1em',
                          borderRadius: 8,
                          fontWeight: 600,
                        }}>
                          {pv.status}
                        </span>
                        <button onClick={async () => {
                          if (!window.confirm('この来店予定を削除しますか？')) return
                          try {
                            const res = await fetch(`/api/planned-visits/${pv.id}`, { method: 'DELETE' })
                            if (res.ok) {
                              const pvRes = await fetch(`/api/planned-visits?customer_id=${customer.id}`)
                              if (pvRes.ok) setPlannedVisits(await pvRes.json())
                            } else {
                              // ⚠ 旧: 失敗してもユーザーに何も伝えなかった → 削除したつもりが残ってた
                              const errBody = await res.json().catch(() => null) as { error?: string } | null
                              alert(errBody?.error || `来店予定の削除に失敗しました（HTTP ${res.status}）`)
                            }
                          } catch (err) {
                            console.error('delete planned visit error:', err)
                            alert('来店予定の削除に失敗しました（通信エラー）')
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

          {/* 来店記録入力（管理者のみ） */}
          {isAdmin && <Card>
            <SectionTitle label="NEW VISIT" sub="来店記録を追加" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>来店日</p>
                  <ClearableInput
                    type="date"
                    value={newVisit.visit_date}
                    onChange={(v) => setNewVisit({ ...newVisit, visit_date: v })}
                    className="eclat-input"
                    style={{
                      background: C.tagBg,
                      border: `1px solid ${C.border}`,
                      padding: '10px 12px', fontSize: '13px', color: C.dark,
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>来店時刻</p>
                  <ClearableInput
                    type="time"
                    value={newVisit.visit_time}
                    onChange={(v) => setNewVisit({ ...newVisit, visit_time: v })}
                    className="eclat-input"
                    style={{
                      background: C.tagBg,
                      border: `1px solid ${C.border}`,
                      padding: '10px 12px', fontSize: '13px', color: C.dark,
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
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
                <div>
                  <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, margin: '0 0 4px 0' }}>延長 (分)</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="30"
                    value={newVisit.extension_minutes}
                    onChange={(e) => setNewVisit({ ...newVisit, extension_minutes: e.target.value })}
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
                  { key: 'is_planned' as const, label: '来店予定あり', color: '#C58FB0' /* 桜系：薄紫寄りピンク */ },
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
          </Card>}

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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          <div>
                            <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0 }}>来店日</label>
                            <ClearableInput
                              type="date"
                              className="eclat-input"
                              value={editVisit.visit_date}
                              onChange={(v) => setEditVisit({ ...editVisit, visit_date: v })}
                              style={{ padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0 }}>来店時刻</label>
                            <ClearableInput
                              type="time"
                              className="eclat-input"
                              value={editVisit.visit_time}
                              onChange={(v) => setEditVisit({ ...editVisit, visit_time: v })}
                              style={{ padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit' }}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          <div>
                            <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0 }}>売上（円）</label>
                            <input
                              type="number"
                              className="eclat-input"
                              value={editVisit.amount_spent}
                              onChange={(e) => setEditVisit({ ...editVisit, amount_spent: e.target.value })}
                              style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.12em', margin: 0 }}>延長（分）</label>
                            <input
                              type="number"
                              min="0"
                              step="30"
                              className="eclat-input"
                              value={editVisit.extension_minutes}
                              onChange={(e) => setEditVisit({ ...editVisit, extension_minutes: e.target.value })}
                              style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${C.border}`, background: C.white, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                          </div>
                        </div>
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
                            { key: 'is_planned' as const, label: '来店予定あり', color: '#C58FB0' /* 桜系：薄紫寄りピンク */ },
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
                            <span style={{ fontSize: '9px', background: '#C58FB0', color: '#FFF', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>予定あり</span>
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
                        {isAdmin && (
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
                        )}
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
      {/* 削除Undoトースト */}
      {undoToast.ToastView}

      {/* v6 (2026-05-12): C-2 LINE 動的文面提案モーダル */}
      {showLineProposer && customer && (
        <LineMessageProposerModal
          open={showLineProposer}
          customer={customer}
          onClose={() => setShowLineProposer(false)}
        />
      )}

      {/* v6 (D-3 2026-05-12): ランク判定理由モーダル */}
      {showRankExplanation && customer && (
        <RankExplanationModal
          open={showRankExplanation}
          customer={customer}
          onClose={() => setShowRankExplanation(false)}
        />
      )}
    </div>
  )
}
