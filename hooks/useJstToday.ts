'use client'

import { useSyncExternalStore } from 'react'
import { todayJST } from '@/lib/dateUtils'

const DAY_MS = 86_400_000
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

// 一覧の行ごとでなく、一覧ページ・バナーでそれぞれ1回購読する。
function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>
  function schedule() {
    clearTimeout(timer)
    const untilMidnight = DAY_MS - ((Date.now() + JST_OFFSET_MS) % DAY_MS)
    timer = setTimeout(refresh, untilMidnight + 50)
  }
  function refresh() {
    onChange()
    schedule()
  }
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') refresh()
  }
  schedule()
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => {
    clearTimeout(timer)
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

const getSnapshot = (): string | null => todayJST()
const getServerSnapshot = (): string | null => null

/** SSRとの日付境界の不一致を避け、JST日付変更・画面復帰時にも更新する。 */
export function useJstToday(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
