import styles from './CustomerCardIndicators.module.css'

/** 星なしも同じ幅の空欄を確保し、全一覧の縦ライン・本文位置を揃える。 */
export function CustomerStarMarker({ starred = true }: { starred?: boolean }) {
  return <span aria-label={starred ? '星付きのお客様' : undefined} aria-hidden={!starred || undefined} className={styles.starMarker}>{starred ? '⭐️' : null}</span>
}

export function CustomerRecencyBadge({ days, color, background }: {
  days: number | null
  color?: string
  background?: string
}) {
  const valid = days !== null && Number.isFinite(days)
  const label = !valid ? '来店未記録' : days < 0 ? '来店予定' : days === 0 ? '本日来店' : `来店から${days}日`
  return <span className={styles.recency} aria-label={label} style={{ color, background }}>
    {valid && days > 0 ? <><span>来店から</span><strong>{days}</strong><span>日</span></> : label}
  </span>
}
