'use client'

import { useRef, type ReactNode, type TouchEvent } from 'react'
import type { CustomerRank } from '@/types'
import { C } from '@/lib/colors'

type Props = {
  customerId: string
  customerName: string
  customerRank: CustomerRank | null
  isFollowUp: boolean
  canManage: boolean
  selectionMode: boolean
  selected: boolean
  actionsOpen: boolean
  busy?: boolean
  borderRadius?: number
  onOpen: () => void
  onToggleSelected: () => void
  onToggleActions: () => void
  onAddFollowUp: () => void
  onMoveToSevered: () => void
  children: ReactNode
}

export default function CustomerActionCardShell({
  customerId,
  customerName,
  customerRank,
  isFollowUp,
  canManage,
  selectionMode,
  selected,
  actionsOpen,
  busy = false,
  borderRadius = 0,
  onOpen,
  onToggleSelected,
  onToggleActions,
  onAddFollowUp,
  onMoveToSevered,
  children,
}: Props) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!canManage || selectionMode) return
    touchStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    }
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!canManage || selectionMode) return
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const dx = event.changedTouches[0].clientX - start.x
    const dy = event.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 45 || Math.abs(dy) > Math.abs(dx)) return
    suppressClickRef.current = true
    if ((dx < 0) !== actionsOpen) onToggleActions()
  }

  return (
    <div
      data-customer-swipe="true"
      data-customer-id={customerId}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius,
      }}
    >
      {canManage && (
        <div style={{
          position: 'absolute',
          inset: '0 0 0 auto',
          width: 180,
          display: selectionMode ? 'none' : 'grid',
          gridTemplateColumns: '1fr 1fr',
        }}>
          <button
            type="button"
            disabled={busy || isFollowUp}
            onClick={(event) => {
              event.stopPropagation()
              if (!isFollowUp) onAddFollowUp()
            }}
            style={{
              border: 'none',
              background: isFollowUp ? '#E7DDD9' : C.pink,
              color: '#FFF',
              fontSize: 10,
              fontWeight: 700,
              cursor: busy || isFollowUp ? 'default' : 'pointer',
              fontFamily: 'inherit',
              padding: '0 6px',
            }}
          >
            {isFollowUp ? '追加済み' : '追いかけ'}
          </button>
          <button
            type="button"
            disabled={busy || customerRank === '切れた'}
            onClick={(event) => {
              event.stopPropagation()
              if (customerRank !== '切れた') onMoveToSevered()
            }}
            style={{
              border: 'none',
              background: customerRank === '切れた' ? '#B9AEB1' : '#6E3D4B',
              color: '#FFF',
              fontSize: 10,
              fontWeight: 700,
              cursor: busy || customerRank === '切れた' ? 'default' : 'pointer',
              fontFamily: 'inherit',
              padding: '0 6px',
            }}
          >
            {customerRank === '切れた' ? '切れた' : '切れたへ'}
          </button>
        </div>
      )}

      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          if (canManage && selectionMode) {
            onToggleSelected()
            return
          }
          if (actionsOpen) {
            onToggleActions()
            return
          }
          onOpen()
        }}
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'stretch',
          minWidth: 0,
          paddingLeft: selectionMode ? 10 : 0,
          paddingRight: canManage && !selectionMode ? 34 : 0,
          boxSizing: 'border-box',
          background: selected ? '#FFF0F4' : C.white,
          transform: canManage && !selectionMode && actionsOpen
            ? 'translateX(-180px)'
            : 'translateX(0)',
          transition: 'transform 0.2s ease, background 0.15s',
          touchAction: 'pan-y',
          cursor: 'pointer',
        }}
      >
        {selectionMode && (
          <span
            aria-hidden="true"
            style={{
              width: 24,
              height: 24,
              flexShrink: 0,
              alignSelf: 'center',
              marginRight: 8,
              borderRadius: '50%',
              border: `2px solid ${selected ? C.pink : C.border}`,
              background: selected ? C.pink : C.white,
              color: C.white,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {selected ? '✓' : ''}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {canManage && !selectionMode && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggleActions()
            }}
            aria-label={`${customerName || 'お客様'}の操作を表示`}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 24,
              height: 24,
              border: `1px solid ${C.border}`,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.92)',
              color: C.pinkMuted,
              fontSize: 14,
              lineHeight: 1,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            ⋯
          </button>
        )}
      </div>
    </div>
  )
}
