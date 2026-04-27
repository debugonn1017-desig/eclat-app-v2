'use client'

import { useEffect, useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import type { Customer } from '@/types'
import { useCustomers } from '@/hooks/useCustomers'
import type { PresetKey } from './SalesListExportModal'

interface Props {
  customers: Customer[]
  onOpenSalesList: (preset: PresetKey) => void
  // 自分のキャスト名で絞りたい場合（cast 用ホーム）
  castNameFilter?: string
}

interface AlertRow {
  preset: PresetKey
  icon: 'cake' | 'clock' | 'snooze'
  label: string
  count: number
  tone: 'pink' | 'amber' | 'red'
}

export default function SalesAlertBanner({
  customers,
  onOpenSalesList,
  castNameFilter,
}: Props) {
  const { getLatestVisitDates } = useCustomers()
  const [latestMap, setLatestMap] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const map = await getLatestVisitDates()
      if (!cancelled) {
        setLatestMap(map)
        setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const filteredCustomers = useMemo(() => {
    if (!castNameFilter) return customers
    return customers.filter((c) => c.cast_name === castNameFilter)
  }, [customers, castNameFilter])

  const alerts = useMemo<AlertRow[]>(() => {
    const result: AlertRow[] = []
    const thisMonth = today.getMonth() + 1
    const nextMonth = ((today.getMonth() + 1) % 12) + 1

    // 今月誕生日
    const bdThisMonth = filteredCustomers.filter((c) => {
      if (!c.birthday) return false
      const m = parseInt(c.birthday.split('-')[1] || '0', 10)
      return m === thisMonth
    }).length
    if (bdThisMonth > 0) {
      result.push({
        preset: 'birthdayThisMonth',
        icon: 'cake',
        label: '今月誕生日',
        count: bdThisMonth,
        tone: 'pink',
      })
    }

    // 来月誕生日
    const bdNextMonth = filteredCustomers.filter((c) => {
      if (!c.birthday) return false
      const m = parseInt(c.birthday.split('-')[1] || '0', 10)
      return m === nextMonth
    }).length
    if (bdNextMonth > 0) {
      result.push({
        preset: 'birthdayNextMonth',
        icon: 'cake',
        label: '来月誕生日',
        count: bdNextMonth,
        tone: 'pink',
      })
    }

    if (loaded) {
      // 60 日以上未来店
      const inactive60 = filteredCustomers.filter((c) => {
        const last = latestMap[c.id]
        if (!last) return true
        const diff = Math.floor((today.getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
        return diff >= 60 && diff < 90
      }).length
      if (inactive60 > 0) {
        result.push({
          preset: 'inactive60',
          icon: 'clock',
          label: '60日以上未来店',
          count: inactive60,
          tone: 'amber',
        })
      }

      // 90 日以上未来店
      const inactive90 = filteredCustomers.filter((c) => {
        const last = latestMap[c.id]
        if (!last) return true
        const diff = Math.floor((today.getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
        return diff >= 90
      }).length
      if (inactive90 > 0) {
        result.push({
          preset: 'inactive90',
          icon: 'snooze',
          label: '90日以上未来店',
          count: inactive90,
          tone: 'red',
        })
      }
    }

    return result
  }, [filteredCustomers, latestMap, loaded, today])

  if (alerts.length === 0) return null

  const toneStyles: Record<
    AlertRow['tone'],
    { bg: string; color: string; border: string; iconBg: string }
  > = {
    pink: { bg: '#FBEAF0', color: C.pink, border: C.pinkLight, iconBg: 'rgba(232,120,154,0.15)' },
    amber: { bg: '#FFF4E0', color: '#B8860B', border: '#F5C97B', iconBg: 'rgba(245,201,123,0.25)' },
    red: { bg: '#FCEBEB', color: '#C53030', border: '#F5A5A5', iconBg: 'rgba(245,165,165,0.25)' },
  }

  const renderIcon = (kind: AlertRow['icon']) => {
    if (kind === 'cake') {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2a3 3 0 00-3 3v1H6a2 2 0 00-2 2v2c0 1.1.9 2 2 2h.5A6.5 6.5 0 0012 22a6.5 6.5 0 005.5-12H18a2 2 0 002-2V8a2 2 0 00-2-2h-3V5a3 3 0 00-3-3z" />
        </svg>
      )
    }
    if (kind === 'clock') {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    }
    // snooze
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
      </svg>
    )
  }

  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        marginBottom: '12px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '2px',
          background: `linear-gradient(90deg, ${C.pink}, #F5C97B, #F5A5A5)`,
        }}
      />
      <div style={{ padding: '10px 14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pink} strokeWidth="1.5">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <path d="M22 4L12 14.01l-3-3" />
          </svg>
          <span
            style={{
              fontSize: '8px',
              letterSpacing: '0.3em',
              color: C.pink,
              fontWeight: 500,
            }}
          >
            SALES ALERTS — エクセル営業リスト出力
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {alerts.map((alert) => {
            const tone = toneStyles[alert.tone]
            return (
              <button
                key={alert.preset}
                onClick={() => onOpenSalesList(alert.preset)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  width: '100%',
                }}
              >
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: tone.iconBg,
                    color: tone.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {renderIcon(alert.icon)}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: '12px',
                    color: C.dark,
                    letterSpacing: '0.05em',
                  }}
                >
                  {alert.label}
                  <span
                    style={{
                      marginLeft: '6px',
                      color: tone.color,
                      fontWeight: 600,
                    }}
                  >
                    {alert.count} 名
                  </span>
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    color: tone.color,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                  }}
                >
                  リスト出力 ›
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
