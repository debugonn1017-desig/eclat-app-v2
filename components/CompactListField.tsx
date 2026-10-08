import type { ReactNode } from 'react'
import styles from './CompactListField.module.css'

/** 一覧の絞り込み専用。ネイティブ入力と16pxのiOSズーム対策は維持する。 */
export default function CompactListField({ children, compact, withIcon = false }: {
  children: ReactNode
  compact: boolean
  withIcon?: boolean
}) {
  return <span className={`${styles.field}${compact ? ` ${styles.compact}` : ''}${withIcon ? ` ${styles.withIcon}` : ''}`}>
    {children}
  </span>
}
