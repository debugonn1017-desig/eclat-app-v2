'use client'

import { useState } from 'react'
import {
  Customer,
  CustomerRank,
  NominationRoute,
  AgeGroup,
  Occupation,
  REGIONS,
  RelationshipType,
  Phase,
  SpouseStatus,
  FavoriteType,
  SalesExpectation,
  Trend,
  CastType,
} from '@/types'
import { diagnoseCustomer } from '@/lib/diagnosis'

// ─── カラーパレット ────────────────────────────────────────────────
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
  dangerBg: '#FDF4F1',
}

// ─── 選択肢定数 ─────────────────────────────────────────────────────
const ranks: CustomerRank[] = ['S', 'A', 'B', 'C']
const routes: NominationRoute[] = [
  '前店舗顧客', 'SNS指名', '紹介指名', '店舗外指名', '場内指名→本指名',
  'フリー→本指名', 'ヘルプ→本指名', 'ロイヤル層→本指名', 'その他',
]
const ages: AgeGroup[] = ['20代', '30代', '40代', '50代以上']
const occupations: Occupation[] = [
  '経営者', 'サラリーマン', '接待役が多い', '自営業', '医療系', '夜職',
  '公務員・堅い職業', '土業', '不動産', '金融', '建設', '飲食', 'IT', '美容', '広告', '士業', 'その他',
]
const relationships: RelationshipType[] = ['認知', '場内', '初指名', 'リピート', '安定', '来店操作可能']
const phases: Phase[] = ['興味付け', '接点維持', '距離を縮める', '来店を増やす', '固定化する']
const spouses: SpouseStatus[] = ['有', '無']
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

const NG_GROUPS = [
  { label: 'よく使う', tags: ['詰めすぎ営業', '会う前提で話す', '押し売り営業', '断られても食い下がる', '圧をかける'] },
  { label: '連絡', tags: ['既読無視追撃', '返信催促', '連投', '即レス要求', '返信圧', '休日の連絡圧', '返信遅い責め', '頻度高すぎ', '空気を読まない連絡', '予定直前連絡', '未読中の追撃', '返信直後の追撃'] },
  { label: '会話', tags: ['比較トーク', '嫉妬煽り', '下ネタ強すぎ', '重すぎる恋愛話', '試すような発言', '店の裏事情を話す', 'キャスト比較'] },
  { label: '距離感', tags: ['距離の詰めすぎ', '呼び方が重い', '特別感の押し付け', '依存っぽい', '束縛っぽい', '彼女感出しすぎ', '詮索しすぎ', '収入の話', '住所特定系', '交友関係詮索', '恋愛歴の深掘り', '結婚観を詰める', '子どもの話を詰める', '重い対応', '感情的', '拗ねる', '病む感じを出す', '期待を押し付ける'] },
  { label: '営業', tags: ['金の話が多い', 'イベント営業強すぎ', '余裕ない時に営業', '飲みの最中に営業', '間隔短すぎ', '会ってすぐ営業', '来店後すぐ圧'] },
  { label: 'その他', tags: ['キャスト比較'] },
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
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ height: '1px', width: '24px', background: `linear-gradient(90deg, ${C.gold}, transparent)` }} />
        <p style={{ fontSize: '9px', letterSpacing: '0.35em', color: C.gold, margin: 0 }}>{label}</p>
      </div>
      {sub && (
        <p style={{ fontSize: '10px', color: C.goldMuted, letterSpacing: '0.08em', marginTop: '4px', paddingLeft: '34px' }}>
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
      boxShadow: '0 4px 24px rgba(180,120,80,0.06)',
    }}>
      <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight}, ${C.gold})` }} />
      <div style={{ padding: '24px 20px' }}>{children}</div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block',
      fontSize: '9px',
      letterSpacing: '0.25em',
      color: C.goldMuted,
      marginBottom: '8px',
      paddingLeft: '2px',
    }}>
      {children}
    </label>
  )
}

// 共通入力スタイル
const inputBase: React.CSSProperties = {
  width: '100%',
  height: '48px',
  background: C.tagBg,
  border: `1px solid ${C.border}`,
  padding: '0 14px',
  fontSize: '13px',
  color: C.dark,
  letterSpacing: '0.04em',
  outline: 'none',
  transition: 'all 0.2s',
  boxSizing: 'border-box',
}

const selectBase: React.CSSProperties = {
  ...inputBase,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239A7A50' stroke-width='1.8'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: '36px',
  cursor: 'pointer',
}

const textareaBase: React.CSSProperties = {
  ...inputBase,
  height: 'auto',
  minHeight: '96px',
  padding: '14px',
  fontFamily: 'inherit',
  lineHeight: 1.7,
  resize: 'vertical',
}

// ─── メインフォーム ─────────────────────────────────────────────────
interface CustomerFormProps {
  initialData?: Partial<Customer>
  onSubmit: (data: Partial<Customer>) => void | Promise<void>
  onCancel?: () => void
}

export default function CustomerForm({ initialData, onSubmit, onCancel }: CustomerFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState<Partial<Customer>>({
    customer_name: '',
    nickname: '',
    cast_name: '',
    cast_type: '清楚系',
    age_group: '20代',
    occupation: '経営者',
    region: '福岡県',
    spouse_status: '無',
    blood_type: '',
    hobby: '',
    nomination_route: 'その他',
    relationship_type: '認知',
    phase: '興味付け',
    customer_rank: 'C',
    sales_expectation: '低',
    trend: '停滞',
    favorite_type: '可愛い系',
    ng_items: '',
    warning_points: '',
    score: 3,
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'score' || name.includes('target')) {
      const normalized = normalizeNumberInput(value)
      setFormData((prev) => ({
        ...prev,
        [name]: normalized === '' ? undefined : Number(normalized),
      }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
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
    const submissionData = {
      ...formData,
      score: formData.score ?? 3,
      monthly_target_visits: formData.monthly_target_visits ?? 0,
      monthly_target_sales: formData.monthly_target_sales ?? 0,
    }
    const diagnosis = diagnoseCustomer(submissionData)
    const finalData = {
      ...submissionData,
      ...diagnosis,
      warning_points: formData.warning_points || diagnosis.warning_points,
    }
    try {
      await onSubmit(finalData)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedNG = formData.ng_items ? formData.ng_items.split(',').filter(Boolean) : []

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '420px', margin: '0 auto', paddingBottom: '200px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ─── 1. 基本プロフィール ─── */}
      <Card>
        <SectionTitle label="BASIC INFO" sub="基本プロフィール" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <FieldLabel>お客様名 <span style={{ color: C.gold }}>*</span></FieldLabel>
            <input
              type="text"
              name="customer_name"
              value={formData.customer_name || ''}
              onChange={handleChange}
              placeholder="例：山田 太郎"
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <FieldLabel>年代</FieldLabel>
              <select name="age_group" value={formData.age_group} onChange={handleChange} className="eclat-input" style={selectBase}>
                {ages.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>血液型</FieldLabel>
              <input
                type="text"
                name="blood_type"
                value={formData.blood_type || ''}
                onChange={handleChange}
                placeholder="O型"
                className="eclat-input"
                style={inputBase}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <FieldLabel>地域</FieldLabel>
              <select name="region" value={formData.region} onChange={handleChange} className="eclat-input" style={selectBase}>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>既婚</FieldLabel>
              <select name="spouse_status" value={formData.spouse_status} onChange={handleChange} className="eclat-input" style={selectBase}>
                {spouses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>職業</FieldLabel>
            <select name="occupation" value={formData.occupation} onChange={handleChange} className="eclat-input" style={selectBase}>
              {occupations.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>趣味・話題</FieldLabel>
            <input
              type="text"
              name="hobby"
              value={formData.hobby || ''}
              onChange={handleChange}
              placeholder="ゴルフ、車など"
              className="eclat-input"
              style={inputBase}
            />
          </div>
        </div>
      </Card>

      {/* ─── 2. 担当・指名経緯 ─── */}
      <Card>
        <SectionTitle label="CAST & ROUTE" sub="担当・指名経緯" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <FieldLabel>担当キャスト <span style={{ color: C.gold }}>*</span></FieldLabel>
            <input
              type="text"
              name="cast_name"
              value={formData.cast_name || ''}
              onChange={handleChange}
              placeholder="キャスト名を入力"
              className="eclat-input"
              style={inputBase}
              required
            />
          </div>

          <div>
            <FieldLabel>キャストタイプ</FieldLabel>
            <select name="cast_type" value={formData.cast_type} onChange={handleChange} className="eclat-input" style={selectBase}>
              {castTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>指名経緯</FieldLabel>
            <select name="nomination_route" value={formData.nomination_route} onChange={handleChange} className="eclat-input" style={selectBase}>
              {routes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* ─── 3. 営業ステータス ─── */}
      <Card>
        <SectionTitle label="SALES STATUS" sub="営業ステータス" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <FieldLabel>ランク</FieldLabel>
              <select
                name="customer_rank"
                value={formData.customer_rank}
                onChange={handleChange}
                className="eclat-input eclat-highlight"
                style={{
                  ...selectBase,
                  background: `linear-gradient(160deg, ${C.dark}, ${C.dark2})`,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23C9A84C' stroke-width='1.8'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 14px center',
                  color: C.gold,
                  borderColor: C.gold,
                  fontWeight: 500,
                  letterSpacing: '0.15em',
                  fontSize: '14px',
                }}
              >
                {ranks.map((r) => <option key={r} value={r} style={{ background: C.white, color: C.dark }}>{r} ランク</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>色恋度 (1-5)</FieldLabel>
              <input
                type="text"
                inputMode="numeric"
                name="score"
                value={formData.score ?? ''}
                onChange={handleChange}
                placeholder="3"
                className="eclat-input eclat-highlight"
                style={{
                  ...inputBase,
                  background: `linear-gradient(160deg, ${C.dark}, ${C.dark2})`,
                  color: C.gold,
                  borderColor: C.gold,
                  fontWeight: 500,
                  textAlign: 'center',
                  letterSpacing: '0.2em',
                  fontSize: '16px',
                }}
              />
            </div>
          </div>

          <div>
            <FieldLabel>関係性</FieldLabel>
            <select name="relationship_type" value={formData.relationship_type} onChange={handleChange} className="eclat-input" style={selectBase}>
              {relationships.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>営業フェーズ</FieldLabel>
            <select name="phase" value={formData.phase} onChange={handleChange} className="eclat-input" style={selectBase}>
              {phases.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <FieldLabel>売上期待値</FieldLabel>
              <select name="sales_expectation" value={formData.sales_expectation} onChange={handleChange} className="eclat-input" style={selectBase}>
                {expectations.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>トレンド</FieldLabel>
              <select name="trend" value={formData.trend} onChange={handleChange} className="eclat-input" style={selectBase}>
                {trends.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── 4. 好み・注意事項 ─── */}
      <Card>
        <SectionTitle label="PREFERENCE & CAUTION" sub="好み・注意事項" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <FieldLabel>好みのタイプ</FieldLabel>
            <select name="favorite_type" value={formData.favorite_type} onChange={handleChange} className="eclat-input" style={selectBase}>
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
                    color: C.goldMuted,
                    borderLeft: `2px solid ${C.gold}`,
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
                              ? `linear-gradient(160deg, ${C.dark}, ${C.dark2})`
                              : C.tagBg,
                            color: isSelected ? C.gold : C.tagText,
                            border: `1px solid ${isSelected ? C.gold : C.border}`,
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
              style={{
                ...textareaBase,
                background: C.dangerBg,
                borderColor: '#E8C4B8',
                color: C.danger,
              }}
            />
          </div>

          <div>
            <FieldLabel>自由記入メモ</FieldLabel>
            <textarea
              name="memo"
              value={formData.memo || ''}
              onChange={handleChange}
              rows={4}
              placeholder="性格、会話内容など..."
              className="eclat-input"
              style={textareaBase}
            />
          </div>
        </div>
      </Card>

      {/* ─── 5. 目標・データ ─── */}
      <Card>
        <SectionTitle label="GOALS & RECORDS" sub="目標・データ" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <FieldLabel>初来店日</FieldLabel>
            <input
              type="date"
              name="first_visit_date"
              value={formData.first_visit_date || ''}
              onChange={handleChange}
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
                color: C.goldMuted,
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
                color: C.goldMuted,
              }}>
                円
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Fixed Action Bar ─── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '420px',
        background: `linear-gradient(180deg, rgba(251,246,242,0) 0%, ${C.bg} 20%, ${C.bg} 100%)`,
        padding: '20px 16px 24px',
        zIndex: 30,
      }}>
        <div style={{
          background: `linear-gradient(160deg, ${C.dark} 0%, ${C.dark2} 100%)`,
          border: `1px solid ${C.gold}`,
          padding: '2px',
        }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              height: '56px',
              background: 'transparent',
              color: submitting ? C.goldMuted : C.gold,
              border: 'none',
              fontSize: '11px',
              letterSpacing: '0.35em',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? '保存中...' : 'SAVE CUSTOMER —  この内容で保存する'}
          </button>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              width: '100%',
              height: '40px',
              marginTop: '8px',
              background: 'transparent',
              color: C.goldMuted,
              border: 'none',
              fontSize: '9px',
              letterSpacing: '0.3em',
              cursor: 'pointer',
              transition: 'color 0.2s',
            }}
          >
            CANCEL — キャンセル
          </button>
        )}
      </div>

      {/* フォーカス & hover 用スタイル */}
      <style>{`
        .eclat-input:focus {
          border-color: ${C.gold} !important;
          background-color: ${C.white} !important;
          box-shadow: 0 0 0 3px rgba(201,168,76,0.15);
        }
        .eclat-input.eclat-highlight:focus {
          box-shadow: 0 0 0 3px rgba(201,168,76,0.25);
        }
        .eclat-input::placeholder {
          color: ${C.goldMuted};
          opacity: 0.55;
          letter-spacing: 0.08em;
        }
        button:active { opacity: 0.85; }
      `}</style>
    </form>
  )
}
