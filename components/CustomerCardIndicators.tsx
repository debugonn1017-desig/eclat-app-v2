import styles from './CustomerCardIndicators.module.css'
import type { CustomerCompanionNominations } from '@/types'

export type CustomerNominationSummaryProps = {
  honshimeiCast?: string
  companion?: CustomerCompanionNominations
}

export function formatCompanionNominations(companion?: CustomerCompanionNominations) {
  return [
    companion?.honshimei && `本指名 ${companion.honshimei}`,
    companion?.banai && `場内 ${companion.banai}`,
  ].filter(Boolean).join('／')
}

export function CustomerNominationSummary({ honshimeiCast, companion }: CustomerNominationSummaryProps) {
  const companionLabel = formatCompanionNominations(companion)
  if (honshimeiCast === undefined && !companionLabel) return null

  return <span className={styles.nominationSummary}>
    {honshimeiCast !== undefined && <span><b>本指名キャスト</b> {honshimeiCast || '未設定'}</span>}
    {companionLabel && <span><b>お連れ様</b> {companionLabel}</span>}
  </span>
}

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
