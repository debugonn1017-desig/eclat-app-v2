'use client'

// 🎓 個人改善診断（キャスト分析専用タブ）
//   このキャストのKPIを「同じ層（A層/B層/新人層 等）の平均」と比較し、
//   下回っている項目を抽出して「あなたが伸ばすべき3つのポイント」として提示。
//   /admin/cast-analysis の改善診断タブから使用。

import { useEffect, useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import { CastKPI, CastProfile, CastTier } from '@/types'

type RankingApi = {
  cast: CastProfile
  kpi: CastKPI
  prevSales: number
  targetSales: number
  achievementRate: number
}

type Diagnosis = {
  metric: string
  emoji: string
  myValue: number
  peerAvg: number
  ratio: number          // this / peer
  formattedMy: string
  formattedPeer: string
  severity: 'critical' | 'warning' | 'info' | 'good'
  message: string
  advice: string
}

export function CastImprovementDiagnosis({
  cast, currentMonth, currentKPI, allRows, isPC,
}: {
  cast: CastProfile
  currentMonth: string
  currentKPI: CastKPI | undefined
  allRows: RankingApi[]
  isPC: boolean
}) {
  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const peerTier = cast.cast_tier

  // 同層キャスト抽出（自分以外）
  const peers = useMemo(() => {
    if (!peerTier) return allRows.filter(r => r.cast.id !== cast.id)
    return allRows.filter(r => r.cast.id !== cast.id && r.cast.cast_tier === peerTier)
  }, [allRows, cast.id, peerTier])

  // 同層平均
  const peerAvg = useMemo(() => {
    if (peers.length === 0) return null
    let sales = 0, achievement = 0, achievementCount = 0
    let avgSpend = 0, avgSpendCount = 0
    let honshimei = 0, conversion = 0, douhan = 0, after = 0
    let workDays = 0, workDaysCount = 0
    let perWorkday = 0, perWorkdayCount = 0
    let visitGroups = 0
    for (const r of peers) {
      sales += r.kpi.monthlySales
      if (r.targetSales > 0) {
        achievement += r.achievementRate
        achievementCount += 1
      }
      if (r.kpi.avgSpend > 0) { avgSpend += r.kpi.avgSpend; avgSpendCount += 1 }
      honshimei += r.kpi.honshimeiCount
      conversion += r.kpi.conversionCount
      douhan += r.kpi.douhanCount
      after += r.kpi.afterCount
      if (r.kpi.workDays > 0) {
        workDays += r.kpi.workDays
        workDaysCount += 1
        perWorkday += r.kpi.monthlySales / r.kpi.workDays
        perWorkdayCount += 1
      }
      visitGroups += r.kpi.visitGroups
    }
    const n = peers.length
    return {
      sales: sales / n,
      achievement: achievementCount > 0 ? achievement / achievementCount : 0,
      avgSpend: avgSpendCount > 0 ? avgSpend / avgSpendCount : 0,
      honshimei: honshimei / n,
      conversion: conversion / n,
      douhan: douhan / n,
      after: after / n,
      workDays: workDaysCount > 0 ? workDays / workDaysCount : 0,
      perWorkday: perWorkdayCount > 0 ? perWorkday / perWorkdayCount : 0,
      visitGroups: visitGroups / n,
    }
  }, [peers])

  const diagnoses: Diagnosis[] = useMemo(() => {
    if (!currentKPI || !peerAvg) return []
    const myAchievement = currentKPI.targetSales > 0
      ? Math.round((currentKPI.monthlySales / currentKPI.targetSales) * 100)
      : 0
    const myPerWorkday = currentKPI.workDays > 0 ? currentKPI.monthlySales / currentKPI.workDays : 0
    type Item = Omit<Diagnosis, 'severity' | 'message'>
    const items: Item[] = [
      {
        metric: '売上',
        emoji: '💰',
        myValue: currentKPI.monthlySales,
        peerAvg: peerAvg.sales,
        ratio: peerAvg.sales > 0 ? currentKPI.monthlySales / peerAvg.sales : 1,
        formattedMy: formatYen(currentKPI.monthlySales),
        formattedPeer: formatYen(Math.round(peerAvg.sales)),
        advice: '同伴・指名数を増やす、太客の連絡頻度を上げる、ボトル提案を強化',
      },
      {
        metric: '達成率',
        emoji: '🎯',
        myValue: myAchievement,
        peerAvg: peerAvg.achievement,
        ratio: peerAvg.achievement > 0 ? myAchievement / peerAvg.achievement : 1,
        formattedMy: `${myAchievement}%`,
        formattedPeer: `${Math.round(peerAvg.achievement)}%`,
        advice: '目標が高すぎないか管理者と相談、月初に営業計画を立てる',
      },
      {
        metric: '客単価',
        emoji: '💎',
        myValue: currentKPI.avgSpend,
        peerAvg: peerAvg.avgSpend,
        ratio: peerAvg.avgSpend > 0 ? currentKPI.avgSpend / peerAvg.avgSpend : 1,
        formattedMy: formatYen(currentKPI.avgSpend),
        formattedPeer: formatYen(Math.round(peerAvg.avgSpend)),
        advice: '高単価客への集中、ボトル・延長提案、シャンパンコール機会の創出',
      },
      {
        metric: '本指名数',
        emoji: '⭐',
        myValue: currentKPI.honshimeiCount,
        peerAvg: peerAvg.honshimei,
        ratio: peerAvg.honshimei > 0 ? currentKPI.honshimeiCount / peerAvg.honshimei : 1,
        formattedMy: `${currentKPI.honshimeiCount}人`,
        formattedPeer: `${peerAvg.honshimei.toFixed(1)}人`,
        advice: '場内→本指名の転換に集中、初回客のフォローアップを徹底',
      },
      {
        metric: '場内→本転換',
        emoji: '🔄',
        myValue: currentKPI.conversionCount,
        peerAvg: peerAvg.conversion,
        ratio: peerAvg.conversion > 0 ? currentKPI.conversionCount / peerAvg.conversion : 1,
        formattedMy: `${currentKPI.conversionCount}件`,
        formattedPeer: `${peerAvg.conversion.toFixed(1)}件`,
        advice: '場内客リストを定期確認、本指名移行を促すLINE文面を準備',
      },
      {
        metric: '同伴回数',
        emoji: '🍷',
        myValue: currentKPI.douhanCount,
        peerAvg: peerAvg.douhan,
        ratio: peerAvg.douhan > 0 ? currentKPI.douhanCount / peerAvg.douhan : 1,
        formattedMy: `${currentKPI.douhanCount}回`,
        formattedPeer: `${peerAvg.douhan.toFixed(1)}回`,
        advice: '同伴OK客のリストを管理、お店指定の食事提案を増やす',
      },
      {
        metric: '出勤日数',
        emoji: '📅',
        myValue: currentKPI.workDays,
        peerAvg: peerAvg.workDays,
        ratio: peerAvg.workDays > 0 ? currentKPI.workDays / peerAvg.workDays : 1,
        formattedMy: `${currentKPI.workDays}日`,
        formattedPeer: `${peerAvg.workDays.toFixed(1)}日`,
        advice: '出勤数を増やす or 出勤日の効率を上げる',
      },
      {
        metric: '出勤日あたり売上',
        emoji: '⚡',
        myValue: myPerWorkday,
        peerAvg: peerAvg.perWorkday,
        ratio: peerAvg.perWorkday > 0 ? myPerWorkday / peerAvg.perWorkday : 1,
        formattedMy: formatYen(Math.round(myPerWorkday)),
        formattedPeer: formatYen(Math.round(peerAvg.perWorkday)),
        advice: '当日確実に来てくれる客を仕込む、太客と被らない出勤日の選定',
      },
      {
        metric: '来店組数',
        emoji: '👥',
        myValue: currentKPI.visitGroups,
        peerAvg: peerAvg.visitGroups,
        ratio: peerAvg.visitGroups > 0 ? currentKPI.visitGroups / peerAvg.visitGroups : 1,
        formattedMy: `${currentKPI.visitGroups}組`,
        formattedPeer: `${peerAvg.visitGroups.toFixed(1)}組`,
        advice: '誘客の総量を増やす、休眠客の掘り起こし',
      },
    ]
    // 重要度判定（ratio < 0.7 で警告、< 0.5 で重大、>=1.2 で good）
    return items.map(it => {
      let severity: Diagnosis['severity'] = 'info'
      let message = ''
      if (it.ratio >= 1.2) {
        severity = 'good'
        message = `同層平均の +${Math.round((it.ratio - 1) * 100)}% — 強み`
      } else if (it.ratio < 0.5) {
        severity = 'critical'
        message = `同層平均の ${Math.round(it.ratio * 100)}% — 重点改善`
      } else if (it.ratio < 0.7) {
        severity = 'warning'
        message = `同層平均の ${Math.round(it.ratio * 100)}% — 改善余地`
      } else if (it.ratio < 0.95) {
        severity = 'info'
        message = `同層平均の ${Math.round(it.ratio * 100)}% — 平均近辺`
      } else {
        severity = 'good'
        message = `同層平均並み or 上回り`
      }
      return { ...it, severity, message }
    })
  }, [currentKPI, peerAvg])

  // 改善ポイント Top 3（弱い順）
  const top3Weak = useMemo(() =>
    [...diagnoses]
      .filter(d => d.severity === 'critical' || d.severity === 'warning')
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 3),
    [diagnoses])

  // 強み Top 3
  const top3Strong = useMemo(() =>
    [...diagnoses]
      .filter(d => d.severity === 'good' && d.ratio >= 1.2)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3),
    [diagnoses])

  if (!currentKPI) {
    return (
      <div style={{ padding: 30, textAlign: 'center', background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontSize: 12, color: C.pinkMuted }}>当月のKPIデータが取得できませんでした</div>
      </div>
    )
  }
  if (!peerAvg || peers.length === 0) {
    return (
      <div style={{ padding: 30, textAlign: 'center', background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
          比較対象が見つかりません
        </div>
        <div style={{ fontSize: 11, color: C.pinkMuted }}>
          {peerTier
            ? `同じ ${peerTier} のキャストが他にいないため、診断できません。`
            : '層が未設定のため、診断できません。設定タブで層を設定してください。'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ヘッダー */}
      <div style={{
        background: 'linear-gradient(135deg, #F0E8F8 0%, #E0D0F0 100%)',
        border: '1px solid #B89AD0',
        borderRadius: 12,
        padding: '14px 16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#5A3878', marginBottom: 4 }}>
          🎓 個人改善診断 — {currentMonth}
        </div>
        <div style={{ fontSize: 11, color: '#7A5898' }}>
          {peerTier ? `同層（${peerTier}）` : '全キャスト'} {peers.length}名 の平均と比較し、改善ポイントと強みを抽出
        </div>
      </div>

      {/* 弱み Top 3 */}
      <div style={{
        background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#C53030', marginBottom: 10 }}>
          🔻 改善ポイント Top 3（弱い順）
        </div>
        {top3Weak.length === 0 ? (
          <div style={{ fontSize: 11, color: C.pinkMuted, padding: 12, textAlign: 'center' }}>
            🎉 同層平均を大きく下回る項目はありません！
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {top3Weak.map((d, i) => (
              <DiagnosisCard key={d.metric} item={d} rank={i + 1} isPC={isPC} />
            ))}
          </div>
        )}
      </div>

      {/* 強み Top 3 */}
      <div style={{
        background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F6E56', marginBottom: 10 }}>
          ⭐ 強み Top 3
        </div>
        {top3Strong.length === 0 ? (
          <div style={{ fontSize: 11, color: C.pinkMuted, padding: 12, textAlign: 'center' }}>
            まだ平均を大きく上回る項目はありません。次月への伸びしろあり。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {top3Strong.map((d, i) => (
              <DiagnosisCard key={d.metric} item={d} rank={i + 1} isPC={isPC} />
            ))}
          </div>
        )}
      </div>

      {/* 全項目テーブル */}
      <div style={{
        background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
        overflowX: 'auto',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
          全項目の比較
        </div>
        <table style={{ width: '100%', minWidth: isPC ? 'auto' : 540, borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.tagBg2, color: '#5A2840' }}>
              <th style={{ padding: '6px 8px', fontSize: 10, textAlign: 'left' }}>項目</th>
              <th style={{ padding: '6px 8px', fontSize: 10, textAlign: 'right' }}>あなた</th>
              <th style={{ padding: '6px 8px', fontSize: 10, textAlign: 'right' }}>同層平均</th>
              <th style={{ padding: '6px 8px', fontSize: 10, textAlign: 'right' }}>比率</th>
              <th style={{ padding: '6px 8px', fontSize: 10, textAlign: 'left' }}>判定</th>
            </tr>
          </thead>
          <tbody>
            {diagnoses.map(d => {
              const sevColor = d.severity === 'critical' ? '#C53030'
                : d.severity === 'warning' ? '#B8860B'
                : d.severity === 'good' ? '#0F6E56'
                : C.dark
              return (
                <tr key={d.metric} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: C.dark }}>
                    {d.emoji} {d.metric}
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: C.dark, textAlign: 'right', fontWeight: 600 }}>
                    {d.formattedMy}
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: C.pinkMuted, textAlign: 'right' }}>
                    {d.formattedPeer}
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: sevColor, textAlign: 'right', fontWeight: 700 }}>
                    {Math.round(d.ratio * 100)}%
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: 10, color: sevColor }}>
                    {d.message}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 8, fontStyle: 'italic' }}>
          ※ 比率 = (あなたの値) ÷ (同層平均値)。100% が同層平均と同じ。70%未満で改善余地、120%以上で強み判定。
        </div>
      </div>
    </div>
  )
}

function DiagnosisCard({ item, rank, isPC }: { item: Diagnosis; rank: number; isPC: boolean }) {
  const colors = {
    critical: { bg: '#FCEBEB', fg: '#C53030', border: '#F5A5A5' },
    warning:  { bg: '#FFF4E0', fg: '#B8860B', border: '#F5C97B' },
    info:     { bg: C.miniBg, fg: C.dark,    border: C.border },
    good:     { bg: '#E1F5EE', fg: '#0F6E56', border: '#A0D9BC' },
  }[item.severity]
  return (
    <div style={{
      padding: '10px 12px',
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: isPC ? 14 : 13, fontWeight: 700, color: colors.fg }}>
          {rank}. {item.emoji} {item.metric}
        </span>
        <span style={{ fontSize: 11, color: colors.fg, fontWeight: 600, marginLeft: 'auto' }}>
          {item.message}
        </span>
      </div>
      <div style={{ fontSize: 11, color: colors.fg, marginBottom: 6 }}>
        あなた <strong>{item.formattedMy}</strong> / 同層平均 {item.formattedPeer}
      </div>
      <div style={{ fontSize: 10, color: colors.fg, fontStyle: 'italic', opacity: 0.85 }}>
        💡 {item.advice}
      </div>
    </div>
  )
}
