'use client'
// ─────────────────────────────────────────────────────────────────
//  /admin/rank-criteria — 顧客ランク自動判定の基準設定（オーナー専用）
// ─────────────────────────────────────────────────────────────────
//  rank_criteria テーブルの 1 行を編集する画面。
//  is_owner=true のみ閲覧・編集可。RLS でも保護されているが、
//  クライアント側でも早期に弾く。
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/colors'
import { createClient } from '@/lib/supabase/client'
import type { RankCriteria } from '@/types'

export default function RankCriteriaPage() {
  const router = useRouter()
  const supabase = createClient()
  const [authChecked, setAuthChecked] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [criteria, setCriteria] = useState<RankCriteria | null>(null)
  const [originalCriteria, setOriginalCriteria] = useState<RankCriteria | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ─── 認証チェック ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) throw new Error('NOT_AUTH')
        const me = await res.json()
        if (cancelled) return
        if (me.is_owner !== true) {
          setAllowed(false)
          setAuthChecked(true)
          // 1秒後にリダイレクト
          setTimeout(() => router.push('/admin/casts'), 1500)
          return
        }
        setAllowed(true)
        setAuthChecked(true)
      } catch {
        if (cancelled) return
        setAllowed(false)
        setAuthChecked(true)
        setTimeout(() => router.push('/login'), 1500)
      }
    }
    check()
    return () => { cancelled = true }
  }, [router])

  // ─── 設定の取得 ───────────────────────────────────────────────
  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('rank_criteria')
          .select('*')
          .limit(1)
          .maybeSingle()
        if (error) throw error
        if (!data) throw new Error('rank_criteria が空です。マイグレーションを再実行してください。')
        if (!cancelled) {
          setCriteria(data as RankCriteria)
          setOriginalCriteria(data as RankCriteria)
          setLoading(false)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [allowed, supabase])

  // ─── 保存 ────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!criteria) return
    setSaving(true)
    setError(null)
    try {
      const { id, created_at, updated_at, ...updates } = criteria
      void created_at; void updated_at; // 使わない（DB側で自動更新）
      const { error } = await supabase
        .from('rank_criteria')
        .update(updates)
        .eq('id', id)
      if (error) throw error
      setOriginalCriteria(criteria)
      setSavedAt(new Date())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : '保存に失敗しました'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [criteria, supabase])

  const reset = useCallback(() => {
    if (originalCriteria) setCriteria(originalCriteria)
    setSavedAt(null)
  }, [originalCriteria])

  const dirty = !!criteria && !!originalCriteria &&
    JSON.stringify(criteria) !== JSON.stringify(originalCriteria)

  // ─── 共通: フィールド更新ヘルパ ────────────────────────────
  const update = <K extends keyof RankCriteria>(key: K, value: RankCriteria[K]) => {
    setCriteria(prev => prev ? { ...prev, [key]: value } : prev)
  }

  // ─── 認証中 / 拒否時 ────────────────────────────────────────
  if (!authChecked) {
    return <Centered>確認中...</Centered>
  }
  if (!allowed) {
    return <Centered>このページはオーナーのみ閲覧できます。元の画面へ戻ります...</Centered>
  }
  if (loading) {
    return <Centered>読み込み中...</Centered>
  }
  if (error && !criteria) {
    return <Centered><span style={{ color: C.danger }}>エラー: {error}</span></Centered>
  }
  if (!criteria) return null

  // ─── 万円換算ヘルパー（金額は DB に円で持つけど UI は万円で） ───
  const yenToMan = (yen: number) => Math.round(yen / 10000)
  const manToYen = (man: number) => Math.max(0, Math.round(man * 10000))

  return (
    <div style={{
      maxWidth: '640px', margin: '0 auto',
      padding: '20px 16px 80px', fontFamily: 'inherit',
    }}>
      {/* ─── ヘッダー ─── */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => router.push('/admin/casts')}
          style={{
            background: 'transparent', border: 'none',
            color: C.pinkMuted, fontSize: '11px', letterSpacing: '0.15em',
            cursor: 'pointer', padding: 0, marginBottom: 8, fontFamily: 'inherit',
          }}
        >← スタッフ管理に戻る</button>
        <h1 style={{
          fontSize: '17px', fontWeight: 700, color: C.dark, margin: 0,
        }}>
          📊 顧客ランク設定
        </h1>
        <p style={{ fontSize: '11px', color: C.pinkMuted, marginTop: 4 }}>
          本指名顧客の S/A/B/C ランクを「事実」から自動算出する基準を設定します（オーナー専用）。
        </p>
      </div>

      {/* ─── 月次売上 ─── */}
      <Section
        title="月次売上のランク基準"
        enabled={criteria.monthly_enabled}
        onToggle={v => update('monthly_enabled', v)}
        hint="直近 N ヶ月の月平均売上で S/A/B/C を判定します。"
      >
        <ThresholdRow label="S ランク" value={yenToMan(criteria.monthly_s_threshold)}
          unit="万円以上" disabled={!criteria.monthly_enabled}
          onChange={v => update('monthly_s_threshold', manToYen(v))} />
        <ThresholdRow label="A ランク" value={yenToMan(criteria.monthly_a_threshold)}
          unit="万円以上" disabled={!criteria.monthly_enabled}
          onChange={v => update('monthly_a_threshold', manToYen(v))} />
        <ThresholdRow label="B ランク" value={yenToMan(criteria.monthly_b_threshold)}
          unit="万円以上" disabled={!criteria.monthly_enabled}
          onChange={v => update('monthly_b_threshold', manToYen(v))} />
        <ThresholdRow label="月平均の計算期間"
          value={criteria.monthly_period_months}
          unit="ヶ月" disabled={!criteria.monthly_enabled}
          onChange={v => update('monthly_period_months', Math.max(1, Math.round(v)))} />
      </Section>

      {/* ─── 累計売上 ─── */}
      <Section
        title="累計売上のランク基準"
        enabled={criteria.cumulative_enabled}
        onToggle={v => update('cumulative_enabled', v)}
        hint="累計売上で S/A/B/C を判定します。長く通ってる客の貢献を反映します。"
      >
        <ThresholdRow label="S ランク" value={yenToMan(criteria.cumulative_s_threshold)}
          unit="万円以上" disabled={!criteria.cumulative_enabled}
          onChange={v => update('cumulative_s_threshold', manToYen(v))} />
        <ThresholdRow label="A ランク" value={yenToMan(criteria.cumulative_a_threshold)}
          unit="万円以上" disabled={!criteria.cumulative_enabled}
          onChange={v => update('cumulative_a_threshold', manToYen(v))} />
        <ThresholdRow label="B ランク" value={yenToMan(criteria.cumulative_b_threshold)}
          unit="万円以上" disabled={!criteria.cumulative_enabled}
          onChange={v => update('cumulative_b_threshold', manToYen(v))} />
      </Section>

      {/* ─── 合算方針 ─── */}
      <Section title="月次と累計の合算方針" hint="月次ランクと累計ランクが違うときの扱いを決めます。">
        <RadioRow
          options={[
            { value: 'higher', label: '高い方を採用（過去の貢献を讃える）' },
            { value: 'lower',  label: '低い方を採用（厳しめ評価、現状重視）' },
            { value: 'monthly_first', label: '月次優先（累計は同点時のタイブレーカー）' },
          ]}
          value={criteria.combine_strategy}
          onChange={v => update('combine_strategy', v as RankCriteria['combine_strategy'])}
        />
      </Section>

      {/* ─── 補正: 来店頻度 ─── */}
      <Section
        title="来店頻度ボーナス"
        enabled={criteria.frequency_enabled}
        onToggle={v => update('frequency_enabled', v)}
        hint="直近3ヶ月の月平均来店回数でランクを上下します。"
      >
        <ThresholdRow label="月平均"
          value={criteria.frequency_high_threshold} unit="回以上 → +1ランク"
          disabled={!criteria.frequency_enabled}
          onChange={v => update('frequency_high_threshold', Math.max(0, Math.round(v)))} />
        <ThresholdRow label="月平均"
          value={criteria.frequency_low_threshold} unit="回未満 → -1ランク"
          disabled={!criteria.frequency_enabled}
          onChange={v => update('frequency_low_threshold', Math.max(0, Math.round(v)))} />
      </Section>

      {/* ─── 補正: 同伴率 ─── */}
      <Section
        title="同伴率ボーナス"
        enabled={criteria.douhan_rate_enabled}
        onToggle={v => update('douhan_rate_enabled', v)}
        hint="来店回数のうち同伴の割合（%）でランクアップします。"
      >
        <ThresholdRow label="同伴率"
          value={criteria.douhan_rate_threshold} unit="% 以上 → +1ランク"
          disabled={!criteria.douhan_rate_enabled}
          onChange={v => update('douhan_rate_threshold', Math.max(0, Math.min(100, Math.round(v))))} />
      </Section>

      {/* ─── 補正: 直近トレンド ─── */}
      <Section
        title="直近トレンドボーナス"
        enabled={criteria.trend_enabled}
        onToggle={v => update('trend_enabled', v)}
        hint="直近3ヶ月 vs その前3ヶ月の月平均比でランクを上下します。"
      >
        <ThresholdRow label="比率"
          value={criteria.trend_up_multiplier} unit="倍以上 → +1ランク（上昇）"
          step={0.1}
          disabled={!criteria.trend_enabled}
          onChange={v => update('trend_up_multiplier', Math.max(0, Number(v.toFixed(2))))} />
        <ThresholdRow label="比率"
          value={criteria.trend_down_multiplier} unit="倍以下 → -1ランク（下降）"
          step={0.1}
          disabled={!criteria.trend_enabled}
          onChange={v => update('trend_down_multiplier', Math.max(0, Number(v.toFixed(2))))} />
      </Section>

      {/* ─── 補正: 客単価 ─── */}
      <Section
        title="客単価ボーナス"
        enabled={criteria.unit_price_enabled}
        onToggle={v => update('unit_price_enabled', v)}
        hint="1来店あたりの平均単価がしきい値以上でランクアップ。"
      >
        <ThresholdRow label="1回あたり"
          value={yenToMan(criteria.unit_price_threshold)} unit="万円以上 → +1ランク"
          disabled={!criteria.unit_price_enabled}
          onChange={v => update('unit_price_threshold', manToYen(v))} />
      </Section>

      {/* ─── 補正: 継続月数 ─── */}
      <Section
        title="継続月数ボーナス"
        enabled={criteria.tenure_enabled}
        onToggle={v => update('tenure_enabled', v)}
        hint="初回来店から今日までの月数。長く通う客への加点。"
      >
        <ThresholdRow label="継続"
          value={criteria.tenure_threshold_months} unit="ヶ月以上 → +1ランク"
          disabled={!criteria.tenure_enabled}
          onChange={v => update('tenure_threshold_months', Math.max(0, Math.round(v)))} />
      </Section>

      {/* ─── 補正: アフター率 ─── */}
      <Section
        title="アフター率ボーナス"
        enabled={criteria.after_rate_enabled}
        onToggle={v => update('after_rate_enabled', v)}
      >
        <ThresholdRow label="アフター率"
          value={criteria.after_rate_threshold} unit="% 以上 → +1ランク"
          disabled={!criteria.after_rate_enabled}
          onChange={v => update('after_rate_threshold', Math.max(0, Math.min(100, Math.round(v))))} />
      </Section>

      {/* ─── 非アクティブ判定 ─── */}
      <Section
        title="非アクティブ判定"
        enabled={criteria.inactive_enabled}
        onToggle={v => update('inactive_enabled', v)}
        hint="一定期間来店がない客を機械的に格下げ。"
      >
        <ThresholdRow label="直近"
          value={criteria.inactive_warning_days} unit="日以上来店なし → -1ランク"
          disabled={!criteria.inactive_enabled}
          onChange={v => update('inactive_warning_days', Math.max(0, Math.round(v)))} />
        <ThresholdRow label="直近"
          value={criteria.inactive_force_c_days} unit="日以上来店なし → 強制 C"
          disabled={!criteria.inactive_enabled}
          onChange={v => update('inactive_force_c_days', Math.max(0, Math.round(v)))} />
      </Section>

      {/* ─── 補正の上限 ─── */}
      <Section
        title="補正の上限"
        hint="ランクの上下動を最大何段階までに制限するか。+2 なら C → A の急昇まで許容。"
      >
        <ThresholdRow label="ランク上下動の最大"
          value={criteria.max_adjustment_steps} unit="段階"
          onChange={v => update('max_adjustment_steps', Math.max(0, Math.min(3, Math.round(v))))} />
      </Section>

      {/* ─── 保存バー ─── */}
      <div style={{
        position: 'sticky', bottom: 0, background: '#FFF',
        padding: '12px 0 8px', marginTop: '20px',
        borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: '10px', alignItems: 'center',
      }}>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            flex: 1, fontSize: '13px', fontWeight: 700,
            padding: '12px', borderRadius: 8,
            background: dirty ? C.pink : C.tagBg,
            color: dirty ? '#FFF' : C.pinkMuted,
            border: 'none', cursor: !dirty || saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '保存中...' : dirty ? '保存' : '変更なし'}
        </button>
        {dirty && (
          <button
            onClick={reset}
            disabled={saving}
            style={{
              fontSize: '12px', padding: '12px 16px', borderRadius: 8,
              background: 'transparent', color: C.dark,
              border: `1px solid ${C.border}`,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >元に戻す</button>
        )}
      </div>

      {savedAt && !dirty && (
        <p style={{ fontSize: '11px', color: '#229954', marginTop: 6, textAlign: 'center' }}>
          ✓ 保存しました（{savedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）
        </p>
      )}
      {error && (
        <p style={{ fontSize: '11px', color: C.danger, marginTop: 6, textAlign: 'center' }}>
          {error}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
//  サブコンポーネント
// ─────────────────────────────────────────────────────────────────

function Section({
  title, enabled, onToggle, hint, children,
}: {
  title: string
  enabled?: boolean
  onToggle?: (v: boolean) => void
  hint?: string
  children: React.ReactNode
}) {
  const hasToggle = enabled !== undefined && onToggle
  const off = hasToggle && !enabled

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '12px 14px', marginBottom: '10px',
      background: off ? '#FAFAF9' : '#FFF',
      opacity: off ? 0.6 : 1,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: hint ? 2 : 8,
      }}>
        <h2 style={{
          fontSize: '13px', fontWeight: 600, color: C.dark, margin: 0,
        }}>{title}</h2>
        {hasToggle && (
          <button
            onClick={() => onToggle!(!enabled)}
            style={{
              width: '40px', height: '22px', borderRadius: '11px',
              background: enabled ? C.pink : '#D0C8CC',
              border: 'none', cursor: 'pointer', position: 'relative', padding: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: '2px',
              left: enabled ? '20px' : '2px',
              width: '18px', height: '18px', borderRadius: '50%',
              background: '#FFF', transition: 'left 0.2s',
            }} />
          </button>
        )}
      </div>
      {hint && (
        <p style={{
          fontSize: '10px', color: C.pinkMuted,
          margin: '0 0 8px 0', lineHeight: 1.5,
        }}>{hint}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

function ThresholdRow({
  label, value, unit, onChange, disabled, step,
}: {
  label: string
  value: number
  unit: string
  onChange: (v: number) => void
  disabled?: boolean
  step?: number
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '12px',
    }}>
      <span style={{ flex: 1, color: disabled ? C.pinkMuted : C.dark }}>{label}</span>
      <input
        type="number"
        value={value}
        step={step ?? 1}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '70px', padding: '5px 8px',
          border: `1px solid ${C.border}`,
          borderRadius: 6, fontSize: '12px',
          textAlign: 'right', fontFamily: 'inherit',
          background: disabled ? '#F5F5F5' : '#FFF',
        }}
      />
      <span style={{ color: disabled ? C.pinkMuted : C.dark, fontSize: '11px', minWidth: 0 }}>
        {unit}
      </span>
    </div>
  )
}

function RadioRow<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {options.map(opt => (
        <label key={opt.value} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '12px', color: C.dark, cursor: 'pointer',
          padding: '6px 8px', borderRadius: 6,
          background: value === opt.value ? 'rgba(232,135,155,0.06)' : 'transparent',
        }}>
          <input
            type="radio"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '12px', color: C.pinkMuted, padding: '20px',
    }}>
      {children}
    </div>
  )
}
