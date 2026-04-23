'use client'

import { useState, useEffect, useMemo } from 'react'
import { C } from '@/lib/colors'
import { CastTarget, CustomerRank, RankTargets } from '@/types'
import { useCasts } from '@/hooks/useCasts'

const RANKS: CustomerRank[] = ['S', 'A', 'B', 'C']

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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // フォーム状態
  const [targetSales, setTargetSales] = useState('')
  const [targetWorkDays, setTargetWorkDays] = useState('')
  const [targetHonshimei, setTargetHonshimei] = useState('')
  const [targetBanai, setTargetBanai] = useState('')
  const [targetLocal, setTargetLocal] = useState('')
  const [targetRemote, setTargetRemote] = useState('')
  const [rankTargets, setRankTargets] = useState<Record<CustomerRank, { sales: string; visits: string }>>({
    S: { sales: '', visits: '' },
    A: { sales: '', visits: '' },
    B: { sales: '', visits: '' },
    C: { sales: '', visits: '' },
  })

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-')
    return `${y}年${Number(m)}月`
  }, [month])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const ct = await getCastTarget(castId, month)
      setTarget(ct)
      if (ct) {
        setTargetSales(ct.target_sales?.toString() ?? '')
        setTargetWorkDays(ct.target_work_days?.toString() ?? '')
        setTargetHonshimei(ct.target_honshimei?.toString() ?? '')
        setTargetBanai(ct.target_banai?.toString() ?? '')
        setTargetLocal(ct.target_local_customers?.toString() ?? '')
        setTargetRemote(ct.target_remote_customers?.toString() ?? '')
        if (ct.rank_targets) {
          const rt = ct.rank_targets as RankTargets
          setRankTargets({
            S: { sales: rt.S?.sales?.toString() ?? '', visits: rt.S?.visits?.toString() ?? '' },
            A: { sales: rt.A?.sales?.toString() ?? '', visits: rt.A?.visits?.toString() ?? '' },
            B: { sales: rt.B?.sales?.toString() ?? '', visits: rt.B?.visits?.toString() ?? '' },
            C: { sales: rt.C?.sales?.toString() ?? '', visits: rt.C?.visits?.toString() ?? '' },
          })
        }
      } else {
        setTargetSales('')
        setTargetWorkDays('')
        setTargetHonshimei('')
        setTargetBanai('')
        setTargetLocal('')
        setTargetRemote('')
        setRankTargets({
          S: { sales: '', visits: '' },
          A: { sales: '', visits: '' },
          B: { sales: '', visits: '' },
          C: { sales: '', visits: '' },
        })
      }
      setLoading(false)
    }
    load()
  }, [castId, month, getCastTarget])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    const rt: RankTargets = {
      S: { sales: Number(rankTargets.S.sales) || 0, visits: Number(rankTargets.S.visits) || 0 },
      A: { sales: Number(rankTargets.A.sales) || 0, visits: Number(rankTargets.A.visits) || 0 },
      B: { sales: Number(rankTargets.B.sales) || 0, visits: Number(rankTargets.B.visits) || 0 },
      C: { sales: Number(rankTargets.C.sales) || 0, visits: Number(rankTargets.C.visits) || 0 },
    }

    await upsertCastTarget(castId, month, {
      target_sales: Number(targetSales) || 0,
      target_work_days: Number(targetWorkDays) || 0,
      target_nominations: 0,
      target_new_customers: 0,
      target_honshimei: Number(targetHonshimei) || 0,
      target_banai: Number(targetBanai) || 0,
      target_local_customers: Number(targetLocal) || 0,
      target_remote_customers: Number(targetRemote) || 0,
      rank_targets: rt,
    })

    setSaving(false)
    setSaved(true)
    onSave?.()
    setTimeout(() => setSaved(false), 2000)
  }

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
    return <div style={{ padding: '40px', textAlign: 'center', fontSize: '9px', color: C.pinkMuted }}>読み込み中...</div>
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    fontSize: '14px', fontFamily: 'inherit',
    border: `1px solid ${C.border}`, background: C.white,
    color: C.dark, outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px', letterSpacing: '0.15em',
    color: C.pinkMuted, marginBottom: '4px',
    display: 'block',
  }

  return (
    <div>
      <div style={{
        fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted,
        marginBottom: '12px',
      }}>
        {monthLabel} のノルマ設定
      </div>

      {/* 売上・出勤日数 */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '16px', marginBottom: '10px', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
          background: C.pink,
        }} />
        <div style={{ fontSize: '11px', fontWeight: 600, color: C.dark, marginBottom: '12px' }}>
          基本目標
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>設定売上（円）</label>
            <input
              type="number" value={targetSales}
              onChange={e => setTargetSales(e.target.value)}
              placeholder="0" style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>設定出勤日数</label>
            <input
              type="number" value={targetWorkDays}
              onChange={e => setTargetWorkDays(e.target.value)}
              placeholder="0" style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 指名目標 */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '16px', marginBottom: '10px', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
          background: '#D4A76A',
        }} />
        <div style={{ fontSize: '11px', fontWeight: 600, color: C.dark, marginBottom: '12px' }}>
          指名目標
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>目標本指名数</label>
            <input
              type="number" value={targetHonshimei}
              onChange={e => setTargetHonshimei(e.target.value)}
              placeholder="0" style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>目標場内数</label>
            <input
              type="number" value={targetBanai}
              onChange={e => setTargetBanai(e.target.value)}
              placeholder="0" style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 県内/県外 */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '16px', marginBottom: '10px', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
          background: C.pinkLight,
        }} />
        <div style={{ fontSize: '11px', fontWeight: 600, color: C.dark, marginBottom: '12px' }}>
          エリア目標（本指名顧客）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>目標 県内（福岡）人数</label>
            <input
              type="number" value={targetLocal}
              onChange={e => setTargetLocal(e.target.value)}
              placeholder="0" style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>目標 県外 人数</label>
            <input
              type="number" value={targetRemote}
              onChange={e => setTargetRemote(e.target.value)}
              placeholder="0" style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* ランク別目標 */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '16px', marginBottom: '10px', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
          background: C.pinkMuted,
        }} />
        <div style={{ fontSize: '11px', fontWeight: 600, color: C.dark, marginBottom: '12px' }}>
          ランク別目標
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 1fr', gap: '6px',
          alignItems: 'center', marginBottom: '4px',
        }}>
          <div style={{ fontSize: '9px', color: C.pinkMuted }}>ランク</div>
          <div style={{ fontSize: '9px', color: C.pinkMuted, textAlign: 'center' }}>売上（円）</div>
          <div style={{ fontSize: '9px', color: C.pinkMuted, textAlign: 'center' }}>来店回数</div>
        </div>
        {RANKS.map(rank => (
          <div key={rank} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 1fr', gap: '6px',
            alignItems: 'center', marginBottom: '6px',
          }}>
            <span style={{
              fontSize: '13px', fontWeight: 600, color: C.pink,
              textAlign: 'center',
            }}>{rank}</span>
            <input
              type="number"
              value={rankTargets[rank].sales}
              onChange={e => setRankTargets(prev => ({
                ...prev,
                [rank]: { ...prev[rank], sales: e.target.value },
              }))}
              placeholder="0"
              style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }}
            />
            <input
              type="number"
              value={rankTargets[rank].visits}
              onChange={e => setRankTargets(prev => ({
                ...prev,
                [rank]: { ...prev[rank], visits: e.target.value },
              }))}
              placeholder="0"
              style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }}
            />
          </div>
        ))}
      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', padding: '14px',
          background: saving ? C.pinkMuted : `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
          color: C.white, border: 'none',
          fontSize: '12px', letterSpacing: '0.15em',
          fontFamily: 'inherit', cursor: saving ? 'default' : 'pointer',
          fontWeight: 600,
        }}
      >
        {saving ? '保存中...' : saved ? '保存しました' : '保存'}
      </button>
    </div>
  )
}
