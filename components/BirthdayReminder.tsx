'use client'

import { useMemo } from 'react'
import { Customer } from '@/types'
import { C } from '@/lib/colors'

interface Props {
  customers: Customer[]
}

interface BirthdayEntry {
  customer: Customer
  daysUntil: number
  displayDate: string
}

export default function BirthdayReminder({ customers }: Props) {
  const upcoming = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const results: BirthdayEntry[] = []

    for (const c of customers) {
      if (!c.birthday) continue
      const parts = c.birthday.split('-')
      if (parts.length < 3) continue

      const bMonth = parseInt(parts[1], 10)
      const bDay = parseInt(parts[2], 10)
      if (isNaN(bMonth) || isNaN(bDay)) continue

      // 今年の誕生日
      let nextBirthday = new Date(today.getFullYear(), bMonth - 1, bDay)
      // 既に過ぎていたら来年
      if (nextBirthday < today) {
        nextBirthday = new Date(today.getFullYear() + 1, bMonth - 1, bDay)
      }

      const diff = Math.floor((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      // 30日以内
      if (diff <= 30) {
        results.push({
          customer: c,
          daysUntil: diff,
          displayDate: `${bMonth}/${bDay}`,
        })
      }
    }

    return results.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [customers])

  if (upcoming.length === 0) return null

  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      marginBottom: '12px',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '2px',
        background: `linear-gradient(90deg, #FFB347, #FF6B6B, ${C.pink})`,
      }} />
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          marginBottom: '8px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pink} strokeWidth="1.5">
            <path d="M12 2a3 3 0 00-3 3v1H6a2 2 0 00-2 2v2c0 1.1.9 2 2 2h.5A6.5 6.5 0 0012 22a6.5 6.5 0 005.5-12H18a2 2 0 002-2V8a2 2 0 00-2-2h-3V5a3 3 0 00-3-3z" />
          </svg>
          <span style={{
            fontSize: '8px', letterSpacing: '0.3em', color: C.pink,
            fontWeight: 500,
          }}>
            BIRTHDAY REMINDER
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {upcoming.map((entry) => (
            <div key={entry.customer.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '6px 8px',
              background: entry.daysUntil === 0
                ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                : entry.daysUntil <= 3
                  ? 'rgba(255,107,107,0.08)'
                  : 'rgba(232,135,155,0.04)',
              borderRadius: '4px',
            }}>
              {/* 日付 */}
              <span style={{
                fontSize: '12px', fontWeight: 600,
                color: entry.daysUntil === 0 ? '#fff' : C.pink,
                minWidth: '40px',
              }}>
                {entry.displayDate}
              </span>

              {/* 名前 */}
              <span style={{
                fontSize: '12px', flex: 1,
                color: entry.daysUntil === 0 ? '#fff' : C.dark,
              }}>
                {entry.customer.customer_name}
                {entry.customer.cast_name && (
                  <span style={{
                    fontSize: '9px', marginLeft: '6px',
                    color: entry.daysUntil === 0 ? 'rgba(255,255,255,0.7)' : C.pinkMuted,
                  }}>
                    ({entry.customer.cast_name})
                  </span>
                )}
              </span>

              {/* あと何日 */}
              <span style={{
                fontSize: '10px', fontWeight: 600, flexShrink: 0,
                color: entry.daysUntil === 0 ? '#fff'
                  : entry.daysUntil <= 3 ? '#FF6B6B'
                    : entry.daysUntil <= 7 ? '#FFB347'
                      : C.pinkMuted,
              }}>
                {entry.daysUntil === 0
                  ? 'TODAY!'
                  : entry.daysUntil === 1
                    ? '明日'
                    : `あと${entry.daysUntil}日`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
