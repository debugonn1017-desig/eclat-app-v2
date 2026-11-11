'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { captureCustomerListScroll, fitStandaloneDialogViewport } from '@/lib/customerListScroll'
import { customerMeetingColors } from './CustomerMeetingTheme'
import styles from './CustomerMeetingDialog.module.css'

export default function CustomerMeetingDialog({ title, subtitle, busy, onClose, children }: {
  title: string
  subtitle?: string
  busy: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const restore = captureCustomerListScroll()
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    restore()
    document.body.style.overflow = 'hidden'
    const stopFitting = fitStandaloneDialogViewport(dialog)
    return () => {
      stopFitting?.()
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
      restore()
    }
  }, [])

  return <dialog ref={ref} data-customer-scroll className={styles.dialog} style={customerMeetingColors}
    aria-label={title} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
    onClick={event => {
      event.stopPropagation()
      if (busy || event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}>
    <header className={styles.heading}><div>{subtitle && <small>{subtitle}</small>}<h2>{title}</h2></div>
      <button type="button" disabled={busy} onClick={onClose} aria-label="会議編集を閉じる">×</button>
    </header>
    {children}
  </dialog>
}
