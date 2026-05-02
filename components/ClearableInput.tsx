'use client'

// クリアボタン付きの input（type=date / type=time の値を消せない問題対策）
//   ネイティブピッカーは値を選択すると未選択状態に戻せないため、
//   値があるときだけ右側に × ボタンを表示してワンタップで空にできるようにする。
//
// 使い方:
//   <ClearableInput type="date" value={x} onChange={(v) => setX(v)} style={...} />
//   <ClearableInput type="time" value={x} onChange={(v) => setX(v)} />
//
// onChange は string を直接渡す（標準 input の e.target.value ラップ）

import { CSSProperties } from 'react'

interface Props {
  type?: 'date' | 'time' | 'text' | 'number' | 'datetime-local' | 'month'
  value: string
  onChange: (next: string) => void
  placeholder?: string
  min?: string
  max?: string
  step?: string | number
  style?: CSSProperties
  className?: string
  disabled?: boolean
  inputMode?: 'numeric' | 'text' | 'decimal' | 'tel' | 'email' | 'url' | 'search'
  autoFocus?: boolean
  /** クリアボタンの位置調整（右パディング）。default 28 */
  clearOffset?: number
}

export default function ClearableInput({
  type = 'text',
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  style,
  className,
  disabled,
  inputMode,
  autoFocus,
  clearOffset = 28,
}: Props) {
  const hasValue = value !== '' && value != null
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        inputMode={inputMode}
        autoFocus={autoFocus}
        className={className}
        style={{
          ...style,
          width: '100%',
          paddingRight: hasValue ? clearOffset : (style?.paddingRight ?? undefined),
          boxSizing: 'border-box',
        }}
      />
      {hasValue && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onChange('')
          }}
          aria-label="クリア"
          style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 20,
            height: 20,
            border: 'none',
            background: 'rgba(176, 144, 154, 0.18)',
            color: '#6B5060',
            borderRadius: '50%',
            fontSize: 11,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      )}
    </span>
  )
}
