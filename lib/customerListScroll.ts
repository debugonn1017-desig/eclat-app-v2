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
