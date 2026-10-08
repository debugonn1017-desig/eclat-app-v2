export const CUSTOMER_LONG_PRESS_MS = 550
export const CUSTOMER_GESTURE_MOVE_PX = 10

type Point = { x: number; y: number }
export type CustomerCardGestureOptions = {
  disabled: boolean
  longPress: boolean
  canSwipe: boolean
  onOpen: () => void
  onSwipe: (direction: 'left' | 'right') => void
}
type Clock = {
  schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clear: (id: ReturnType<typeof setTimeout>) => void
}

/** Touch-only: movement cancels the hold, while the existing 45px swipe still works. */
export function createCustomerCardGesture(initialOptions: CustomerCardGestureOptions, clock: Clock = {
  schedule: (fn, ms) => setTimeout(fn, ms),
  clear: id => clearTimeout(id),
}) {
  let currentOptions = initialOptions
  let start: Point | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let held = false
  let suppressClick = false
  const clearTimer = () => {
    if (timer !== null) clock.clear(timer)
    timer = null
  }
  const cancel = () => {
    clearTimer()
    if (start) suppressClick = true
    start = null
  }
  return {
    setOptions(options: CustomerCardGestureOptions) {
      currentOptions = options
      if (options.disabled) cancel()
      else if (!options.longPress) clearTimer()
    },
    start(point: Point, touchCount = 1, interactive = false) {
      clearTimer()
      start = null
      held = false
      suppressClick = false
      const options = currentOptions
      if (options.disabled || touchCount !== 1 || interactive) return
      start = point
      if (options.longPress) timer = clock.schedule(() => {
        timer = null
        const latest = currentOptions
        if (!start || latest.disabled || !latest.longPress) return
        held = true
        suppressClick = true
        latest.onOpen()
      }, CUSTOMER_LONG_PRESS_MS)
    },
    move(point: Point, touchCount = 1) {
      if (touchCount !== 1) { cancel(); return }
      if (start && Math.hypot(point.x - start.x, point.y - start.y) > CUSTOMER_GESTURE_MOVE_PX) {
        clearTimer()
        suppressClick = true
      }
    },
    end(point: Point) {
      clearTimer()
      const origin = start
      start = null
      const options = currentOptions
      if (!origin || held || options.disabled) return
      const dx = point.x - origin.x
      const dy = point.y - origin.y
      if (Math.hypot(dx, dy) > CUSTOMER_GESTURE_MOVE_PX) suppressClick = true
      if (!options.canSwipe || Math.abs(dx) < 45 || Math.abs(dy) > Math.abs(dx)) return
      suppressClick = true
      options.onSwipe(dx < 0 ? 'left' : 'right')
    },
    cancel,
    consumeClick() {
      const result = suppressClick
      suppressClick = false
      return result
    },
  }
}
