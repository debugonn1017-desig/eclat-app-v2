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
      const [tierRes, castTRes, castRes] = await Promise.all([
        supabase.from('cast_tier_targets').select('*').is('month', null),
        supabase.from('cast_targets').select('*').is('month', null),
        supabase
          .from('profiles')
          .select('id, cast_name, cast_tier, is_active')
          .eq('role', 'cast')
          .eq('is_active', true)
          .order('cast_tier')
          .order('cast_name'),
      ])
      if (tierRes.error) throw tierRes.error
      if (castTRes.error) throw castTRes.error
      if (castRes.error) throw castRes.error

      const td: Record<string, number | ''> = {}
      for (const t of CAST_TIERS) td[t] = ''
      for (const row of (tierRes.data ?? []) as TierTargetRow[]) {
        td[row.tier] = row.target_sales ?? ''
      }
      setTierDefaults(td)
      setCastOverrides((castTRes.data ?? []) as CastTargetRow[])
      setCasts((castRes.data ?? []) as CastLite[])
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
