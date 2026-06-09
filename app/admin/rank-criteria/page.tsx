'use client'
// ─────────────────────────────────────────────────────────────────
//  /admin/rank-criteria — 顧客ランク自動判定の基準設定
// ─────────────────────────────────────────────────────────────────
//  権限: is_owner または「ランク基準.設定」権限
//  v2 (2026-05-09 階層化): scope_type/scope_id で
//    全店デフォルト / 層別 / 個別キャスト の3階層を編集できる。
//  検索順は 個別キャスト > 層 > 全店 (lib/rankCalculator.ts:resolveRankCriteria)
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/colors'
import { createClient } from '@/lib/supabase/client'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'
import type { RankCriteria } from '@/types'
import { CAST_TIERS } from '@/types'
import { invalidateAllCache } from '@/lib/cache'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
// v0.3.39: /api/auth/me を sessionStorage 5分キャッシュ化 (lib/authCache.ts)
import { fetchMe } from '@/lib/authCache'
import PageHeader from '@/components/PageHeader'
import dynamic from 'next/dynamic'
// P2 (2026-05-12): 重いコンポーネントは動的 import でバンドル削減
const RankRulesEditor = dynamic(() => import('@/components/RankRulesEditor'), { ssr: false })
const RecalcAllRanksButton = dynamic(() => import('@/components/RecalcAllRanksButton'), { ssr: false })

type ScopeType = 'default' | 'tier' | 'cast'

type ScopeSelection = {
  type: ScopeType
  /** type='tier' なら層名、'cast' なら castId、'default' なら null */
  id: string | null
}

type CastLite = {
  id: string
  cast_name: string | null
  cast_tier: string | null
  is_active: boolean
}

export default function RankCriteriaPage() {
  const router = useRouter()
  useScrollTopOnMount()
  const supabase = createClient()

  // 認証
  const [authChecked, setAuthChecked] = useState(false)
  const [allowed, setAllowed] = useState(false)

  // 全 rank_criteria 行（階層検索 + どの scope が既に存在するかの判定用）
  const [allRows, setAllRows] = useState<RankCriteria[]>([])
  const [casts, setCasts] = useState<CastLite[]>([])

  // 編集中の scope
  const [scope, setScope] = useState<ScopeSelection>({ type: 'default', id: null })

  // 編集中のフォーム状態（保存前の値）
  const [criteria, setCriteria] = useState<RankCriteria | null>(null)
  const [originalCriteria, setOriginalCriteria] = useState<RankCriteria | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ─── 認証 ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        // v0.3.39: fetchMe() で sessionStorage 5分キャッシュ経由。null は 401/通信エラー。
        const me = await fetchMe()
        if (!me) throw new Error('NOT_AUTH')
        if (cancelled) return
        const hasPerm =
          me.is_owner === true ||
          me.permissions?.['ランク基準.設定'] === true
        if (!hasPerm) {
          setAllowed(false)
          setAuthChecked(true)
          setTimeout(() => router.push('/home'), 1500)
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

  // ─── データ取得（全 criteria + キャスト一覧）─────────────────
  const reloadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: criteriaRows, error: cErr }, { data: castRows, error: castErr }] = await Promise.all([
        supabase.from('rank_criteria').select('*'),
        supabase
          .from('profiles')
          .select('id, cast_name, cast_tier, is_active')
          .eq('role', 'cast')
          .eq('is_active', true)
          .order('cast_name'),
      ])
      if (cErr) throw cErr
      if (castErr) throw castErr
      setAllRows((criteriaRows ?? []) as RankCriteria[])
      setCasts((castRows ?? []) as CastLite[])
      setLoading(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (!allowed) return
    reloadAll()
  }, [allowed, reloadAll])

  // ─── scope が変わったら編集対象の行を切り替え ──────────────
  useEffect(() => {
    if (!allRows.length && scope.type !== 'default') return
    const found = allRows.find(r =>
      r.scope_type === scope.type &&
      (r.scope_id ?? null) === (scope.id ?? null)
    )
    if (found) {
      setCriteria(found)
      setOriginalCriteria(found)
    } else {
      // この scope のレコードはまだ無い（後で「親からコピーして作成」する）
      setCriteria(null)
      setOriginalCriteria(null)
    }
    setSavedAt(null)
    setError(null)
  }, [scope, allRows])

  // ─── 親階層から criteria をコピーして新規作成 ─────────────
  const createFromParent = useCallback(async () => {
    // 親の決定: cast → 同じキャストの層 → default の順、なければ default
    let parent: RankCriteria | null = null
    if (scope.type === 'cast') {
      const cast = casts.find(c => c.id === scope.id)
      if (cast?.cast_tier) {
        parent = allRows.find(r => r.scope_type === 'tier' && r.scope_id === cast.cast_tier) ?? null
      }
      if (!parent) parent = allRows.find(r => r.scope_type === 'default') ?? null
    } else if (scope.type === 'tier') {
      parent = allRows.find(r => r.scope_type === 'default') ?? null
    } else {
      // default を新規作成は通常起きない（マイグレーションで1行入る）
      return
    }
    if (!parent) {
      setError('親階層の設定が見つかりません。先に全店デフォルトを保存してください。')
      return
    }

    setSaving(true)
    setError(null)
    try {
      // 新規 INSERT（id, created_at, updated_at 以外を引き継ぐ）
      const { id, created_at, updated_at, scope_type, scope_id, ...rest } = parent
      void id; void created_at; void updated_at; void scope_type; void scope_id
      const { data, error } = await supabase
        .from('rank_criteria')
        .insert([{
          ...rest,
          scope_type: scope.type,
          scope_id: scope.id,
        }])
        .select('*')
        .single()
      if (error) throw error
      // 取得し直し
      await reloadAll()
      // 新規作成したものを編集対象に
      if (data) {
        setCriteria(data as RankCriteria)
        setOriginalCriteria(data as RankCriteria)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : '作成に失敗しました'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [scope, allRows, casts, supabase, reloadAll])

  // ─── 保存 ────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!criteria) return
    setSaving(true)
    setError(null)
    try {
      const { id, created_at, updated_at, ...updates } = criteria
      void created_at; void updated_at
      const { error } = await supabase
        .from('rank_criteria')
        .update(updates)
        .eq('id', id)
      if (error) throw error
      setOriginalCriteria(criteria)
      setSavedAt(new Date())
      // allRows も最新化
      setAllRows(prev => prev.map(r => r.id === id ? criteria : r))
      // ノルマ/ランク基準は全画面に影響するのでキャッシュ全消し
      invalidateAllCache()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : '保存に失敗しました'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [criteria, supabase])

  // ─── この scope のレコードを削除（親階層に戻す）────────────
  const deleteScope = useCallback(async () => {
    if (!criteria || scope.type === 'default') return
    const ok = window.confirm(
      'この階層の設定を削除します。以降は親階層（層 or 全店）の設定が適用されます。よろしいですか？'
    )
    if (!ok) return
    setSaving(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('rank_criteria')
        .delete()
        .eq('id', criteria.id)
      if (error) throw error
      await reloadAll()
      setCriteria(null)
      setOriginalCriteria(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [criteria, scope, supabase, reloadAll])

  const reset = useCallback(() => {
    if (originalCriteria) setCriteria(originalCriteria)
    setSavedAt(null)
  }, [originalCriteria])

  const dirty = !!criteria && !!originalCriteria &&
    JSON.stringify(criteria) !== JSON.stringify(originalCriteria)

  // ─── 各scope に既存レコードがあるか（バッジ表示用）──────────
  const existingScopeKeys = useMemo(() => {
    return new Set(allRows.map(r => `${r.scope_type}:${r.scope_id ?? ''}`))
  }, [allRows])
  const hasScope = (type: ScopeType, id: string | null) =>
    existingScopeKeys.has(`${type}:${id ?? ''}`)

  // ─── 共通: フィールド更新ヘルパ ────────────────────────────
  const update = <K extends keyof RankCriteria>(key: K, value: RankCriteria[K]) => {
    setCriteria(prev => prev ? { ...prev, [key]: value } : prev)
  }

  // ─── 認証中 / 拒否時 ────────────────────────────────────────
  if (!authChecked) return <Centered><Spinner size="md" label="認証情報を確認中..." /></Centered>
  if (!allowed) return (
    <Centered>
      <EmptyState
        variant="warning"
        title="権限がありません"
        message="このページの閲覧権限がありません。元の画面へ戻ります..."
      />
    </Centered>
  )
  if (loading) return <Centered><Spinner size="md" label="読み込み中..." /></Centered>

  // ─── 万円換算ヘルパー（金額は DB に円で持つけど UI は万円で） ───
  const yenToMan = (yen: number) => Math.round(yen / 10000)
  const manToYen = (man: number) => Math.max(0, Math.round(man * 10000))

  // ─── scope ラベル
  const scopeLabel =
    scope.type === 'default' ? '全店デフォルト' :
    scope.type === 'tier'    ? `${scope.id}（層別）` :
    /* cast */                 `${casts.find(c => c.id === scope.id)?.cast_name ?? ''}（個別）`

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'inherit' }}>
      {/* ─── ヘッダー ─── */}
      <PageHeader
        title="📊 顧客ランク設定"
        subtitle="RANK CRITERIA"
        backFallback="/admin/casts"
      />
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        padding: '20px 16px 80px',
      }}>
        <p style={{ fontSize: '11px', color: C.pinkMuted, marginTop: 0, marginBottom: 14 }}>
          階層: 個別キャスト → 層別 → 全店デフォルト の順で適用されます。
        </p>

      {/* ─── スコープセレクター ─── */}
      <div style={{
        background: '#FFF', border: `1px solid ${C.border}`,
        borderRadius: 10, padding: '12px', marginBottom: '12px',
      }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: C.pink, marginBottom: 8 }}>
          編集する階層
        </div>

        {/* 全店 */}
        <ScopeButton
          active={scope.type === 'default'}
          exists={hasScope('default', null)}
          onClick={() => setScope({ type: 'default', id: null })}
        >
          📊 全店デフォルト
        </ScopeButton>

        {/* 層別 */}
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {CAST_TIERS.map(tier => (
            <ScopeButton
              key={tier}
              active={scope.type === 'tier' && scope.id === tier}
              exists={hasScope('tier', tier)}
              onClick={() => setScope({ type: 'tier', id: tier })}
              compact
            >
              ⭐ {tier}
            </ScopeButton>
          ))}
        </div>

        {/* 個別キャスト */}
        <div style={{ marginTop: 8 }}>
          <select
            value={scope.type === 'cast' ? scope.id ?? '' : ''}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              setScope({ type: 'cast', id: v })
            }}
            style={{
              width: '100%', padding: '8px 10px',
              border: `1px solid ${scope.type === 'cast' ? C.pink : C.border}`,
              borderRadius: 6, fontSize: '12px',
              background: scope.type === 'cast' ? 'rgba(232,135,155,0.04)' : '#FFF',
              fontFamily: 'inherit',
            }}
          >
            <option value="">👤 個別キャストを選ぶ...</option>
            {casts.map(c => (
              <option key={c.id} value={c.id}>
                {c.cast_name}（{c.cast_tier ?? '層未設定'}）
                {hasScope('cast', c.id) ? ' ✓ 設定あり' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{
          marginTop: 10, padding: '6px 10px',
          background: '#FAFAF9', borderRadius: 6,
          fontSize: '11px', color: C.pinkMuted,
        }}>
          編集中: <strong style={{ color: C.dark }}>{scopeLabel}</strong>
        </div>
      </div>

      {/* ─── 編集対象がない場合の「コピーして作成」 ─── */}
      {!criteria && scope.type !== 'default' && (
        <div style={{
          background: C.bgLight, border: `1px dashed ${C.pink}`,
          borderRadius: 10, padding: '20px 16px',
          textAlign: 'center', marginBottom: 12,
        }}>
          <p style={{ fontSize: '12px', color: C.dark, marginBottom: 12 }}>
            この階層の設定はまだありません。<br />
            親階層の値をコピーして作成すると編集できます。
          </p>
          <button
            onClick={createFromParent}
            disabled={saving}
            style={{
              fontSize: '12px', fontWeight: 600, padding: '10px 20px',
              borderRadius: 8, border: 'none',
              background: C.pink, color: '#FFF',
              cursor: 'pointer', fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}
          >
            親階層からコピーして作成
          </button>
        </div>
      )}

      {/* ─── ✨ 新方式 V2 — ランクごとの判定ルール (常に表示) ─── */}
      <RankRulesEditor
        scope={scope}
        criteriaId={criteria?.id ?? null}
        initialRules={criteria?.rank_rules ?? null}
        onSaved={async () => { await reloadAll() }}
      />

      {/* ─── 全顧客一括再評価 ─── */}
      <div style={{
        background: '#FAFAF9', border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '12px 14px', marginBottom: 14, textAlign: 'center',
      }}>
        <p style={{ fontSize: 11, color: C.pinkMuted, margin: '0 0 8px', lineHeight: 1.5 }}>
          上記のルールを保存したら、全本指名顧客のランクを一括で再評価できます。
        </p>
        <RecalcAllRanksButton />
      </div>


      {error && (
        <p style={{ fontSize: '11px', color: C.danger, marginTop: 10, textAlign: 'center' }}>
          {error}
        </p>
      )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
//  サブコンポーネント
// ─────────────────────────────────────────────────────────────────

function ScopeButton({
  children, active, exists, onClick, compact,
}: {
  children: React.ReactNode
  active: boolean
  exists?: boolean
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: compact ? '11px' : '12px',
        padding: compact ? '5px 10px' : '8px 12px',
        background: active ? C.pink : '#FFF',
        color: active ? '#FFF' : C.dark,
        border: `1px solid ${active ? C.pink : C.border}`,
        borderRadius: 6,
        cursor: 'pointer', fontFamily: 'inherit',
        marginRight: compact ? 0 : 6,
        position: 'relative',
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
      {exists && !active && (
        <span style={{
          marginLeft: 4, fontSize: 9, color: C.pink,
        }}>●</span>
      )}
    </button>
  )
}

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
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: C.dark, margin: 0 }}>{title}</h2>
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
        <p style={{ fontSize: '10px', color: C.pinkMuted, margin: '0 0 8px 0', lineHeight: 1.5 }}>
          {hint}
        </p>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
      <span style={{ flex: 1, color: disabled ? C.pinkMuted : C.dark }}>{label}</span>
      <input
        type="number" value={value} step={step ?? 1} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '70px', padding: '5px 8px',
          border: `1px solid ${C.border}`,
          borderRadius: 6, fontSize: '12px',
          textAlign: 'right', fontFamily: 'inherit',
          background: disabled ? '#F5F5F5' : '#FFF',
        }}
      />
      <span style={{ color: disabled ? C.pinkMuted : C.dark, fontSize: '11px' }}>
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
          <input type="radio" checked={value === opt.value} onChange={() => onChange(opt.value)} />
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
