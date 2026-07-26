'use client'

import { useEffect, useState } from 'react'
import {
  Customer,
  CustomerRank,
  NominationRoute,
  NominationStatus,
  AgeGroup,
  Occupation,
  REGIONS,
  Phase,
  SpouseStatus,
  FavoriteType,
  SalesExpectation,
  Trend,
  CastType,
} from '@/types'
import { NG_DESCRIPTIONS, NG_GROUPS } from '@/data/ng-items'
import { diagnoseCustomer } from '@/lib/diagnosis'

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'
import ClearableInput from '@/components/ClearableInput'
import { useViewMode } from '@/hooks/useViewMode'
import { fetchMe } from '@/lib/authCache'

// ─── 選択肢定数 ─────────────────────────────────────────────────────
// '切れた' は連絡が切れたお客様用の手動専用ランク（自動変動の対象外）
const ranks: CustomerRank[] = ['S', 'A', 'B', 'C', '切れた']
const routes: NominationRoute[] = [
  '前店舗顧客', 'SNS指名', '紹介指名', '店舗外指名', '場内指名→本指名',
  'フリー→本指名', 'ヘルプ→本指名', 'ロイヤル層→本指名', 'その他',
]
const ages: AgeGroup[] = ['20代', '30代', '40代', '50代以上']
const occupations: Occupation[] = [
  '経営者', 'サラリーマン', '接待役が多い', '自営業', '医療系', '夜職',
  '公務員・堅い職業', '土業', '不動産', '金融', '建設', '飲食', 'IT', '美容', '広告', '士業', 'その他',
]
const nominationStatuses: NominationStatus[] = ['フリー', '場内', '本指名']
const phases: Phase[] = ['認知', '場内', '初指名', 'リピート', '安定', '来店操作可能']
const spouses: Array<{ value: SpouseStatus; label: string }> = [
  { value: '有', label: '既婚' },
  { value: '無', label: '未婚' },
  { value: '不明', label: 'わからない' },
]
const favorites: FavoriteType[] = [
  '可愛い系', '清楚系', '綺麗系', 'ギャル系', '大人系', '癒し系',
  '甘え系', '強気系', 'お姉さん系', '素朴系', '明るい子', '落ち着いた子',
]
const expectations: SalesExpectation[] = ['高', '中', '低']
const trends: Trend[] = ['上昇', '下降', '停滞']
const castTypes: CastType[] = [
  '清楚系', '可愛い系', '綺麗系', 'ギャル系', 'お姉さん系', '癒し系', 'サバサバ系',
  '色恋営業型', '友達営業型', '聞き役タイプ', '盛り上げ役', 'S系', 'M系',
]


// 全角→半角、数字以外除去
const normalizeNumberInput = (val: string) => {
  return val
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/[^0-9]/g, '')
}

// ─── 再利用コンポーネント ──────────────────────────────────────────
function SectionTitle({ label, sub }: { label: string; sub?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          display: 'inline-block', width: 3, height: 13,
          background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
          borderRadius: 2,
        }} />
        <p style={{
          fontSize: 10, letterSpacing: '0.3em',
          color: C.pink, fontWeight: 700, margin: 0,
        }}>{label}</p>
      </div>
      {sub && (
        <p style={{
          fontSize: 10.5, color: C.pinkMuted,
          letterSpacing: '0.05em', marginTop: 5, paddingLeft: 13, marginBottom: 0,
        }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 18,
      padding: '20px 18px',
      boxShadow: '0 6px 16px rgba(232,135,154,0.06)',
      width: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {children}
    </div>
  )
}

function CollapsibleSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <details style={{
      width: '100%',
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      boxShadow: '0 4px 12px rgba(232,135,154,0.05)',
      overflow: 'hidden',
    }}>
      <summary style={{
        minHeight: 54,
        padding: '11px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        cursor: 'pointer',
        listStyle: 'none',
        color: C.dark,
      }}>
        <span>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{title}</span>
          <span style={{ display: 'block', fontSize: 9.5, color: C.pinkMuted, marginTop: 3 }}>
            {description}
          </span>
        </span>
        <span className="eclat-details-toggle" aria-hidden style={{ color: C.pink, fontSize: 18, lineHeight: 1, transition: 'transform 0.2s' }}>＋</span>
      </summary>
      <div style={{
        padding: '4px 16px 18px',
        borderTop: `1px solid ${C.border}`,
      }}>
        {children}
      </div>
    </details>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 10,
      letterSpacing: '0.22em',
      color: C.pink,
      fontWeight: 700,
      marginBottom: 8,
      paddingLeft: 0,
      lineHeight: 1.4,
    }}>
      <span>{children}</span>
      {required && (
        <span
          aria-label="必須"
          style={{
            fontSize: 9,
            color: C.white,
            background: C.pink,
            padding: '2px 6px',
            borderRadius: 6,
            fontWeight: 700,
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}
        >
          必須
        </span>
      )}
    </label>
  )
}

// 共通の「未登録」プレースホルダー文字色（赤すぎないくすみピンク）
const placeholderColor = C.pinkMuted

// 共通入力スタイル（統一版：高さ44 / 角丸12 / boxSizing厳守）
const inputBase: React.CSSProperties = {
  width: '100%',
  height: 44,
  background: '#FFFAFC',
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '0 14px',
  fontSize: 13,
  color: C.dark,
  letterSpacing: '0.04em',
  outline: 'none',
  transition: 'all 0.2s',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  display: 'block',
}

const selectBase: React.CSSProperties = {
  ...inputBase,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23E8879B' stroke-width='1.8'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: 36,
  cursor: 'pointer',
}

const textareaBase: React.CSSProperties = {
  ...inputBase,
  height: 'auto',
  minHeight: 96,
  padding: 14,
  lineHeight: 1.7,
  resize: 'vertical',
  display: 'block',
}

// ─── メインフォーム ─────────────────────────────────────────────────
interface CustomerFormProps {
  initialData?: Partial<Customer>
  onSubmit: (data: Partial<Customer>) => void | Promise<void>
  onCancel?: () => void
  inOverlay?: boolean
}

export default function CustomerForm({ initialData, onSubmit, onCancel }: CustomerFormProps) {
  const { isPC } = useViewMode()
  const [submitting, setSubmitting] = useState(false)
  type CustomerFormData = Omit<Partial<Customer>, 'region'> & {
    region?: Customer['region'] | null
  }
  const [formData, setFormData] = useState<CustomerFormData>({
    customer_name: '',
    nickname: '',
    cast_name: '',
    cast_type: undefined,
    has_customer_staff: false,
    nomination_status: undefined,
    age_group: undefined,
    occupation: undefined,
    region: null,
    spouse_status: undefined,
    birthday: '',
    blood_type: '',
    hobby: '',
    nomination_route: undefined,
    relationship_type: undefined,
    phase: undefined,
    customer_rank: undefined,
    sales_expectation: undefined,
    trend: undefined,
    favorite_type: undefined,
    ng_items: '',
    warning_points: '',
    score: undefined,
    memo: '',
    monthly_target_visits: undefined,
    monthly_target_sales: undefined,
    actual_visit_frequency: '',
    recommended_contact_frequency: '',
    last_contact_date: '',
    next_contact_date: '',
    first_visit_date: '',
    ...initialData,
  })

  // キャスト本人の新規登録では担当名を自動入力し、入力負担を増やさない。
  useEffect(() => {
    let cancelled = false
    const fillOwnCast = async () => {
      const me = await fetchMe()
      if (cancelled || me?.role !== 'cast' || !me.cast_name) return
      setFormData(prev => prev.cast_name ? prev : { ...prev, cast_name: me.cast_name ?? undefined })
    }
    fillOwnCast()
    return () => { cancelled = true }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'score' || name.includes('target')) {
      const normalized = normalizeNumberInput(value)
      setFormData((prev) => ({
        ...prev,
        [name]: normalized === '' ? undefined : Number(normalized),
      }))
    } else if (name === 'region') {
      // 地域は空欄へ戻した場合も更新 API に渡し、DB では NULL として保存する。
      setFormData(prev => ({ ...prev, region: value === '' ? null : value as Customer['region'] }))
    } else {
      // ★ 空文字は DB の CHECK 制約に違反するため undefined に正規化
      //   （customer_rank が '' のときに INSERT で 23514 エラー）
      const cleaned = value === '' ? undefined : value
      setFormData((prev) => ({ ...prev, [name]: cleaned }))
    }
  }

  const toggleNGTag = (tag: string) => {
    const currentTags = formData.ng_items ? formData.ng_items.split(',').filter(Boolean) : []
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag]
    setFormData((prev) => ({ ...prev, ng_items: newTags.join(',') }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    // ★ 保険：すべての文字列フィールドで空文字を undefined に正規化
    //   （旧データ編集や handleChange 経由しない値の漏れ対策）
    const normalizedFormData: typeof formData = { ...formData }
    for (const key of Object.keys(normalizedFormData) as Array<keyof typeof normalizedFormData>) {
      if (normalizedFormData[key] === '') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(normalizedFormData as any)[key] = undefined
      }
    }
    const submissionData = {
      ...normalizedFormData,
      score: normalizedFormData.score ?? undefined,
      monthly_target_visits: normalizedFormData.monthly_target_visits ?? 0,
      monthly_target_sales: normalizedFormData.monthly_target_sales ?? 0,
    }
    // 診断ロジックは地域を参照しない。フォーム送信用には NULL を保持する。
    const diagnosis = diagnoseCustomer(submissionData as Partial<Customer>)
    const finalData = {
      ...submissionData,
      ...diagnosis,
      warning_points: formData.warning_points || diagnosis.warning_points,
    }
    try {
      await onSubmit(finalData as Partial<Customer>)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedNG = formData.ng_items ? formData.ng_items.split(',').filter(Boolean) : []

  return (
    <form
      className="eclat-customer-form"
      onSubmit={handleSubmit}
      style={{
        maxWidth: isPC ? 820 : 420,
        margin: '0 auto',
        paddingBottom: 40,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'stretch',
      }}>
      {/* スマホでは長いフォームの途中からでも保存できる固定ボタンを表示する。
          最下部の通常の保存・キャンセル操作は従来どおり残す。 */}
      <button
        className="eclat-customer-form-mobile-save"
        type="submit"
        disabled={submitting}
        aria-label={submitting ? '保存中' : '入力内容を保存する'}
      >
        {submitting ? '保存中…' : '入力内容を保存する'}
      </button>

      {/* ─── 1. 常に見せる基本プロフィール ─── */}
      <Card>
        <SectionTitle label="まず入力してほしい情報" sub="お客様名以外は未登録でも保存できます。会話の中で少しずつ集めてください。" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel required>お客様名（呼び名・仮名でもOK）</FieldLabel>
            <input
              type="text"
              name="customer_name"
              value={formData.customer_name || ''}
              onChange={handleChange}
              placeholder="例：たーくん、山田さん"
              className="eclat-input"
              style={inputBase}
              required
            />
          </div>

          <div>
            <FieldLabel>ニックネーム</FieldLabel>
            <input
              type="text"
              name="nickname"
              value={formData.nickname || ''}
              onChange={handleChange}
              placeholder="例：たーくん"
              className="eclat-input"
              style={inputBase}
            />
          </div>

          <div>
            <div>
              <FieldLabel>年代</FieldLabel>
              <select name="age_group" value={formData.age_group || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.age_group ? C.dark : placeholderColor }}>
                <option value="">未登録</option>
                {ages.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isPC ? '1fr 1fr' : '1fr', gap: 12 }}>
            <div>
              <FieldLabel>地域</FieldLabel>
              <select name="region" value={formData.region || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.region ? C.dark : placeholderColor }}>
                <option value="">未登録</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>既婚</FieldLabel>
              <select name="spouse_status" value={formData.spouse_status || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.spouse_status ? C.dark : placeholderColor }}>
                <option value="">未登録</option>
                {spouses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>職業</FieldLabel>
            <select name="occupation" value={formData.occupation || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.occupation ? C.dark : placeholderColor }}>
              <option value="">未登録</option>
              {occupations.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>指名状況</FieldLabel>
            <select name="nomination_status" value={formData.nomination_status || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.nomination_status ? C.dark : placeholderColor }}>
              <option value="">未登録</option>
              {nominationStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <CollapsibleSection title="プロフィールを詳しく入力" description="誕生日・血液型・趣味や話題">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14 }}>
          <div>
            <FieldLabel>誕生日</FieldLabel>
            <ClearableInput
              type="date"
              value={formData.birthday || ''}
              onChange={(v) => setFormData({ ...formData, birthday: v })}
              className="eclat-input"
              style={inputBase}
            />
          </div>
          <div>
            <FieldLabel>血液型</FieldLabel>
            <input
              type="text"
              name="blood_type"
              value={formData.blood_type || ''}
              onChange={handleChange}
              placeholder="例：O型"
              className="eclat-input"
              style={inputBase}
            />
          </div>
          <div>
            <FieldLabel>趣味・話題</FieldLabel>
            <input
              type="text"
              name="hobby"
              value={formData.hobby || ''}
              onChange={handleChange}
              placeholder="例：ゴルフ、車、食事"
              className="eclat-input"
              style={inputBase}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* ─── 2. 担当・指名経緯 ─── */}
      <CollapsibleSection title="担当・指名経緯" description="担当キャスト・指名経緯・キャストタイプ">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14 }}>
          <div>
            <FieldLabel>担当キャスト</FieldLabel>
            <input
              type="text"
              name="cast_name"
              value={formData.cast_name || ''}
              onChange={handleChange}
              placeholder="キャスト名を入力"
              className="eclat-input"
              style={inputBase}
            />
          </div>

          {/* お客様担当チェックボックス */}
          <div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              cursor: 'pointer', padding: '10px 0',
            }}>
              <input
                type="checkbox"
                checked={formData.has_customer_staff === true}
                onChange={(event) => setFormData(prev => ({
                  ...prev,
                  has_customer_staff: event.target.checked,
                }))}
                style={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  accentColor: C.pink,
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: '12px', color: C.dark, letterSpacing: '0.05em' }}>
                お客様担当が関わっている
              </span>
            </label>
          </div>

          <div>
            <FieldLabel>キャストタイプ</FieldLabel>
            <select name="cast_type" value={formData.cast_type || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.cast_type ? C.dark : placeholderColor }}>
              <option value="">未登録</option>
              {castTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>指名経緯</FieldLabel>
            <select name="nomination_route" value={formData.nomination_route || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.nomination_route ? C.dark : placeholderColor }}>
              <option value="">未登録</option>
              {routes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* ─── 3. 営業ステータス ─── */}
      <CollapsibleSection title="営業情報を詳しく入力" description="ランク・関係性・売上期待・トレンド">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isPC ? '1fr 1fr' : '1fr', gap: 12 }}>
            <div>
              <FieldLabel>ランク</FieldLabel>
              <select
                name="customer_rank"
                value={formData.customer_rank || ''}
                onChange={handleChange}
                className="eclat-input eclat-highlight"
                style={{
                  ...selectBase,
                  color: formData.customer_rank ? C.pink : placeholderColor,
                  borderColor: C.pink,
                  fontWeight: 600,
                }}
              >
                <option value="" style={{ background: C.white, color: C.pinkMuted }}>未登録</option>
                {ranks.map((r) => (
                  <option key={r} value={r} style={{ background: C.white, color: C.dark }}>
                    {r === '切れた' ? '💔 切れた' : `${r} ランク`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>色恋関係値</FieldLabel>
              <select
                name="score"
                value={formData.score ?? ''}
                onChange={handleChange}
                className="eclat-input"
                style={{
                  ...selectBase,
                  color: formData.score != null ? C.dark : placeholderColor,
                }}
              >
                <option value="" style={{ background: C.white, color: C.pinkMuted }}>未登録</option>
                <option value="1" style={{ background: C.white, color: C.dark }}>1 - 軽いボディタッチ</option>
                <option value="2" style={{ background: C.white, color: C.dark }}>2 - 0センチ接客</option>
                <option value="3" style={{ background: C.white, color: C.dark }}>3 - 店外接客（同伴・アフター）</option>
                <option value="4" style={{ background: C.white, color: C.dark }}>4 - キスまで</option>
                <option value="5" style={{ background: C.white, color: C.dark }}>5 - プライベートな関係</option>
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>関係性</FieldLabel>
            <select name="phase" value={formData.phase || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.phase ? C.dark : placeholderColor }}>
              <option value="">未登録</option>
              {phases.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isPC ? '1fr 1fr' : '1fr', gap: 12 }}>
            <div>
              <FieldLabel>売上期待値</FieldLabel>
              <select name="sales_expectation" value={formData.sales_expectation || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.sales_expectation ? C.dark : placeholderColor }}>
                <option value="">未登録</option>
                {expectations.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>トレンド</FieldLabel>
              <select name="trend" value={formData.trend || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.trend ? C.dark : placeholderColor }}>
                <option value="">未登録</option>
                {trends.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ─── 4. 好み・注意事項 ─── */}
      <CollapsibleSection title="好み・注意事項" description="好みのタイプ・NG・接客上の注意">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14 }}>
          <div>
            <FieldLabel>好みのタイプ</FieldLabel>
            <select name="favorite_type" value={formData.favorite_type || ''} onChange={handleChange} className="eclat-input" style={{ ...selectBase, color: formData.favorite_type ? C.dark : placeholderColor }}>
              <option value="">未登録</option>
              {favorites.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>NGタグ選択</FieldLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '4px' }}>
              {NG_GROUPS.map((group) => group.tags.length > 0 && (
                <div key={group.label}>
                  <p style={{
                    fontSize: '9px',
                    letterSpacing: '0.2em',
                    color: C.pinkMuted,
                    borderLeft: `2px solid ${C.pink}`,
                    paddingLeft: '8px',
                    margin: '0 0 8px 0',
                  }}>
                    {group.label}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {group.tags.map((tag) => {
                      const isSelected = selectedNG.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleNGTag(tag)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '11px',
                            letterSpacing: '0.04em',
                            background: isSelected
                              ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                              : C.tagBg,
                            color: isSelected ? C.white : C.tagText,
                            border: `1px solid ${isSelected ? C.pink : C.border}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 選択中のNGタグ説明 */}
            {selectedNG.length > 0 && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: '#FFF8F9',
                border: `1px solid ${C.border}`,
                display: 'flex', flexDirection: 'column', gap: '6px',
              }}>
                <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pink, margin: '0 0 4px 0', fontWeight: 600 }}>
                  選択中のNG — {selectedNG.length}件
                </p>
                {selectedNG.map(tag => (
                  <div key={tag} style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: C.dark, flexShrink: 0 }}>・{tag}</span>
                    {NG_DESCRIPTIONS[tag] && (
                      <span style={{ fontSize: '10px', color: C.pinkMuted, lineHeight: 1.5 }}>
                        {NG_DESCRIPTIONS[tag]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <FieldLabel>やってはいけないこと・注意点（本文）</FieldLabel>
            <textarea
              name="warning_points"
              value={formData.warning_points || ''}
              onChange={handleChange}
              rows={4}
              placeholder="具体的なNG行動や注意点を入力..."
              className="eclat-input"
              style={textareaBase}
            />
          </div>

        </div>
      </CollapsibleSection>

      {/* ─── 5. 目標・データ ─── */}
      <CollapsibleSection title="目標・来店記録" description="初来店日・月間目標">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14 }}>
          <div>
            <FieldLabel>初来店日</FieldLabel>
            <ClearableInput
              type="date"
              value={formData.first_visit_date || ''}
              onChange={(v) => setFormData({ ...formData, first_visit_date: v })}
              className="eclat-input"
              style={inputBase}
            />
          </div>

          <div>
            <FieldLabel>月間目標来店数</FieldLabel>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                inputMode="numeric"
                name="monthly_target_visits"
                value={formData.monthly_target_visits ?? ''}
                onChange={handleChange}
                placeholder="4"
                className="eclat-input"
                style={{ ...inputBase, paddingRight: '44px' }}
              />
              <span style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '11px',
                letterSpacing: '0.15em',
                color: C.pinkMuted,
              }}>
                回
              </span>
            </div>
          </div>

          <div>
            <FieldLabel>月間目標売上</FieldLabel>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                inputMode="numeric"
                name="monthly_target_sales"
                value={formData.monthly_target_sales ?? ''}
                onChange={handleChange}
                placeholder="100000"
                className="eclat-input"
                style={{ ...inputBase, paddingRight: '44px' }}
              />
              <span style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '11px',
                letterSpacing: '0.15em',
                color: C.pinkMuted,
              }}>
                円
              </span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* メモは折りたたまず、保存ボタンの直前に常時表示する。 */}
      <Card>
        <SectionTitle label="メモ" sub="会話内容・性格・次に話したいことなど、自由に残せます。" />
        <textarea
          name="memo"
          value={formData.memo || ''}
          onChange={handleChange}
          rows={5}
          placeholder="ここをタップしてすぐにメモできます"
          className="eclat-input"
          style={textareaBase}
        />
      </Card>

      {/* ─── 保存操作 ─── */}
      <div style={{
        position: 'relative',
        width: '100%',
        background: C.bg,
        padding: '4px 0 12px',
        zIndex: 30,
      }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            height: 56,
            background: submitting
              ? `linear-gradient(135deg, ${C.pinkLight}, ${C.pink})`
              : `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
            color: C.white,
            border: 'none',
            borderRadius: 18,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.3em',
            cursor: submitting ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: submitting ? 0.7 : 1,
            boxShadow: '0 8px 20px rgba(232,135,154,0.32)',
            fontFamily: 'inherit',
          }}
        >
          {submitting ? '保存中…' : 'この内容で保存する'}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              width: '100%',
              height: 40,
              marginTop: 8,
              background: 'rgba(255,255,255,0.85)',
              color: C.pinkMuted,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              fontSize: 10,
              letterSpacing: '0.25em',
              cursor: 'pointer',
              transition: 'color 0.2s',
              fontFamily: 'inherit',
            }}
          >
            キャンセル
          </button>
        )}
      </div>

      {/* フォーカス & hover 用スタイル */}
      <style>{`
        .eclat-input:focus {
          border: 1px solid ${C.pink} !important;
          background-color: ${C.white} !important;
          box-shadow: 0 0 0 2px rgba(232,135,154,0.15);
        }
        .eclat-input.eclat-highlight:focus {
          box-shadow: 0 0 0 2px rgba(232,135,154,0.25);
        }
        .eclat-input::placeholder {
          color: ${C.pinkMuted};
          opacity: 0.55;
          letter-spacing: 0.08em;
        }
        details > summary::-webkit-details-marker { display: none; }
        details[open] > summary .eclat-details-toggle { transform: rotate(45deg); }
        button:active { opacity: 0.85; }
        .eclat-customer-form-mobile-save {
          display: none;
        }
        @media (max-width: 767px) {
          .eclat-customer-form {
            padding-bottom: 120px !important;
          }
          .eclat-customer-form-mobile-save {
            position: fixed;
            left: 50%;
            bottom: calc(10px + env(safe-area-inset-bottom, 0px));
            z-index: 130;
            transform: translateX(-50%);
            display: block;
            width: calc(100% - 32px);
            max-width: 388px;
            height: 54px;
            padding: 0 18px;
            border: 1px solid rgba(255,255,255,0.7);
            border-radius: 18px;
            background: linear-gradient(135deg, ${C.pink}, ${C.pinkLight});
            color: ${C.white};
            box-shadow: 0 10px 28px rgba(232,135,154,0.42);
            font-family: inherit;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.12em;
            cursor: pointer;
          }
          .eclat-customer-form-mobile-save:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }
        }
      `}</style>
    </form>
  )
}
