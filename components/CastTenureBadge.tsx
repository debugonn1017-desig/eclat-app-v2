import { C } from '@/lib/colors'
import { formatCastTenure, getCastTenure } from '@/lib/castTenure'
import type { CastProfile } from '@/types'

export default function CastTenureBadge({ cast, today, compact = false, dense = false }: {
  cast: CastProfile
  today: string | null
  compact?: boolean
  dense?: boolean
}) {
  const tenure = today ? getCastTenure(cast, today) : null
  const label = tenure ? formatCastTenure(tenure) : '入店から —'
  return <span aria-label={label} title={tenure && tenure.status !== 'unset' ? `入店日：${tenure.joinedDate}` : undefined} style={{
    display: 'inline-flex', flexDirection: compact ? 'column' : 'row', alignItems: 'center',
    justifyContent: 'center', gap: compact ? 2 : 0, flexShrink: 0,
    padding: dense ? '2px 5px' : compact ? '5px 8px' : '5px 10px', borderRadius: 10,
    background: C.tagBg, border: `1px solid ${C.border}`, color: C.dark2,
    fontSize: dense ? 10 : compact ? 11 : 12, lineHeight: 1.4, fontWeight: 600,
  }}>
    {compact && tenure?.status === 'elapsed' ? <>
      <span style={{ fontSize: 10, fontWeight: 500 }}>入店から</span>
      <span>{tenure.years}年{tenure.months}ヶ月{tenure.days}日経過中</span>
    </> : label}
  </span>
}
