'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { CastManagementOrder, CastManagementRow } from '@/types'
import { C } from '@/lib/colors'
import { castManagementName, castManagementRosterKey, groupCastManagementRows, isCastManagementOrder, moveCastWithinGroup } from '@/lib/castManagementOrder'

type Props<T extends CastManagementRow> = {
  casts: readonly T[]
  isPC: boolean
  canReorder: boolean
  renderCast: (cast: T) => ReactNode
  onReload: () => Promise<void>
}

const buttonStyle: CSSProperties = {
  minHeight: 36, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.white, color: C.dark2, fontFamily: 'inherit', fontSize: 11,
  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
}

export default function CastManagementList<T extends CastManagementRow>({ casts, isPC, canReorder, renderCast, onReload }: Props<T>) {
  const [shared, setShared] = useState<CastManagementOrder | null>(null)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const requestRef = useRef<object | null>(null)
  const saveLock = useRef(false)
  const pointerDrag = useRef<{ id: string; pointerId: number; x: number; y: number } | null>(null)
  const rosterKey = castManagementRosterKey(casts)
  const ready = shared?.rosterKey === rosterKey
  const editing = draft !== null && ready && canReorder
  const groups = groupCastManagementRows(casts, editing ? draft : shared?.orderedCastIds ?? [])

  // 名簿変更時も再取得し、層の変更前に作った下書きを残さない。
  useEffect(() => {
    const controller = new AbortController()
    const requestId = {}
    requestRef.current = requestId
    async function load() {
      try {
        const res = await fetch('/api/admin/casts/order', { cache: 'no-store', signal: controller.signal })
        const data: unknown = await res.json()
        if (controller.signal.aborted || requestRef.current !== requestId) return
        if (!res.ok || !isCastManagementOrder(data)) throw new Error('共通の並び順を読み込めません。DB設定と通信状態を確認してください。')
        setShared(data)
        setDraft(null)
        setDragging(null)
        setNotice('')
        setError(data.rosterKey === rosterKey ? null : '名簿が更新されています。「最新の一覧」を読み込んでください。')
      } catch (err) {
        if (!controller.signal.aborted && requestRef.current === requestId) setError(err instanceof Error ? err.message : '読み込みに失敗しました')
      }
    }
    void load()
    return () => { controller.abort(); requestRef.current = null }
  }, [rosterKey, canReorder])

  async function refresh(beginEditing = false) {
    const requestId = {}
    requestRef.current = requestId
    setRefreshing(true)
    setError(null)
    setNotice('')
    try {
      if (!beginEditing) { setDraft(null); await onReload() }
      const res = await fetch('/api/admin/casts/order', { cache: 'no-store' })
      const data: unknown = await res.json()
      if (requestId !== requestRef.current) return
      if (!res.ok || !isCastManagementOrder(data)) throw new Error('共通の並び順を読み込めません。DB設定と通信状態を確認してください。')
      setShared(data)
      if (data.rosterKey !== rosterKey) throw new Error('名簿が更新されています。「最新の一覧」を読み込んでください。')
      setDraft(beginEditing ? groupCastManagementRows(casts, data.orderedCastIds).flatMap(group => group.rows.map(row => row.id)) : null)
    } catch (err) {
      if (requestId === requestRef.current) setError(err instanceof Error ? err.message : '読み込みに失敗しました')
    } finally {
      // 名簿の再取得で別リクエストになった場合も、操作中表示だけは解除。
      setRefreshing(false)
    }
  }

  function move(fromId: string, toId: string) {
    if (saveLock.current || refreshing) return
    setDraft(ids => ids === null ? null : moveCastWithinGroup(casts, ids, fromId, toId))
    setNotice('')
  }

  async function save() {
    if (!editing || !shared || !canReorder || saveLock.current || refreshing) return
    saveLock.current = true
    setSaving(true)
    setError(null)
    const requestId = {}
    requestRef.current = requestId
    try {
      const res = await fetch('/api/admin/casts/order', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedCastIds: draft, revision: shared.revision, rosterKey }),
      })
      const data: unknown = await res.json()
      if (requestId !== requestRef.current) return
      if (!res.ok) {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '保存に失敗しました'
        throw new Error(message)
      }
      if (!isCastManagementOrder(data)) throw new Error('保存結果を確認できません。「最新の一覧」で確認してください。')
      setShared(data)
      setDraft(null)
      setDragging(null)
      setNotice('スタッフ共通の並び順を保存しました')
    } catch (err) {
      if (requestId === requestRef.current) setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }

  const busy = saving || refreshing
  return (
    <section aria-label="キャスト層別のキャスト一覧">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: C.dark2 }}>層別 / スタッフ共通の並び順</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {editing ? <>
            <button type="button" disabled={busy} onClick={() => { setDraft([]); setNotice('あいうえお順に戻します。「保存」で反映します') }} style={buttonStyle}>あいうえお順に戻す</button>
            <button type="button" disabled={busy} onClick={() => { setDraft(null); setDragging(null); setError(null); setNotice('') }} style={buttonStyle}>キャンセル</button>
            <button type="button" disabled={busy} onClick={save} style={{ ...buttonStyle, background: C.pink, color: C.dark, borderColor: C.pink }}>{saving ? '保存中…' : '保存'}</button>
          </> : <>
            <button type="button" disabled={busy} onClick={() => refresh()} style={buttonStyle}>{refreshing ? '読込中…' : '最新の一覧'}</button>
            {canReorder && <button type="button" disabled={!ready || busy} onClick={() => refresh(true)} style={{ ...buttonStyle, background: C.tagBg2, opacity: ready ? 1 : 0.5 }}>並び替え</button>}
          </>}
        </div>
      </div>
      {editing && <p style={{ margin: '0 0 10px', fontSize: 11, color: C.dark2 }}>
        {isPC ? '左の⠿をドラッグ、または↑↓で層内を移動。' : '同じ層の中で↑↓を押して移動。'}「保存」で全スタッフに反映します。
      </p>}
      {error && <div role="alert" style={{ padding: 10, marginBottom: 12, fontSize: 11, color: C.danger, background: C.dangerBg, borderRadius: 8 }}>
        {error} {editing && <button type="button" disabled={busy} onClick={() => refresh()} style={buttonStyle}>最新の一覧を読み込む</button>}
      </div>}
      <div role="status" aria-live="polite" style={{ fontSize: 11, color: C.dark2, marginBottom: notice ? 10 : 0 }}>{notice}</div>
      {groups.map(group => <section key={group.key} aria-label={`${group.active ? '在籍' : '退店'} ${group.tier}`} style={{ marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.dark2, margin: '0 0 10px', borderLeft: `3px solid ${C.pink}`, paddingLeft: 8 }}>
          {group.active ? '' : '退店 / '}{group.tier}<span style={{ fontSize: 10, fontWeight: 400 }}>{group.rows.length}人</span>
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {group.rows.map((cast, index) => editing ? <div key={cast.id}
            data-cast-order-id={cast.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 58, padding: '9px 12px', border: `1px solid ${dragging === cast.id || dropTarget === cast.id ? C.pink : C.border}`, borderRadius: 12, background: dropTarget === cast.id ? C.tagBg2 : C.white, opacity: dragging === cast.id ? 0.6 : 1 }}>
            {isPC && <button type="button" disabled={busy} aria-label={`${castManagementName(cast)}をドラッグして移動`}
              onPointerDown={event => {
                if (event.button !== 0 || busy) return
                event.preventDefault()
                pointerDrag.current = { id: cast.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragging(cast.id)
                setDropTarget(cast.id)
              }}
              onPointerMove={event => {
                if (!pointerDrag.current || pointerDrag.current.pointerId !== event.pointerId) return
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cast-order-id]')?.getAttribute('data-cast-order-id')
                setDropTarget(target && group.rows.some(row => row.id === target) ? target : null)
              }}
              onPointerUp={event => {
                const source = pointerDrag.current
                if (!source || source.pointerId !== event.pointerId) return
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cast-order-id]')?.getAttribute('data-cast-order-id')
                if (target && Math.hypot(event.clientX - source.x, event.clientY - source.y) > 6) move(source.id, target)
                pointerDrag.current = null
                event.currentTarget.releasePointerCapture(event.pointerId)
                setDragging(null)
                setDropTarget(null)
              }}
              onPointerCancel={() => { pointerDrag.current = null; setDragging(null); setDropTarget(null) }}
              onLostPointerCapture={() => { pointerDrag.current = null; setDragging(null); setDropTarget(null) }}
              style={{ ...buttonStyle, width: 28, padding: 0, border: 'none', fontSize: 18, cursor: 'grab', touchAction: 'none', userSelect: 'none' }}>⠿</button>}
            <span style={{ color: C.dark2, fontSize: 10, minWidth: 16 }}>{index + 1}</span>
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: C.dark, fontSize: 14, fontWeight: 600 }}>{castManagementName(cast)}</span>
            <button type="button" aria-label={`${castManagementName(cast)}を上へ`} disabled={busy || index === 0} onClick={() => move(cast.id, group.rows[index - 1].id)} style={{ ...buttonStyle, width: 36, padding: 0, opacity: index === 0 ? 0.35 : 1 }}>↑</button>
            <button type="button" aria-label={`${castManagementName(cast)}を下へ`} disabled={busy || index === group.rows.length - 1} onClick={() => move(cast.id, group.rows[index + 1].id)} style={{ ...buttonStyle, width: 36, padding: 0, opacity: index === group.rows.length - 1 ? 0.35 : 1 }}>↓</button>
          </div> : <div key={cast.id}>{renderCast(cast)}</div>)}
        </div>
      </section>)}
    </section>
  )
}
