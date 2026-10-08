import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCustomerCardGesture, CUSTOMER_LONG_PRESS_MS, type CustomerCardGestureOptions } from './customerCardGesture'

function fixture(overrides: Partial<CustomerCardGestureOptions> = {}) {
  let now = 0
  let id = 0
  const pending = new Map<number, { due: number; run: () => void }>()
  const calls: string[] = []
  const options = { disabled: false, longPress: true, canSwipe: true,
    onLongPress: () => calls.push('preview'), onSwipe: (d: string) => calls.push(d), ...overrides }
  const gesture = createCustomerCardGesture(options, {
    schedule(fn, ms) { const n = ++id; pending.set(n, { due: now + ms, run: fn }); return n as unknown as ReturnType<typeof setTimeout> },
    clear(n) { pending.delete(n as unknown as number) },
  })
  const advance = (ms: number) => {
    now += ms
    for (const [n, task] of pending) if (task.due <= now) { pending.delete(n); task.run() }
  }
  return { gesture, calls, advance, options }
}
const point = { x: 100, y: 100 }
test('550ms hold previews once, release cannot swipe, synthetic click is consumed once', () => {
  const { gesture: g, calls, advance } = fixture()
  g.start(point); advance(CUSTOMER_LONG_PRESS_MS - 1); assert.deepEqual(calls, [])
  advance(1); advance(1000); assert.deepEqual(calls, ['preview'])
  g.end({ x: 20, y: 100 }); assert.deepEqual(calls, ['preview'])
  assert.equal(g.consumeClick(), true); assert.equal(g.consumeClick(), false)
})
test('short tap stays a normal click and next tap resets prior hold suppression', () => {
  const { gesture: g, calls, advance } = fixture()
  g.start(point); advance(100); g.end(point); advance(1000)
  assert.deepEqual(calls, []); assert.equal(g.consumeClick(), false)
  g.start(point); advance(550); g.end(point); g.start(point); g.end(point)
  assert.equal(g.consumeClick(), false)
})
test('vertical scroll cancels long press and ghost click without opening swipe actions', () => {
  const { gesture: g, calls, advance } = fixture()
  g.start(point); g.move({ x: 102, y: 150 }); advance(550); g.end({ x: 102, y: 160 })
  assert.deepEqual(calls, []); assert.equal(g.consumeClick(), true)
})
test('horizontal swipe keeps 45px threshold and consumes click', () => {
  const { gesture: g, calls, advance } = fixture()
  g.start(point); g.move({ x: 50, y: 101 }); advance(550); g.end({ x: 50, y: 101 })
  assert.deepEqual(calls, ['left']); assert.equal(g.consumeClick(), true)
  g.start(point); g.end({ x: 145, y: 100 }); assert.deepEqual(calls, ['left', 'right'])
  g.start(point); g.end({ x: 144, y: 100 }); assert.deepEqual(calls, ['left', 'right'])
})
test('small jitter remains a hold; multi-touch start/move cancel it', () => {
  const f = fixture(); f.gesture.start(point); f.gesture.move({ x: 103, y: 104 }); f.advance(550)
  assert.deepEqual(f.calls, ['preview'])
  const two = fixture(); two.gesture.start(point, 2); two.advance(550); assert.deepEqual(two.calls, [])
  two.gesture.start(point); two.gesture.move(point, 2); two.advance(550); assert.deepEqual(two.calls, [])
})
test('cancel covers touchcancel, unmount, blur and hidden-page cleanup', () => {
  const f = fixture(); f.gesture.start(point); f.gesture.cancel(); f.advance(550); f.gesture.end(point)
  assert.deepEqual(f.calls, []); assert.equal(f.gesture.consumeClick(), true)
})
test('selection / busy disables hold and swipe; switching during hold cancels timer', () => {
  const f = fixture({ disabled: true }); f.gesture.start(point); f.advance(550); f.gesture.end({ x: 0, y: 100 })
  assert.deepEqual(f.calls, [])
  f.gesture.setOptions({ ...f.options, disabled: false }); f.gesture.start(point)
  f.gesture.setOptions({ ...f.options, disabled: true }); f.advance(550)
  assert.deepEqual(f.calls, [])
})
test('buttons never start card gestures; view mode / open actions disable hold only', () => {
  const f = fixture(); f.gesture.start(point, 1, true); f.advance(550); assert.deepEqual(f.calls, [])
  f.gesture.start(point); f.gesture.setOptions({ ...f.options, longPress: false }); f.advance(550)
  assert.deepEqual(f.calls, [])
  f.gesture.end({ x: 20, y: 100 }); assert.deepEqual(f.calls, ['left'])
})
test('read-only viewers can hold for details without any swipe operation', () => {
  const f = fixture({ canSwipe: false }); f.gesture.start(point); f.advance(550); assert.deepEqual(f.calls, ['preview'])
  f.gesture.start(point); f.gesture.end({ x: 10, y: 100 }); assert.deepEqual(f.calls, ['preview'])
})
test('timer uses latest callback, not the previous customer', () => {
  const f = fixture(); f.gesture.start(point)
  f.gesture.setOptions({ ...f.options, onLongPress: () => f.calls.push('latest') }); f.advance(550)
  assert.deepEqual(f.calls, ['latest'])
})
