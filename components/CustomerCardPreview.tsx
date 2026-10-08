'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { C } from '@/lib/colors'
import styles from './CustomerCardPreview.module.css'

/** List-only preview: no customer-page mount, navigation or extra data request. */
export default function CustomerCardPreview({ name, onClose, onOpenCustomer, children }: {
  name: string
  onClose: () => void
  onOpenCustomer: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  return <dialog ref={dialogRef} aria-label={`${name}のカード情報`} className={styles.dialog}
    style={{ '--preview-text': C.dark, '--preview-muted': C.dark2, '--preview-border': C.border,
      '--preview-pink': C.pink, '--preview-bg': C.bgLight } as CSSProperties}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      event.stopPropagation()
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}>
    <div className={styles.handle} aria-hidden />
    <header className={styles.header}><span>カード情報</span><button type="button" onClick={onClose} aria-label="カード情報を閉じる">×</button></header>
    <div className={styles.content}>{children}</div>
    <footer className={styles.footer}>
      <button type="button" onClick={onClose}>一覧に戻る</button>
      <button type="button" onClick={() => { onClose(); onOpenCustomer() }}>個人ページを見る ›</button>
    </footer>
  </dialog>
}
