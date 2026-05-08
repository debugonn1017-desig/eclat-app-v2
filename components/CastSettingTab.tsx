'use client'
// ─────────────────────────────────────────────────────────────────
//  CastSettingTab — キャスト個別ページの SETTING タブ
// ─────────────────────────────────────────────────────────────────
//  月別ノルマを編集する。フォーム本体は TargetForm（共通部品）に
//  分離してあるので、ここはロード/保存のロジックだけ。
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { C } from '@/lib/colors'
import { CastTarget } from '@/types'
import { useCasts } from '@/hooks/useCasts'
import TargetForm, { TargetValues } from './TargetForm'

interface Props {
  castId: string
  month: string
  isAdmin: boolean
  onSave?: () => void
}

export default function CastSettingTab({ castId, month, isAdmin, onSave }: Props) {
  const { getCastTarget, upsertCastTarget } = useCasts()
  const [target, setTarget] = useState<CastTarget | null>(null)
  const [loading, setLoading] = useState(true)

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-')
    return `${y}年${Number(m)}月`
  }, [month])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const ct = await getCastTarget(castId, month)
      setTarget(ct)
      setLoading(false)
    }
    load()
  }, [castId, month, getCastTarget])

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ fontSize: '11px', color: C.pinkMuted, letterSpacing: '0.15em' }}>
          この画面は管理者のみ操作できます
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontSize: '9px', color: C.pinkMuted }}>
        読み込み中...
      </div>
    )
  }

  return (
    <div>
      <div style={{
        fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted,
        marginBottom: '12px',
      }}>
        {monthLabel} のノルマ設定
      </div>
      <TargetForm
        initial={target ? {
          target_sales: target.target_sales ?? 0,
          target_work_days: target.target_work_days ?? 0,
          target_honshimei: target.target_honshimei ?? 0,
          target_banai: target.target_banai ?? 0,
          target_local_customers: target.target_local_customers ?? 0,
          target_remote_customers: target.target_remote_customers ?? 0,
          rank_targets: target.rank_targets ?? undefined,
        } : null}
        onSave={async (values: TargetValues) => {
          await upsertCastTarget(castId, month, {
            target_sales: values.target_sales,
            target_work_days: values.target_work_days,
            target_nominations: 0,
            target_new_customers: 0,
            target_honshimei: values.target_honshimei,
            target_banai: values.target_banai,
            target_local_customers: values.target_local_customers,
            target_remote_customers: values.target_remote_customers,
            rank_targets: values.rank_targets,
          })
          onSave?.()
        }}
      />
    </div>
  )
}
