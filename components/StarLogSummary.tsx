import type { CSSProperties } from 'react'
import type { StarCycle } from '@/lib/starLog'
import { C } from '@/lib/colors'
import styles from './StarLog.module.css'

export const starLogColors = {
  '--log-text': C.dark, '--log-muted': C.dark2, '--log-pink': C.pink,
  '--log-border': C.border, '--log-tint': C.tagBg2,
} as CSSProperties
const day = (date: string | null | undefined) => date?.slice(5).replace('-', '/') || '未設定'
export default function StarLogSummary({ cycle, loading, compact = false }: { cycle?: StarCycle | null; loading?: boolean; compact?: boolean }) {
  const label = loading ? '⭐️記録を確認中…' : cycle ? `開始 ${day(cycle.started_on)}｜確認 ${day(cycle.last_checked_on)}｜${cycle.last_status || '未記録'}` : '⭐️記録は未取得です'
  return <span className={styles.summary} style={starLogColors} title={label}>{compact ? label.replaceAll('未設定', '—') : label}</span>
}
export function StarLogCardTools({ cycle, loading, onOpen, disabled }: { cycle?: StarCycle | null; loading?: boolean; onOpen: () => void; disabled?: boolean }) {
  return <div className={styles.cardTools} style={starLogColors}><button type="button" className={styles.record} disabled={disabled} onClick={event => { event.stopPropagation(); onOpen() }}>📝記録</button><StarLogSummary cycle={cycle} loading={loading} compact/></div>
}
