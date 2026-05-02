'use client'

// 指名ファネル可視化
//   フリー → 場内 → 本指名 → リピート の歩留まりを可視化する。
//
//   定義:
//     ・フリー: 期間内に「フリー」または nomination_status 未設定で初来店した顧客数
//     ・場内: 期間内に「場内」のお客様で来店記録が立った数（ユニーク）
//     ・本指名: 期間内に「本指名」のお客様で来店記録が立った数（ユニーク）
//     ・リピート: 本指名のうち、期間内に2回以上来店した顧客数
//
//   呼び出し元から { free, banai, honshimei, repeat } を渡す。
//   コンバージョン率はステップごとに計算して表示。

import { C } from '@/lib/colors'

export type FunnelData = {
  free: number
  banai: number
  honshimei: number
  repeat: number
}

type Props = {
  data: FunnelData
  title?: string
}

export default function NominationFunnelCard({
  data,
  title = '指名ファネル',
}: Props) {
  const steps: { key: keyof FunnelData; label: string; color: string }[] = [
    { key: 'free', label: 'フリー来店', color: '#B0909A' },
    { key: 'banai', label: '場内', color: '#F5C97B' },
    { key: 'honshimei', label: '本指名', color: '#E8789A' },
    { key: 'repeat', label: 'リピート', color: '#0F6E56' },
  ]

  const max = Math.max(1, data.free, data.banai, data.honshimei, data.repeat)

  // ステップ間 conversion: B/A
  const cv = (a: number, b: number) =>
    a > 0 ? Math.round((b / a) * 100) : 0

  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', color: C.pinkMuted }}>
          NOMINATION FUNNEL
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.dark, marginTop: 2 }}>
          {title}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => {
          const value = data[step.key]
          const widthPct = Math.max(2, Math.round((value / max) * 100))
          const prevValue = i > 0 ? data[steps[i - 1].key] : null
          const conversion = prevValue != null ? cv(prevValue, value) : null
          return (
            <div key={step.key}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 3,
                }}
              >
                <span style={{ fontSize: 11, color: C.dark, fontWeight: 500 }}>
                  {step.label}
                </span>
                <span style={{ fontSize: 11, color: C.dark, fontWeight: 500 }}>
                  {value}人
                  {conversion != null && (
                    <span
                      style={{
                        fontSize: 10,
                        marginLeft: 6,
                        color: conversion >= 50 ? '#0F6E56' : conversion >= 25 ? '#BA7517' : '#A32D2D',
                      }}
                    >
                      ({conversion}%)
                    </span>
                  )}
                </span>
              </div>
              <div
                style={{
                  height: 18,
                  width: `${widthPct}%`,
                  background: step.color,
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 10,
          color: C.pinkMuted,
          lineHeight: 1.5,
        }}
      >
        ※ ()内 は前ステップからのコンバージョン率。
        フリー→場内 は来店動線、場内→本指名 はキャストの転換力、本指名→リピート は満足度の指標
      </div>
    </div>
  )
}
