'use client'
// ─────────────────────────────────────────────────────────────────
//  SakuraAnimationSetting — ユーザー個別の桜アニメ ON/OFF UI
//
//  使い所:
//    設定画面 (例: /profile/settings) や、サイドメニューの設定パネル
//
//  使い方:
//    <SakuraAnimationSetting />
//
//  動作:
//    - 現在の localStorage 値 ('on'/'off'/未設定=デフォルト) を表示
//    - トグルでセット → ページリロード
//
//  注意:
//    - 管理者用の「全ユーザー一律 OFF」は別 UI (admin/settings) で
//      app_settings.sakura_animation_enabled を切り替える
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { C } from '@/lib/colors'
import {
  getSakuraAnimationPreference,
  setSakuraAnimationPreference,
} from './SakuraAnimation'

export default function SakuraAnimationSetting() {
  const [pref, setPref] = useState<'on' | 'off' | null>(null)

  useEffect(() => {
    setPref(getSakuraAnimationPreference())
  }, [])

  const isOn = pref !== 'off' // 未設定 = デフォルト ON 扱い

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px',
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 2 }}>
          🌸 桜アニメーション
        </div>
        <div style={{ fontSize: 11, color: C.pinkMuted, lineHeight: 1.5 }}>
          画面の背景で桜の花びらが舞います。OFF にするとバッテリー消費が少しだけ減ります。
        </div>
      </div>
      <button
        onClick={() => setSakuraAnimationPreference(!isOn)}
        aria-label={isOn ? '桜アニメを OFF にする' : '桜アニメを ON にする'}
        style={{
          width: 44, height: 26,
          background: isOn ? C.pink : C.border,
          borderRadius: 13, border: 'none',
          position: 'relative', cursor: 'pointer',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute',
          top: 3, left: isOn ? 21 : 3,
          width: 20, height: 20,
          background: '#FFF',
          borderRadius: '50%',
          transition: 'left 0.15s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  )
}
