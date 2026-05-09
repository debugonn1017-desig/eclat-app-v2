'use client'
// ─────────────────────────────────────────────────────────────────
//  /admin/targets — キャストノルマのデフォルト設定（階層化 v2）
// ─────────────────────────────────────────────────────────────────
//  権限: is_owner または「ノルマ.設定」権限
//
//  scope セレクターで切り替え:
//    - 層別デフォルト   (cast_tier_targets, month=NULL)
//    - 個別オーバーライド (cast_targets, month=NULL)
//
//  検索順 (lib/targetResolver.ts):
//    1. cast_targets [month=今月]
//    2. cast_targets [month=NULL]
//    3. cast_tier_targets [month=今月]
//    4. cast_tier_targets [month=NULL]
//    5. なし → 「未設定」
//
//  下部: 月別の特例ノルマ削除UI
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/colors'
import { createClient } from '@/lib/supabase/client'
import { CAST_TIERS, CastTarget, CastTier, CastTierTarget } from '@/types'
import TargetForm, { TargetValues } from '@/components/TargetForm'
import { invalidateAllCache } from '@/lib/cache'

type ScopeKind = 'tier' | 'cast'
type ScopeSelection = { kind: ScopeKind; id: string } | null

type CastLite = {
  id: string
  cast_name: string | null
  cast_tier: string | null
  is_active: boolean
}

export default function TargetsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [authChecked, setAuthChecked] = useState(false)
  const [allowed, setAllowed] = useState(false)

  const [scope, setScope] = useState<ScopeSelection>(null)
  const [casts, setCasts] = useState<CastLite[]>([])
  const [allTierDefaults, setAllTierDefaults] = useState<CastTierTarget[]>([])
  const [allCastDefaults, setAllCastDefaults] = useState<CastTarget[]>([])
  const [monthSpecificTargets, setMonthSpecificTargets] = useState<CastTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── 認証 ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) throw new Error('NOT_AUTH')
        const me = await res.json()
        if (cancelled) return
        const ok = me.is_owner === true || me.permissions?.['ノルマ.設定'] === true
        if (!ok) {
          setAllowed(false); setAuthChecked(true)
          setTimeout(() => router.push('/admin/casts'), 1500); return
        }
        setAllowed(true); setAuthChecked(true)
      } catch {
        if (cancelled) return
        setAllowed(false); setAuthChecked(true)
        setTimeout(() => router.push('/login'), 1500)
      }
    }
    check()
    return () => { cancelled = true }
  }, [router])

  // ─── データ取得 ─────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [tierRes, castDefRes, monthRes, castRes] = await Promise.all([
        supabase.from('cast_tier_targets').select('*').is('month', null),
        supabase.from('cast_targets').select('*').is('month', null),
        supabase.from('cast_targets').select('*').not('month', 'is', null).order('month', { ascending: false }),
        supabase.from('profiles')
          .select('id, cast_name, cast_tier, is_active')
          .eq('role', 'cast').eq('is_active', true)
          .order('cast_tier').order('cast_name'),
      ])
      if (tierRes.error) throw tierRes.error
      if (castDefRes.error) throw castDefRes.error
      if (monthRes.error) throw monthRes.error
      if (castRes.error) throw castRes.error
      setAllTierDefaults((tierRes.data ?? []) as CastTierTarget[])
      setAllCastDefaults((castDefRes.data ?? []) as CastTarget[])
      setMonthSpecificTargets((monthRes.data ?? []) as CastTarget[])
      setCasts((castRes.data ?? []) as CastLite[])
      setLoading(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg); setLoading(false)
    }
  }, [supabase])

  useEffect(() => { if (allowed) reload() }, [allowed, reload])

  // ─── 既存設定の有無マップ（バッジ表示用） ──────────────────
  const tierHasDefault = useMemo(() => {
    const set = new Set<string>(allTierDefaults.map(t => t.tier))
    return (tier: string) => set.has(tier)
  }, [allTierDefaults])

  const castHasDefault = useMemo(() => {
    const set = new Set(allCastDefaults.map(t => t.cast_id))
    return (id: string) => set.has(id)
  }, [allCastDefaults])

  // ─── 現在編集対象の初期値 ─────────────────────────────────
  const initialValues = useMemo(() => {
    if (!scope) return null
    if (scope.kind === 'tier') {
      const row = allTierDefaults.find(t => t.tier === scope.id)
      if (!row) return null
      return {
        target_sales: row.target_sales ?? 0,
        target_work_days: row.target_work_days ?? 0,
        target_honshimei: row.target_honshimei ?? 0,
        target_banai: row.target_banai ?? 0,
        target_local_customers: row.target_local_customers ?? 0,
        target_remote_customers: row.target_remote_customers ?? 0,
        rank_targets: row.rank_targets ?? undefined,
      }
    } else {
      const row = allCastDefaults.find(t => t.cast_id === scope.id)
      if (!row) return null
      return {
        target_sales: row.target_sales ?? 0,
        target_work_days: row.target_work_days ?? 0,
        target_honshimei: row.target_honshimei ?? 0,
        target_banai: row.target_banai ?? 0,
        target_local_customers: row.target_local_customers ?? 0,
        target_remote_customers: row.target_remote_customers ?? 0,
        rank_targets: row.rank_targets ?? undefined,
      }
    }
  }, [scope, allTierDefaults, allCastDefaults])

  // ─── 保存 ──────────────────────────────────────────────────
  const handleSave = useCallback(async (values: TargetValues) => {
    if (!scope) return
    if (scope.kind === 'tier') {
      // tier の month=null レコードを upsert
      const existing = allTierDefaults.find(t => t.tier === scope.id)
      if (existing) {
        const { error } = await supabase.from('cast_tier_targets')
          .update({
            target_sales: values.target_sales,
            target_work_days: values.target_work_days,
            target_nominations: 0,
            target_new_customers: 0,
            target_honshimei: values.target_honshimei,
            target_banai: values.target_banai,
            target_local_customers: values.target_local_customers,
            target_remote_customers: values.target_remote_customers,
            rank_targets: values.rank_targets,
          })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('cast_tier_targets')
          .insert([{
            tier: scope.id as CastTier,
            month: null,
            target_sales: values.target_sales,
            target_work_days: values.target_work_days,
            target_nominations: 0,
            target_new_customers: 0,
            target_honshimei: values.target_honshimei,
            target_banai: values.target_banai,
            target_local_customers: values.target_local_customers,
            target_remote_customers: values.target_remote_customers,
            rank_targets: values.rank_targets,
          }])
        if (error) throw error
      }
    } else {
      const existing = allCastDefaults.find(t => t.cast_id === scope.id)
      if (existing) {
        const { error } = await supabase.from('cast_targets')
          .update({
            target_sales: values.target_sales,
            target_work_days: values.target_work_days,
            target_honshimei: values.target_honshimei,
            target_banai: values.target_banai,
            target_local_customers: values.target_local_customers,
            target_remote_customers: values.target_remote_customers,
            rank_targets: values.rank_targets,
          })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('cast_targets')
          .insert([{
            cast_id: scope.id,
            month: null,
            target_sales: values.target_sales,
            target_work_days: values.target_work_days,
            target_nominations: 0,
            target_new_customers: 0,
            target_honshimei: values.target_honshimei,
            target_banai: values.target_banai,
            target_local_customers: values.target_local_customers,
            target_remote_customers: values.target_remote_customers,
            rank_targets: values.rank_targets,
          }])
        if (error) throw error
      }
    }
    await reload()
    // ノルマ変更は全キャストの達成率に影響するのでキャッシュ全消し
    invalidateAllCache()
  }, [scope, allTierDefaults, allCastDefaults, supabase, reload])

  // ─── このスコープの設定削除（親階層に戻す） ────────────────
  const deleteScope = useCallback(async () => {
    if (!scope) return
    const ok = window.confirm('この階層の設定を削除します。以降は親階層が適用されます。よろしいですか？')
    if (!ok) return
    try {
      if (scope.kind === 'tier') {
        const existing = allTierDefaults.find(t => t.tier === scope.id)
        if (existing) {
          const { error } = await supabase.from('cast_tier_targets').delete().eq('id', existing.id)
          if (error) throw error
        }
      } else {
        const existing = allCastDefaults.find(t => t.cast_id === scope.id)
        if (existing) {
          const { error } = await supabase.from('cast_targets').delete().eq('id', existing.id)
          if (error) throw error
        }
      }
      await reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [scope, allTierDefaults, allCastDefaults, supabase, reload])

  // ─── 月別特例: 削除関連 ────────────────────────────────────
  const deleteMonthSpec = useCallback(async (row: CastTarget) => {
    if (!row.id) return
    const cast = casts.find(c => c.id === row.cast_id)
    const ok = window.confirm(
      `${row.month} の ${cast?.cast_name ?? '(削除済み)'} の特例ノルマを削除します。\n` +
      `以降、この月もデフォルト適用になります。よろしいですか？`
    )
    if (!ok) return
    try {
      const { error } = await supabase.from('cast_targets').delete().eq('id', row.id)
      if (error) throw error
      setMonthSpecificTargets(prev => prev.filter(r => r.id !== row.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [casts, supabase])

  const deleteMonthAll = useCallback(async (month: string) => {
    const target = monthSpecificTargets.filter(r => r.month === month)
    const ok = window.confirm(`${month} の特例ノルマ ${target.length} 件を全て削除します。よろしいですか？`)
    if (!ok) return
    setSaving(true)
    try {
      const { error } = await supabase.from('cast_targets').delete().eq('month', month)
      if (error) throw error
      setMonthSpecificTargets(prev => prev.filter(r => r.month !== month))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }, [monthSpecificTargets, supabase])

  const deleteAllMonthSpecs = useCallback(async () => {
    const ok1 = window.confirm(`全月別特例 ${monthSpecificTargets.length} 件を削除します。これは取り消せません。実行しますか？`)
    if (!ok1) return
    const ok2 = window.confirm('もう一度確認: 本当に全削除しますか？')
    if (!ok2) return
    setSaving(true)
    try {
      const { error } = await supabase.from('cast_targets').delete().not('month', 'is', null)
      if (error) throw error
      setMonthSpecificTargets([])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }, [monthSpecificTargets, supabase])

  // ─── 認証/ロード状態 ──────────────────────────────────────
  if (!authChecked) return <Centered>確認中...</Centered>
  if (!allowed) return <Centered>このページの閲覧権限がありません。元の画面に戻ります...</Centered>
  if (loading) return <Centered>読み込み中...</Centered>

  const scopeLabel = !scope ? '未選択'
    : scope.kind === 'tier' ? `${scope.id}（層別デフォルト）`
    : `${casts.find(c => c.id === scope.id)?.cast_name ?? ''}（個別恒久デフォルト）`

  const scopeHasData = scope && initialValues !== null

  return (
    <div style={{
      maxWidth: '640px', margin: '0 auto',
      padding: '20px 16px 80px', fontFamily: 'inherit',
    }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: '14px' }}>
        <button
          onClick={() => router.push('/admin/casts')}
          style={{
            background: 'transparent', border: 'none',
            color: C.pinkMuted, fontSize: '11px', letterSpacing: '0.15em',
            cursor: 'pointer', padding: 0, marginBottom: 8, fontFamily: 'inherit',
          }}
        >← スタッフ管理に戻る</button>
        <h1 style={{ fontSize: '17px', fontWeight: 700, color: C.dark, margin: 0 }}>
          💰 ノルマ設定
        </h1>
        <p style={{ fontSize: '11px', color: C.pinkMuted, marginTop: 4 }}>
          一度設定すれば自動で毎月適用。階層: 個別月別 → 個別恒久 → 層別月別 → 層別恒久。
        </p>
      </div>

      {/* スコープセレクター */}
      <div style={{
        background: '#FFF', border: `1px solid ${C.border}`,
        borderRadius: 10, padding: '12px', marginBottom: '12px',
      }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: C.pink, marginBottom: 8 }}>
          編集対象を選ぶ
        </div>

        {/* 層別 */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '10px', color: C.pinkMuted, marginBottom: 4 }}>⭐ 層別デフォルト</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {CAST_TIERS.map(tier => {
              const active = scope?.kind === 'tier' && scope.id === tier
              const exists = tierHasDefault(tier)
              return (
                <button key={tier} onClick={() => setScope({ kind: 'tier', id: tier })}
                  style={{
                    fontSize: '11px', padding: '5px 10px',
                    background: active ? C.pink : '#FFF',
                    color: active ? '#FFF' : C.dark,
                    border: `1px solid ${active ? C.pink : C.border}`,
                    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    fontWeight: active ? 600 : 400,
                  }}>
                  {tier}
                  {exists && !active && <span style={{ marginLeft: 4, fontSize: 9, color: C.pink }}>●</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* 個別キャスト */}
        <div>
          <div style={{ fontSize: '10px', color: C.pinkMuted, marginBottom: 4 }}>👤 個別キャスト恒久デフォルト</div>
          <select
            value={scope?.kind === 'cast' ? scope.id : ''}
            onChange={e => { const v = e.target.value; if (v) setScope({ kind: 'cast', id: v }) }}
            style={{
              width: '100%', padding: '8px 10px',
              border: `1px solid ${scope?.kind === 'cast' ? C.pink : C.border}`,
              borderRadius: 6, fontSize: '12px',
              background: scope?.kind === 'cast' ? 'rgba(232,135,155,0.04)' : '#FFF',
              fontFamily: 'inherit',
            }}>
            <option value="">キャストを選択...</option>
            {casts.map(c => (
              <option key={c.id} value={c.id}>
                {c.cast_name}（{c.cast_tier ?? '層未設定'}）
                {castHasDefault(c.id) ? ' ✓ 設定あり' : ''}
              </option>
            ))}
          </select>
        </div>

        {scope && (
          <div style={{
            marginTop: 10, padding: '6px 10px',
            background: '#FAFAF9', borderRadius: 6,
            fontSize: '11px', color: C.pinkMuted,
          }}>
            編集中: <strong style={{ color: C.dark }}>{scopeLabel}</strong>
            {!scopeHasData && <span style={{ marginLeft: 6, color: C.pink }}>新規作成（保存で追加）</span>}
          </div>
        )}
      </div>

      {/* TargetForm（scope 選択時のみ表示） */}
      {scope && (
        <>
          <TargetForm
            initial={initialValues}
            onSave={handleSave}
            saveLabel={scopeHasData ? '保存' : '作成して保存'}
          />
          {scopeHasData && (
            <div style={{ textAlign: 'center', margin: '12px 0' }}>
              <button onClick={deleteScope}
                style={{
                  fontSize: '11px', padding: '8px 14px',
                  background: 'transparent', color: C.danger,
                  border: `1px solid ${C.danger}`, borderRadius: 6,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                この階層の設定を削除（親階層に戻す）
              </button>
            </div>
          )}
        </>
      )}

      {/* 月別の特例ノルマ */}
      {monthSpecificTargets.length > 0 && (
        <div style={{
          background: '#FFF', border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '14px', marginTop: 16,
        }}>
          <h2 style={{ fontSize: '13px', fontWeight: 600, color: C.dark, margin: '0 0 4px 0' }}>
            📅 月別の特例ノルマ
          </h2>
          <p style={{ fontSize: '10px', color: C.pinkMuted, margin: '0 0 12px 0', lineHeight: 1.5 }}>
            月単位の特例設定（個別キャストページのSETTINGタブで月別に入力したやつ）。
            削除すると、その月もデフォルト適用になります。
          </p>

          {(() => {
            const byMonth = new Map<string, CastTarget[]>()
            for (const r of monthSpecificTargets) {
              if (!r.month) continue
              if (!byMonth.has(r.month)) byMonth.set(r.month, [])
              byMonth.get(r.month)!.push(r)
            }
            const months = Array.from(byMonth.keys()).sort().reverse()

            return months.map(month => {
              const rows = byMonth.get(month)!
              return (
                <div key={month} style={{
                  marginBottom: 12, padding: '10px',
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  background: '#FAFAF9',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6,
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: C.dark }}>
                      {month}
                      <span style={{ fontSize: '10px', color: C.pinkMuted, marginLeft: 6 }}>
                        ({rows.length}件)
                      </span>
                    </span>
                    <button onClick={() => deleteMonthAll(month)} disabled={saving}
                      style={{
                        fontSize: '10px', padding: '4px 8px',
                        background: 'transparent', color: C.danger,
                        border: `1px solid ${C.danger}`, borderRadius: 4,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      この月を全削除
                    </button>
                  </div>
                  {rows.map(r => {
                    const cast = casts.find(c => c.id === r.cast_id)
                    return (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: '11px', padding: '4px 0',
                      }}>
                        <span style={{ flex: 1, color: C.dark }}>
                          {cast?.cast_name ?? '(不明)'}
                          {cast?.cast_tier && (
                            <span style={{ color: C.pinkMuted, marginLeft: 4 }}>
                              ({cast.cast_tier})
                            </span>
                          )}
                        </span>
                        <span style={{ color: C.dark, minWidth: 60, textAlign: 'right' }}>
                          {Math.round((r.target_sales ?? 0) / 10000).toLocaleString()}万円
                        </span>
                        <button onClick={() => deleteMonthSpec(r)}
                          style={{
                            fontSize: '12px', color: C.danger,
                            background: 'transparent', border: 'none',
                            cursor: 'pointer', padding: '0 4px',
                          }} title="削除">×</button>
                      </div>
                    )
                  })}
                </div>
              )
            })
          })()}

          <button onClick={deleteAllMonthSpecs} disabled={saving}
            style={{
              width: '100%', marginTop: 8,
              fontSize: '11px', padding: '8px',
              background: 'transparent', color: C.danger,
              border: `1px dashed ${C.danger}`, borderRadius: 6,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            ⚠ 全月の特例を一括削除（破壊的）
          </button>
        </div>
      )}

      {error && (
        <p style={{ fontSize: '11px', color: C.danger, marginTop: 10, textAlign: 'center' }}>
          {error}
        </p>
      )}
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
