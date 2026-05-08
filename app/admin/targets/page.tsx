'use client'
// ─────────────────────────────────────────────────────────────────
//  /admin/targets — キャストノルマのデフォルト設定
// ─────────────────────────────────────────────────────────────────
//  権限: is_owner または「ノルマ.設定」権限
//  目的: 月初に何もしなくても自動でノルマが入るようにする。
//
//    層別デフォルト   (cast_tier_targets, month=NULL): 一度設定すれば全月適用
//    個別オーバーライド (cast_targets, month=NULL):   キャスト個別の恒久デフォルト
//
//  検索順 (lib/targetResolver.ts:resolveCastTarget):
//    1. cast_targets で month=今月 の特例
//    2. cast_targets で month=NULL の個別恒久デフォルト
//    3. cast_tier_targets で month=NULL の層デフォルト
//    4. なし → "ノルマ未設定"
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/colors'
import { createClient } from '@/lib/supabase/client'
import { CAST_TIERS, CastTier } from '@/types'

type TierTargetRow = {
  id?: string
  tier: string
  month: string | null   // null = 恒久デフォルト
  target_sales: number
}

type CastTargetRow = {
  id?: string
  cast_id: string
  month: string | null
  target_sales: number | null
}

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

  const [tierDefaults, setTierDefaults] = useState<Record<string, number | ''>>({})
  const [castOverrides, setCastOverrides] = useState<CastTargetRow[]>([])
  const [casts, setCasts] = useState<CastLite[]>([])
  const [monthSpecificTargets, setMonthSpecificTargets] = useState<CastTargetRow[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const [newCastSelect, setNewCastSelect] = useState<string>('')

  // ─── 認証 ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) throw new Error('NOT_AUTH')
        const me = await res.json()
        if (cancelled) return
        const ok =
          me.is_owner === true ||
          me.permissions?.['ノルマ.設定'] === true
        if (!ok) {
          setAllowed(false)
          setAuthChecked(true)
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

  // ─── データ取得 ─────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [tierRes, castTRes, castRes, monthTRes] = await Promise.all([
        supabase.from('cast_tier_targets').select('*').is('month', null),
        supabase.from('cast_targets').select('*').is('month', null),
        supabase
          .from('profiles')
          .select('id, cast_name, cast_tier, is_active')
          .eq('role', 'cast')
          .eq('is_active', true)
          .order('cast_tier')
          .order('cast_name'),
        // 月別の特例レコード（month が NULL じゃないやつ）
        supabase.from('cast_targets').select('*').not('month', 'is', null).order('month', { ascending: false }),
      ])
      if (tierRes.error) throw tierRes.error
      if (castTRes.error) throw castTRes.error
      if (castRes.error) throw castRes.error
      if (monthTRes.error) throw monthTRes.error

      const td: Record<string, number | ''> = {}
      for (const t of CAST_TIERS) td[t] = ''
      for (const row of (tierRes.data ?? []) as TierTargetRow[]) {
        td[row.tier] = row.target_sales ?? ''
      }
      setTierDefaults(td)
      setCastOverrides((castTRes.data ?? []) as CastTargetRow[])
      setCasts((castRes.data ?? []) as CastLite[])
      setMonthSpecificTargets((monthTRes.data ?? []) as CastTargetRow[])
      setLoading(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (!allowed) return
    reload()
  }, [allowed, reload])

  // ─── 保存（層別デフォルト） ────────────────────────────────
  const saveTier = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      // 各 tier について upsert（既存があれば update、なければ insert）
      for (const tier of CAST_TIERS) {
        const val = tierDefaults[tier]
        // 既存行を確認
        const { data: existing } = await supabase
          .from('cast_tier_targets')
          .select('id')
          .eq('tier', tier)
          .is('month', null)
          .maybeSingle()

        if (val === '' || val === null) {
          // 値が空 → 既存を削除（層デフォルトなしにする）
          if (existing?.id) {
            await supabase.from('cast_tier_targets').delete().eq('id', existing.id)
          }
        } else {
          const numVal = typeof val === 'number' ? val : Number(val)
          if (existing?.id) {
            await supabase
              .from('cast_tier_targets')
              .update({ target_sales: numVal })
              .eq('id', existing.id)
          } else {
            await supabase
              .from('cast_tier_targets')
              .insert([{
                tier,
                month: null,
                target_sales: numVal,
                target_nominations: 0,
                target_new_customers: 0,
                target_work_days: 0,
              }])
          }
        }
      }
      setSavedAt(new Date())
      await reload()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
        : '保存に失敗しました'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [tierDefaults, supabase, reload])

  // ─── 個別オーバーライド: 追加 ───────────────────────────────
  const addOverride = useCallback(async () => {
    if (!newCastSelect) return
    // 既に存在する場合は何もしない
    if (castOverrides.some(o => o.cast_id === newCastSelect)) {
      setError('そのキャストの個別オーバーライドは既にあります')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('cast_targets')
        .insert([{
          cast_id: newCastSelect,
          month: null,
          target_sales: 0,
        }])
        .select('*')
        .single()
      if (error) throw error
      if (data) {
        setCastOverrides(prev => [...prev, data as CastTargetRow])
        setNewCastSelect('')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [newCastSelect, castOverrides, supabase])

  // ─── 個別オーバーライド: 1行更新 ────────────────────────────
  const updateOverride = useCallback(async (row: CastTargetRow, newVal: number) => {
    if (!row.id) return
    try {
      const { error } = await supabase
        .from('cast_targets')
        .update({ target_sales: newVal })
        .eq('id', row.id)
      if (error) throw error
      setCastOverrides(prev =>
        prev.map(r => r.id === row.id ? { ...r, target_sales: newVal } : r)
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }, [supabase])

  // ─── 個別オーバーライド: 削除 ───────────────────────────────
  const deleteOverride = useCallback(async (row: CastTargetRow) => {
    if (!row.id) return
    const ok = window.confirm('このキャストの個別オーバーライドを削除します。以降は層デフォルトが適用されます。よろしいですか？')
    if (!ok) return
    try {
      const { error } = await supabase
        .from('cast_targets')
        .delete()
        .eq('id', row.id)
      if (error) throw error
      setCastOverrides(prev => prev.filter(r => r.id !== row.id))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }, [supabase])

  // ─── 月別特例: 単体削除 ────────────────────────────────────
  const deleteMonthSpec = useCallback(async (row: CastTargetRow) => {
    if (!row.id) return
    const cast = casts.find(c => c.id === row.cast_id)
    const ok = window.confirm(
      `${row.month} の ${cast?.cast_name ?? '(削除済み)'} の特例ノルマを削除します。\n` +
      `以降、この月もデフォルト（個別恒久 → 層別）が適用されるようになります。\n` +
      `よろしいですか？`
    )
    if (!ok) return
    try {
      const { error } = await supabase.from('cast_targets').delete().eq('id', row.id)
      if (error) throw error
      setMonthSpecificTargets(prev => prev.filter(r => r.id !== row.id))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }, [casts, supabase])

  // ─── 月別特例: 月単位の一括削除 ────────────────────────────
  const deleteMonthAll = useCallback(async (month: string) => {
    const target = monthSpecificTargets.filter(r => r.month === month)
    const ok = window.confirm(
      `${month} の特例ノルマ ${target.length} 件を全て削除します。\n` +
      `以降、この月もデフォルトが適用されます。\n` +
      `よろしいですか？`
    )
    if (!ok) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('cast_targets')
        .delete()
        .eq('month', month)
      if (error) throw error
      setMonthSpecificTargets(prev => prev.filter(r => r.month !== month))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [monthSpecificTargets, supabase])

  // ─── 月別特例: 全削除 (危険) ────────────────────────────────
  const deleteAllMonthSpecs = useCallback(async () => {
    const ok1 = window.confirm(
      `全ての月別特例ノルマ ${monthSpecificTargets.length} 件を削除します。\n` +
      `過去・未来含めた全ての月別特例が消え、すべてデフォルト適用になります。\n` +
      `これは取り消せません。本当に実行しますか？`
    )
    if (!ok1) return
    const ok2 = window.confirm('もう一度確認します。本当に全削除しますか？')
    if (!ok2) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('cast_targets')
        .delete()
        .not('month', 'is', null)
      if (error) throw error
      setMonthSpecificTargets([])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [monthSpecificTargets, supabase])

  // ─── レンダリング条件 ──────────────────────────────────────
  if (!authChecked) return <Centered>確認中...</Centered>
  if (!allowed) return <Centered>このページの閲覧権限がありません。元の画面に戻ります...</Centered>
  if (loading) return <Centered>読み込み中...</Centered>

  const yenToMan = (yen: number | null | '') => {
    if (yen === '' || yen === null) return ''
    return Math.round(yen / 10000)
  }

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
          一度設定すれば、毎月自動でノルマが入ります。月初の手入力は不要に。
        </p>
      </div>

      {/* ─── 層別デフォルト ─── */}
      <div style={{
        background: '#FFF', border: `1px solid ${C.border}`,
        borderRadius: 10, padding: '14px', marginBottom: 12,
      }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: C.dark, margin: '0 0 4px 0' }}>
          ⭐ 層別デフォルト
        </h2>
        <p style={{ fontSize: '10px', color: C.pinkMuted, margin: '0 0 12px 0' }}>
          層に属する全キャストに適用。空欄の層は「未設定」になります。
        </p>

        {CAST_TIERS.map(tier => (
          <div key={tier} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 0', borderBottom: `1px dashed ${C.border}`,
          }}>
            <span style={{ flex: 1, fontSize: '12px', color: C.dark }}>{tier}</span>
            <input
              type="number"
              value={yenToMan(tierDefaults[tier] ?? '')}
              onChange={e => {
                const v = e.target.value
                setTierDefaults(prev => ({
                  ...prev,
                  [tier]: v === '' ? '' : Math.max(0, Number(v) * 10000),
                }))
              }}
              placeholder="未設定"
              style={{
                width: '80px', padding: '5px 8px',
                border: `1px solid ${C.border}`,
                borderRadius: 6, fontSize: '12px',
                textAlign: 'right', fontFamily: 'inherit',
              }}
            />
            <span style={{ fontSize: '11px', color: C.dark, width: 30 }}>万円</span>
          </div>
        ))}

        <button
          onClick={saveTier}
          disabled={saving}
          style={{
            marginTop: 12, width: '100%',
            fontSize: '12px', fontWeight: 700,
            padding: '10px', borderRadius: 8,
            background: C.pink, color: '#FFF',
            border: 'none', cursor: saving ? 'wait' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '保存中...' : '層別デフォルトを保存'}
        </button>
      </div>

      {/* ─── 個別オーバーライド ─── */}
      <div style={{
        background: '#FFF', border: `1px solid ${C.border}`,
        borderRadius: 10, padding: '14px', marginBottom: 12,
      }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: C.dark, margin: '0 0 4px 0' }}>
          👤 個別オーバーライド
        </h2>
        <p style={{ fontSize: '10px', color: C.pinkMuted, margin: '0 0 12px 0' }}>
          層デフォルトを上書き。例外的にノルマが違うキャストだけ追加。
        </p>

        {castOverrides.length === 0 && (
          <p style={{
            fontSize: '11px', color: C.pinkMuted,
            textAlign: 'center', padding: '12px 0',
          }}>
            個別オーバーライドはありません
          </p>
        )}

        {castOverrides.map(row => {
          const cast = casts.find(c => c.id === row.cast_id)
          return (
            <div key={row.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 0', borderBottom: `1px dashed ${C.border}`,
            }}>
              <span style={{ flex: 1, fontSize: '12px', color: C.dark }}>
                {cast?.cast_name ?? '(削除済み)'}
                {cast?.cast_tier && (
                  <span style={{ fontSize: '10px', color: C.pinkMuted, marginLeft: 6 }}>
                    {cast.cast_tier}
                  </span>
                )}
              </span>
              <input
                type="number"
                defaultValue={Math.round((row.target_sales ?? 0) / 10000)}
                onBlur={e => {
                  const newVal = Math.max(0, Number(e.target.value) * 10000)
                  if (newVal !== (row.target_sales ?? 0)) {
                    updateOverride(row, newVal)
                  }
                }}
                style={{
                  width: '80px', padding: '5px 8px',
                  border: `1px solid ${C.border}`,
                  borderRadius: 6, fontSize: '12px',
                  textAlign: 'right', fontFamily: 'inherit',
                }}
              />
              <span style={{ fontSize: '11px', color: C.dark, width: 30 }}>万円</span>
              <button
                onClick={() => deleteOverride(row)}
                style={{
                  fontSize: '14px', color: C.danger,
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: '0 6px',
                }}
                title="削除"
              >×</button>
            </div>
          )
        })}

        {/* 追加 */}
        <div style={{
          display: 'flex', gap: 6, marginTop: 12, alignItems: 'center',
          paddingTop: 8, borderTop: `1px solid ${C.border}`,
        }}>
          <select
            value={newCastSelect}
            onChange={e => setNewCastSelect(e.target.value)}
            style={{
              flex: 1, padding: '6px 8px',
              border: `1px solid ${C.border}`,
              borderRadius: 6, fontSize: '11px', fontFamily: 'inherit',
            }}
          >
            <option value="">+ オーバーライド追加するキャストを選択...</option>
            {casts
              .filter(c => !castOverrides.some(o => o.cast_id === c.id))
              .map(c => (
                <option key={c.id} value={c.id}>
                  {c.cast_name}（{c.cast_tier ?? '層未設定'}）
                </option>
              ))}
          </select>
          <button
            onClick={addOverride}
            disabled={!newCastSelect || saving}
            style={{
              fontSize: '11px', fontWeight: 600,
              padding: '6px 12px', borderRadius: 6,
              background: newCastSelect ? C.pink : C.tagBg,
              color: newCastSelect ? '#FFF' : C.pinkMuted,
              border: 'none',
              cursor: !newCastSelect || saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            追加
          </button>
        </div>
      </div>

      {/* ─── 月別の特例ノルマ（過去含む全月の上書きレコード）─── */}
      {monthSpecificTargets.length > 0 && (
        <div style={{
          background: '#FFF', border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '14px', marginBottom: 12,
        }}>
          <h2 style={{ fontSize: '13px', fontWeight: 600, color: C.dark, margin: '0 0 4px 0' }}>
            📅 月別の特例ノルマ
          </h2>
          <p style={{ fontSize: '10px', color: C.pinkMuted, margin: '0 0 12px 0', lineHeight: 1.5 }}>
            個別オーバーライド・層デフォルトより優先される月単位の特例設定。
            削除すると、その月もデフォルトが適用されるようになります。
          </p>

          {(() => {
            // 月でグルーピング
            const byMonth = new Map<string, CastTargetRow[]>()
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
                    <button
                      onClick={() => deleteMonthAll(month)}
                      disabled={saving}
                      style={{
                        fontSize: '10px', padding: '4px 8px',
                        background: 'transparent', color: C.danger,
                        border: `1px solid ${C.danger}`, borderRadius: 4,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
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
                        <button
                          onClick={() => deleteMonthSpec(r)}
                          style={{
                            fontSize: '12px', color: C.danger,
                            background: 'transparent', border: 'none',
                            cursor: 'pointer', padding: '0 4px',
                          }}
                          title="削除"
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              )
            })
          })()}

          {/* 全削除（破壊的） */}
          <button
            onClick={deleteAllMonthSpecs}
            disabled={saving}
            style={{
              width: '100%', marginTop: 8,
              fontSize: '11px', padding: '8px',
              background: 'transparent', color: C.danger,
              border: `1px dashed ${C.danger}`, borderRadius: 6,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ⚠ 全月の特例を一括削除（破壊的）
          </button>
        </div>
      )}

      {savedAt && (
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
