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
import { useCallback, useEffect, useRef, useState, ReactElement } from 'react'
// v0.3.50-B: トースト3色の定義元を colors.ts のトークンに一本化
import { C } from '@/lib/colors'

export type ToastType = 'success' | 'error' | 'warning'

type Pending = {
  id: number          // 連続呼び出しで前のトーストを潰すための識別子
  message: string
  type: ToastType
}

const TOAST_DURATION_MS = 4000

const TOAST_STYLE: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: C.successDeep, icon: '✓' },
  error: { bg: C.dangerDeep, icon: '⚠' },
  warning: { bg: C.warningDeep, icon: '❕' },
}

export function useToast(): {
  toast: (message: string, type?: ToastType) => void
  ToastView: ReactElement | null
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const counterRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // v0.3.50-C hotfix3: useCallback 化で identity を安定させる。
  //   消費側 (例: app/admin/shifts/page.tsx の useEffect) が deps に toast を入れた時、
  //   毎レンダー別関数になって effect が再発火するループ気味挙動を防ぐ。Codex P2 指摘対応。
  //   参照する setState setter / Ref / モジュール定数はすべて安定参照なので deps は [] で OK。
  const toast = useCallback((message: string, type: ToastType = 'success') => {
    counterRef.current += 1
    const id = counterRef.current
    setPending({ id, message, type })
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setPending(curr => (curr && curr.id === id ? null : curr))
    }, TOAST_DURATION_MS)
  }, [])

  // unmount 時に timeout を必ず掃除
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  // v0.3.46-B (P3): 手動クローズ時も timeout を掃除する
  // v0.3.50-C hotfix3: dismiss も useCallback 化 (toast と整合、参照安定化で ToastView の再生成も抑制)
  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setPending(null)
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
        onClick={dismiss}
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
