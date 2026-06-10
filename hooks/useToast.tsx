// 共通: 汎用通知トースト (success / error / warning)
// 使い方:
//   const { toast, ToastView } = useToast()
//   toast('反映に失敗しました', 'error')
//   render時に {ToastView} を JSX に入れる
//
// v0.3.46-A:
//   ・alert() の置き換え用。alert と違って処理をブロックしない
//   ・4秒で自動消滅、✕で手動クローズ、連続呼び出しは前のトーストを潰す
//   ・削除Undo は従来どおり useUndoToast を使う (こちらは通知専用)
import { useEffect, useRef, useState, ReactElement } from 'react'

export type ToastType = 'success' | 'error' | 'warning'

type Pending = {
  id: number          // 連続呼び出しで前のトーストを潰すための識別子
  message: string
  type: ToastType
}

const TOAST_DURATION_MS = 4000

const TOAST_STYLE: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: '#0F6E56', icon: '✓' },
  error: { bg: '#B3322B', icon: '⚠' },
  warning: { bg: '#B47B12', icon: '❕' },
}

export function useToast(): {
  toast: (message: string, type?: ToastType) => void
  ToastView: ReactElement | null
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const counterRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toast = (message: string, type: ToastType = 'success') => {
    counterRef.current += 1
    const id = counterRef.current
    setPending({ id, message, type })
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setPending(curr => (curr && curr.id === id ? null : curr))
    }, TOAST_DURATION_MS)
  }

  // unmount 時に timeout を必ず掃除
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  // ─── トースト UI (useUndoToast と同じ下部中央・bottom 80) ───
  const ToastView: ReactElement | null = pending ? (
    <div style={{
      position: 'fixed', left: '50%', bottom: 80,
      transform: 'translateX(-50%)', zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: '10px',
      background: TOAST_STYLE[pending.type].bg, color: '#FFF',
      padding: '12px 18px', borderRadius: '8px',
      boxShadow: '0 6px 22px rgba(0,0,0,0.25)',
      fontSize: '12px', letterSpacing: '0.05em',
      maxWidth: 'calc(100% - 32px)',
      animation: 'notifyToastIn .18s ease-out',
    }}>
      <span aria-hidden="true">{TOAST_STYLE[pending.type].icon}</span>
      <span>{pending.message}</span>
      <button
        onClick={() => setPending(null)}
        aria-label="閉じる"
        style={{
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.6)', padding: '0 2px',
          fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >✕</button>
      <style>{`
        @keyframes notifyToastIn {
          from { transform: translateX(-50%) translateY(8px); opacity: 0 }
          to { transform: translateX(-50%) translateY(0); opacity: 1 }
        }
      `}</style>
    </div>
  ) : null

  return { toast, ToastView }
}
