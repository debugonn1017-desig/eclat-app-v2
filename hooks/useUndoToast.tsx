// 共通: 削除アクションのUndoトースト
// 使い方:
//   const { show, ToastView } = useUndoToast()
//   await deleteRecord()
//   show('来店記録を削除しました', async () => { await reinsert() })
//   render時に {ToastView} を JSX に入れる
import { useEffect, useRef, useState, ReactElement } from 'react'

type Pending = {
  id: number          // 連続呼び出しで前のトーストを潰すための識別子
  message: string
  undoFn: () => void | Promise<void>
}

const TOAST_DURATION_MS = 8000

export function useUndoToast(): {
  show: (message: string, undoFn: () => void | Promise<void>) => void
  ToastView: ReactElement | null
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const counterRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = (message: string, undoFn: () => void | Promise<void>) => {
    counterRef.current += 1
    const id = counterRef.current
    setPending({ id, message, undoFn })
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setPending(curr => (curr && curr.id === id ? null : curr))
    }, TOAST_DURATION_MS)
  }

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const dismiss = () => setPending(null)
  const undo = async () => {
    if (!pending) return
    const fn = pending.undoFn
    setPending(null)
    try {
      await fn()
    } catch (err) {
      console.error('Undo failed:', err)
      // eslint-disable-next-line no-alert
      alert('元に戻す操作に失敗しました')
    }
  }

  // ─── トースト UI ───
  const ToastView: ReactElement | null = pending ? (
    <div style={{
      position: 'fixed', left: '50%', bottom: 80,
      transform: 'translateX(-50%)', zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: '14px',
      background: '#2A1F25', color: '#FFF',
      padding: '12px 18px', borderRadius: '8px',
      boxShadow: '0 6px 22px rgba(0,0,0,0.25)',
      fontSize: '12px', letterSpacing: '0.05em',
      maxWidth: 'calc(100% - 32px)',
      animation: 'undoToastIn .18s ease-out',
    }}>
      <span>{pending.message}</span>
      <button
        onClick={undo}
        style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,0.45)',
          color: '#FFF', padding: '5px 12px', fontSize: '11px',
          cursor: 'pointer', fontFamily: 'inherit',
          letterSpacing: '0.1em', borderRadius: '6px',
        }}
      >元に戻す</button>
      <button
        onClick={dismiss}
        aria-label="閉じる"
        style={{
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.5)', padding: '0 2px',
          fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >✕</button>
      <style>{`
        @keyframes undoToastIn {
          from { transform: translateX(-50%) translateY(8px); opacity: 0 }
          to { transform: translateX(-50%) translateY(0); opacity: 1 }
        }
      `}</style>
    </div>
  ) : null

  return { show, ToastView }
}
