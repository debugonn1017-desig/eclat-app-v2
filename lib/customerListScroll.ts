/** ページ本体と、接客日の一覧など独立したスクロール領域をまとめて保持する。 */
export function captureCustomerListScroll(): () => void {
  if (typeof window === 'undefined') return () => {}
  const x = window.scrollX, y = window.scrollY
  const containers = Array.from(document.querySelectorAll<HTMLElement>('[data-customer-scroll]'))
    .map(element => ({ element, left: element.scrollLeft, top: element.scrollTop }))
  return () => {
    for (const { element, left, top } of containers) {
      if (element.isConnected) element.scrollTo({ left, top, behavior: 'instant' })
    }
    window.scrollTo({ left: x, top: y, behavior: 'instant' })
  }
}

/** ホーム画面版で、入力中のダイアログをキーボードで隠れない範囲に収める。 */
export function fitStandaloneDialogViewport(dialog: HTMLDialogElement) {
  const viewport = window.visualViewport
  if (!viewport || !window.matchMedia('(display-mode: standalone)').matches) return

  const clear = () => {
    dialog.style.removeProperty('--dialog-top')
    dialog.style.removeProperty('--dialog-bottom')
    dialog.style.removeProperty('--dialog-visible-height')
  }
  let frame: number | undefined
  const update = () => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      const active = document.activeElement
      if (viewport.scale !== 1 || active?.closest('dialog') !== dialog || !active.matches('input, textarea, select')) {
        clear()
        return
      }
      const layoutHeight = document.documentElement.clientHeight
      const top = Math.max(0, viewport.offsetTop)
      const bottom = Math.min(layoutHeight, viewport.offsetTop + viewport.height)
      if (bottom <= top) { clear(); return }
      dialog.style.setProperty('--dialog-top', `${top}px`)
      dialog.style.setProperty('--dialog-bottom', `${layoutHeight - bottom}px`)
      dialog.style.setProperty('--dialog-visible-height', `${bottom - top}px`)
      if (top === 0 && bottom === layoutHeight) return

      // 縮んだダイアログで入力欄が隠れたときは、その中だけをスクロールする。
      const bounds = dialog.getBoundingClientRect()
      const header = dialog.querySelector(':scope > header')
      const footer = dialog.querySelector(':scope > footer, :scope > form > footer')
      const visibleTop = (header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : bounds.top) + 4
      const visibleBottom = (footer?.getBoundingClientRect().top ?? bounds.bottom) - 4
      if (visibleBottom <= visibleTop) return
      const field = active.getBoundingClientRect()
      const fieldHeight = Math.min(field.height, visibleBottom - visibleTop)
      const fieldTop = Math.min(Math.max(field.top, visibleTop), visibleBottom - fieldHeight)
      if (Math.abs(field.top - fieldTop) >= 1) dialog.scrollTop += field.top - fieldTop
    })
  }
  update()
  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  window.addEventListener('resize', update)
  dialog.addEventListener('focusin', update)
  dialog.addEventListener('focusout', update)
  return () => {
    viewport.removeEventListener('resize', update)
    viewport.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    dialog.removeEventListener('focusin', update)
    dialog.removeEventListener('focusout', update)
    if (frame !== undefined) cancelAnimationFrame(frame)
    clear()
  }
}
