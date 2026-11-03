'use client'
import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import { captureCustomerListScroll } from '@/lib/customerListScroll'
import { C } from '@/lib/colors'
import styles from './StarCustomerGoals.module.css'

export default function CustomerGoalsOverlay({ title, children, onClose, large = false, busy = false }: { title: string; children: ReactNode; onClose: () => void; large?: boolean; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const restore = captureCustomerListScroll(), overflow = document.body.style.overflow
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal(); restore(); document.body.style.overflow = 'hidden'
    return () => { dialog.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus({ preventScroll: true }); restore() }
  }, [])
  return <dialog ref={ref} data-customer-scroll className={`${styles.overlay} ${large ? styles.personal : ''}`}
    aria-label={title} style={{ '--goal-bg': C.bgLight, '--goal-text': C.dark, '--goal-border': C.border } as CSSProperties}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header><strong>{title}</strong><button type="button" disabled={busy} onClick={onClose} aria-label={`${title}を閉じる`}>閉じる ×</button></header>
    <div className={styles.overlayBody}>{children}</div>
  </dialog>
}
