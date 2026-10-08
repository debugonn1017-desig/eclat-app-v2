'use client'

import { type ReactNode } from 'react'
import type { CustomerRank } from '@/types'
import { C } from '@/lib/colors'
import { CustomerStarMarker } from '@/components/CustomerCardIndicators'
import { useCustomerCardGesture } from '@/hooks/useCustomerCardGesture'

type Props = {
  customerId: string
  customerName: string
  customerRank: CustomerRank | null
  isFollowUp: boolean
  noReply?: boolean
  onToggleNoReply?: () => void
  canManage: boolean
  selectionMode: boolean
  selected: boolean
  actionsOpen: boolean
  busy?: boolean
  borderRadius?: number
  compactMobile?: boolean
  onOpen: () => void
  onToggleSelected: () => void
  onToggleActions: () => void
  onAddFollowUp: () => void
  onRemoveFollowUp: () => void
  onMoveToSevered: () => void
  children: ReactNode
}

export default function CustomerActionCardShell({
  customerId,
  customerName,
  customerRank,
  isFollowUp,
  noReply = false,
  onToggleNoReply,
  canManage,
  selectionMode,
  selected,
  actionsOpen,
  busy = false,
  borderRadius = 0,
  compactMobile = false,
  onOpen,
  onToggleSelected,
  onToggleActions,
  onAddFollowUp,
  onRemoveFollowUp,
  onMoveToSevered,
  children,
}: Props) {
  const gesture = useCustomerCardGesture({
    disabled: selectionMode || busy,
    longPress: compactMobile && !actionsOpen,
    canSwipe: canManage,
    onOpen,
    onSwipe: direction => {
      if ((direction === 'left') !== actionsOpen) onToggleActions()
    },
  }, compactMobile)

  return (
    <div
      data-customer-swipe="true"
      data-customer-id={customerId}
      data-compact-customer={compactMobile || undefined}
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
          width: 240,
          display: selectionMode ? 'none' : 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
        }}>
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              if (isFollowUp) onRemoveFollowUp()
              else onAddFollowUp()
            }}
            style={{
              border: 'none',
              background: isFollowUp ? '#B78492' : C.pink,
              color: '#FFF',
              fontSize: 10,
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              padding: '0 6px',
            }}
          >
            {isFollowUp ? '⭐️解除' : '⭐️追加'}
          </button>
          <button type="button" disabled={busy || !onToggleNoReply}
            onClick={event => { event.stopPropagation(); onToggleNoReply?.() }}
            style={{ border: 'none', background: '#AC849D', color: '#FFF', fontFamily: 'inherit', fontSize: 11, fontWeight: 700 }}>
            {noReply ? '返信なし解除' : '返信なし'}
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
        onTouchStart={gesture.onTouchStart}
        onTouchMove={gesture.onTouchMove}
        onTouchEnd={gesture.onTouchEnd}
        onTouchCancel={gesture.onTouchCancel}
        onContextMenu={event => { if (compactMobile) event.preventDefault() }}
        onClick={() => {
          if (gesture.consumeClick() || busy) return
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
          paddingRight: canManage && !selectionMode ? (compactMobile ? 44 : 34) : 0,
          boxSizing: 'border-box',
          background: selected ? '#FFF0F4' : C.white,
          transform: canManage && !selectionMode && actionsOpen
            ? 'translateX(-240px)'
            : 'translateX(0)',
          transition: 'transform 0.2s ease, background 0.15s',
          touchAction: 'pan-y',
          cursor: 'pointer',
          WebkitTouchCallout: compactMobile ? 'none' : undefined,
          userSelect: compactMobile ? 'none' : undefined,
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
        {isFollowUp && <CustomerStarMarker/>}
        <div style={{ flex: 1, minWidth: 0 }}>
          {children}
        </div>
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
              top: compactMobile ? 0 : 8,
              right: compactMobile ? 0 : 8,
              width: compactMobile ? 44 : 24,
              height: compactMobile ? 44 : 24,
              border: compactMobile ? 'none' : `1px solid ${C.border}`,
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
