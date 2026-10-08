import styles from './CustomerCardIndicators.module.css'

/** 全一覧でカード本文の左隣に置く。名前行や上部の余白は増やさない。 */
export function CustomerStarMarker() {
  return <span aria-label="星付きのお客様" className={styles.starMarker}>⭐️</span>
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
