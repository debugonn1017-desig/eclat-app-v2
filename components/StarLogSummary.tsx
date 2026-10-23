import type { CSSProperties } from 'react'
import type { StarCycle } from '@/lib/starLog'
import { C } from '@/lib/colors'
import styles from './StarLog.module.css'

export const starLogColors = {
  '--log-text': C.dark, '--log-muted': C.dark2, '--log-pink': C.pink,
  '--log-border': C.border, '--log-tint': C.tagBg2,
  '--log-success': C.successDeep, '--log-success-border': C.success, '--log-success-bg': C.successBg,
  '--log-danger': C.danger, '--log-neutral': C.miniBg,
} as CSSProperties
const day = (date: string | null | undefined) => date?.slice(5).replace('-', '/') || '未設定'
export function StarCheckedBadge({ cycle, today, loading }: { cycle?: StarCycle | null; today?: string | null; loading?: boolean }) {
  if (loading || !today || cycle?.ended_at || cycle?.last_checked_on !== today) return null
  return <span className={styles.checkedBadge} style={starLogColors} title={`本日の状況確認を記録済み${cycle.last_checked_by ? '：' + cycle.last_checked_by : ''}`}>✅ 本日確認済み{cycle.last_checked_by ? ` · ${cycle.last_checked_by}` : ''}</span>
}
export default function StarLogSummary({ cycle, loading, compact = false, today, hideBadge = false }: { cycle?: StarCycle | null; loading?: boolean; compact?: boolean; today?: string | null; hideBadge?: boolean }) {
  const label = loading ? '⭐️記録を確認中…' : cycle ? `開始 ${day(cycle.started_on)}｜確認 ${day(cycle.last_checked_on)}｜${cycle.last_status || '未記録'}` : '⭐️記録は未取得です'
  return <>{!hideBadge && <StarCheckedBadge cycle={cycle} today={today} loading={loading}/>}<span className={styles.summary} style={starLogColors} title={label}>{compact ? label.replaceAll('未設定', '—') : label}</span></>
}
export function StarLogCardTools({ cycle, loading, onOpen, disabled, today }: { cycle?: StarCycle | null; loading?: boolean; onOpen: () => void; disabled?: boolean; today?: string | null }) {
  return <div className={styles.cardTools} style={starLogColors}><button type="button" className={styles.record} disabled={disabled} onClick={event => { event.stopPropagation(); onOpen() }}>📝記録</button><StarCheckedBadge cycle={cycle} today={today} loading={loading}/><StarLogSummary cycle={cycle} loading={loading} compact hideBadge/></div>
}
