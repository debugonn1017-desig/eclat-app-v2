'use client'

import { useEffect, useLayoutEffect, useState, type TouchEvent } from 'react'
import { createCustomerCardGesture, type CustomerCardGestureOptions } from '@/lib/customerCardGesture'

export function useCustomerCardGesture(options: CustomerCardGestureOptions, ignoreInteractiveControls = true) {
  const [gesture] = useState(() => createCustomerCardGesture(options))
  useLayoutEffect(() => { gesture.setOptions(options) }, [gesture, options])
  useEffect(() => {
    const onHidden = () => { if (document.hidden) gesture.cancel() }
    window.addEventListener('blur', gesture.cancel)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      gesture.cancel()
      window.removeEventListener('blur', gesture.cancel)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [gesture])
  return {
    onTouchStart(event: TouchEvent<HTMLDivElement>) {
      const touch = event.touches[0]
      if (!touch) return
      const interactive = ignoreInteractiveControls && event.target instanceof Element
        && Boolean(event.target.closest('button, a, input, select, textarea'))
      gesture.start({ x: touch.clientX, y: touch.clientY }, event.touches.length, interactive)
    },
    onTouchMove(event: TouchEvent<HTMLDivElement>) {
      const touch = event.touches[0]
      if (touch) gesture.move({ x: touch.clientX, y: touch.clientY }, event.touches.length)
    },
    onTouchEnd(event: TouchEvent<HTMLDivElement>) {
      const touch = event.changedTouches[0]
      if (touch) {
        const heldRelease = gesture.end({ x: touch.clientX, y: touch.clientY })
        // 長押し中に開いたdialogへreleaseの互換clickが飛ぶと、背景を
        // 押した扱いで直ちに閉じる。通常タップとスワイプは従来どおり。
        if (heldRelease) event.preventDefault()
      }
      else gesture.cancel()
    },
    onTouchCancel: gesture.cancel,
    consumeClick: gesture.consumeClick,
  }
}
