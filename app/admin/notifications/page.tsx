'use client'

// 📢 管理者プッシュ通知 送信ページ
//   /admin/notifications
//   - 全体 / キャスト全員 / スタッフ全員 / 層別 / 個人指定 で送信
//   - タイトル + 本文 + 遷移先URL を入力
//   - 送信履歴も一覧表示

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewMode } from '@/hooks/useViewMode'
import { C } from '@/lib/colors'
import { CAST_TIERS, CastTier } from '@/types'
import BottomNav from '@/components/BottomNav'

type TargetType = 'all' | 'cast_all' | 'staff_all' | 'tier' | 'individual'

type ProfileMini = {
  id: string
  cast_name: string | null
  display_name: string | null
  role: 'admin' | 'cast'
  cast_tier: CastTier | null
}

type HistoryRow = {
  id: string
  title: string
  body: string
  url: string | null
  target_type: string
  target_tier: string | null
  delivered_count: number
  failed_count: number
  sent_at: string
  is_auto: boolean
}

export default function AdminNotificationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', fontSize: 12 }}>読み込み中...</div>}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const { isPC } = useViewMode()
  const supabase = useMemo(() => createClient(), [])

  // 認証ガード（オーナー or 「通知.送信」権限保持スタッフのみ）
  // ⚠ 旧: role==='admin' だけ見てたので、通知.送信 を持たないスタッフでもページが見えた
  //       （送信ボタン押すと API 側で 403 で弾かれるが、UI 上は見えてた）
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const me = await res.json()
        if (me.role !== 'admin') { setAuthorized(false); return }
        setAuthorized(me.is_owner === true || me.permissions?.['通知.送信'] === true)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])
  useEffect(() => {
    if (authorized === false) {
      const t = setTimeout(() => router.push('/'), 1500)
      return () => clearTimeout(t)
    }
  }, [authorized, router])

  // フォーム状態
  const [targetType, setTargetType] = useState<TargetType>('cast_all')
  const [targetTier, setTargetTier] = useState<CastTier>('A層')
  const [targetUserIds, setTargetUserIds] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [url, setUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)

  // 全プロフィール（個人指定 UI 用）
  const [profiles, setProfiles] = useState<ProfileMini[]>([])
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, cast_name, display_name, role, cast_tier, is_active')
        .eq('is_active', true)
      const list = ((data ?? []) as Array<ProfileMini & { is_active: boolean }>).filter(p => p.is_active)
      setProfiles(list)
    }
    if (authorized) load()
  }, [supabase, authorized])

  // 送信履歴
  const [history, setHistory] = useState<HistoryRow[]>([])
  const loadHistory = async () => {
    const { data } = await supabase
      .from('push_notifications')
      .select('id, title, body, url, target_type, target_tier, delivered_count, failed_count, sent_at, is_auto')
      .order('sent_at', { ascending: false })
      .limit(50)
    setHistory((data ?? []) as HistoryRow[])
  }
  useEffect(() => {
    if (authorized) loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized])

  const send = async () => {
    if (sending) return
    if (!title.trim() || !bodyText.trim()) {
      setResultMsg('タイトルと本文を入力してください')
      return
    }
    if (targetType === 'individual' && targetUserIds.length === 0) {
      setResultMsg('個人指定は1名以上選択してください')
      return
    }
    setSending(true)
    setResultMsg(null)
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: bodyText.trim(),
          url: url.trim() || undefined,
          target_type: targetType,
          target_tier: targetType === 'tier' ? targetTier : undefined,
          target_user_ids: targetType === 'individual' ? targetUserIds : undefined,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setResultMsg(`✅ 送信完了：${json.delivered}件配信、${json.failed}件失敗（対象 ${json.recipients}名）`)
        setTitle('')
        setBodyText('')
        setUrl('')
        await loadHistory()
      } else {
        setResultMsg(`❌ 送信失敗：${json.error ?? '不明なエラー'}`)
      }
    } catch (e) {
      setResultMsg(`❌ 送信失敗：${(e as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  // 認証中／権限なし
  if (authorized === null) return <div style={{ padding: 40, textAlign: 'center', fontSize: 12 }}>読み込み中...</div>
  if (!authorized) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontSize: 13 }}>
        <p style={{ color: '#5A2840', fontWeight: 600, marginBottom: 8 }}>このページには「通知.送信」の権限が必要です</p>
        <p style={{ color: '#888', fontSize: 11 }}>ホームへ戻ります...</p>
      </div>
    )
  }

  const targetCount = (() => {
    if (targetType === 'all') return profiles.length
    if (targetType === 'cast_all') return profiles.filter(p => p.role === 'cast').length
    if (targetType === 'staff_all') return profiles.filter(p => p.role === 'admin').length
    if (targetType === 'tier') return profiles.filter(p => p.role === 'cast' && p.cast_tier === targetTier).length
    if (targetType === 'individual') return targetUserIds.length
    return 0
  })()

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      // モバイル時は BottomNav 60px + iPhone のホームインジケーター分も確保
      paddingBottom: !isPC ? 'calc(60px + env(safe-area-inset-bottom, 0px))' : 0,
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: isPC ? '12px 20px' : '10px 12px',
        borderBottom: `1px solid ${C.border}`, background: C.headerBg,
      }}>
        <button onClick={() => router.push('/admin/casts')} style={{
          background: 'transparent', border: 'none', color: C.pink,
          fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
        }}>← 管理</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
          📢 通知送信
        </span>
        <span style={{ fontSize: 10, color: C.pinkMuted, marginLeft: 'auto' }}>
          全体・層別・個人へカスタム送信
        </span>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: isPC ? '16px 20px' : '12px 12px' }}>
        {/* ── 送信フォーム ── */}
        <div style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '16px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 12 }}>
            新規通知を送信
          </div>

          {/* 送信先 */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: C.pinkMuted, fontWeight: 600 }}>送信先</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {([
                { k: 'all',       label: '🌐 全員' },
                { k: 'cast_all',  label: '👑 キャスト全員' },
                { k: 'staff_all', label: '🧑‍💼 スタッフ全員' },
                { k: 'tier',      label: '🎭 層別' },
                { k: 'individual', label: '👤 個人指定' },
              ] as Array<{k: TargetType; label: string}>).map(opt => (
                <button
                  key={opt.k}
                  onClick={() => setTargetType(opt.k)}
                  style={{
                    fontSize: 11, padding: '6px 14px',
                    borderRadius: 18,
                    border: `1px solid ${targetType === opt.k ? C.pink : C.border}`,
                    background: targetType === opt.k ? '#FBEAF0' : '#FFF',
                    color: targetType === opt.k ? '#72243E' : C.pinkMuted,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{opt.label}</button>
              ))}
            </div>

            {targetType === 'tier' && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {CAST_TIERS.map(t => (
                  <button
                    key={t}
                    onClick={() => setTargetTier(t)}
                    style={{
                      fontSize: 10, padding: '4px 10px', borderRadius: 14,
                      border: `1px solid ${targetTier === t ? C.pink : C.border}`,
                      background: targetTier === t ? '#FBEAF0' : '#FFF',
                      color: targetTier === t ? '#72243E' : C.pinkMuted,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{t}</button>
                ))}
              </div>
            )}

            {targetType === 'individual' && (
              <div style={{
                marginTop: 8, padding: 10,
                background: '#F9F6F7', borderRadius: 8,
                maxHeight: 200, overflowY: 'auto',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {profiles.map(p => {
                    const checked = targetUserIds.includes(p.id)
                    const name = p.cast_name || p.display_name || '(無名)'
                    return (
                      <label key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 8px', borderRadius: 6,
                        background: checked ? '#FBEAF0' : 'transparent',
                        cursor: 'pointer', fontSize: 11,
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setTargetUserIds(checked
                              ? targetUserIds.filter(id => id !== p.id)
                              : [...targetUserIds, p.id])
                          }}
                          style={{ accentColor: C.pink }}
                        />
                        <span style={{ flex: 1 }}>{name}</span>
                        <span style={{ fontSize: 9, color: C.pinkMuted }}>
                          {p.role === 'admin' ? 'スタッフ' : (p.cast_tier ?? 'キャスト')}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 6 }}>
              対象: <strong style={{ color: C.dark }}>{targetCount}名</strong>
              {targetCount === 0 && <span style={{ color: '#C53030', marginLeft: 6 }}>※ 0名のため送信できません</span>}
            </div>
          </div>

          {/* タイトル */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: C.pinkMuted, fontWeight: 600 }}>
              タイトル <span style={{ color: '#C53030' }}>*</span>
              <span style={{ marginLeft: 8, fontWeight: 400 }}>{title.length} / 30 推奨</span>
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例：明日の出勤について / 月初挨拶"
              style={{
                width: '100%', padding: '8px 10px', marginTop: 4,
                border: `1px solid ${C.border}`, borderRadius: 6,
                fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 本文 */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: C.pinkMuted, fontWeight: 600 }}>
              本文 <span style={{ color: '#C53030' }}>*</span>
              <span style={{ marginLeft: 8, fontWeight: 400 }}>{bodyText.length} / 120 推奨</span>
            </label>
            <textarea
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              placeholder="例：本日もお疲れ様です！明日のシフト確認をお願いします。"
              rows={4}
              style={{
                width: '100%', padding: '8px 10px', marginTop: 4,
                border: `1px solid ${C.border}`, borderRadius: 6,
                fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          {/* URL */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: C.pinkMuted, fontWeight: 600 }}>
              遷移先URL（オプション）
            </label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="例：/admin/casts または /casts/abc123"
              style={{
                width: '100%', padding: '8px 10px', marginTop: 4,
                border: `1px solid ${C.border}`, borderRadius: 6,
                fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 4 }}>
              通知をタップした時に開くページ。空欄ならホームへ。
            </div>
          </div>

          {/* プレビュー */}
          {(title || bodyText) && (
            <div style={{
              padding: 10, marginBottom: 12,
              background: '#F9F6F7', border: `1px dashed ${C.border}`, borderRadius: 8,
            }}>
              <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 4 }}>📱 プレビュー</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>
                {title || '(タイトル未入力)'}
              </div>
              <div style={{ fontSize: 11, color: C.dark, marginTop: 2 }}>
                {bodyText || '(本文未入力)'}
              </div>
            </div>
          )}

          {/* 送信ボタン */}
          {(() => {
            // 送信不可の理由を計算（複数該当なら最初の1つだけ表示）
            let blockReason: string | null = null
            if (sending) blockReason = '送信中'
            else if (!title.trim()) blockReason = 'タイトルを入力してください'
            else if (!bodyText.trim()) blockReason = '本文を入力してください'
            else if (targetCount === 0) blockReason = '対象が0名です（送信先を見直してください）'
            const canSend = blockReason === null

            return (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={send}
                  disabled={!canSend}
                  style={{
                    padding: '12px 28px', borderRadius: 24,
                    background: canSend ? C.pink : '#DDD',
                    color: '#FFF', fontWeight: 600, fontSize: 14,
                    border: 'none', fontFamily: 'inherit',
                    cursor: canSend ? 'pointer' : 'not-allowed',
                    minWidth: 180,
                  }}
                >
                  {sending ? '送信中...' : `📤 ${targetCount}名に送信`}
                </button>
                {!canSend && blockReason && !sending && (
                  <span style={{ fontSize: 11, color: '#C53030', fontWeight: 500 }}>
                    ⚠ {blockReason}
                  </span>
                )}
                {resultMsg && (
                  <span style={{ fontSize: 11, color: resultMsg.startsWith('✅') ? '#0F6E56' : '#C53030' }}>
                    {resultMsg}
                  </span>
                )}
              </div>
            )
          })()}
        </div>

        {/* ── 送信履歴 ── */}
        <div style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 10 }}>
            📜 送信履歴（直近50件）
          </div>
          {history.length === 0 ? (
            <div style={{ fontSize: 11, color: C.pinkMuted, padding: 12, textAlign: 'center' }}>
              まだ送信履歴がありません
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map(h => (
                <div key={h.id} style={{
                  padding: 10, background: '#F9F6F7', borderRadius: 8,
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{h.title}</span>
                    <span style={{ fontSize: 9, color: C.pinkMuted, marginLeft: 'auto' }}>
                      {new Date(h.sent_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: C.dark, marginBottom: 4 }}>{h.body}</div>
                  <div style={{ display: 'flex', gap: 6, fontSize: 9, color: C.pinkMuted, flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 6px', background: '#FBEAF0', color: '#72243E', borderRadius: 4 }}>
                      {targetTypeLabel(h.target_type, h.target_tier)}
                    </span>
                    {h.is_auto && <span style={{ padding: '2px 6px', background: '#E1F5EE', color: '#0F6E56', borderRadius: 4 }}>自動</span>}
                    <span>配信 {h.delivered_count}件</span>
                    {h.failed_count > 0 && <span style={{ color: '#C53030' }}>失敗 {h.failed_count}件</span>}
                    {h.url && <span>→ {h.url}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isPC && <BottomNav />}
    </div>
  )
}

function targetTypeLabel(type: string, tier: string | null): string {
  switch (type) {
    case 'all': return '🌐 全員'
    case 'cast_all': return '👑 キャスト全員'
    case 'staff_all': return '🧑‍💼 スタッフ全員'
    case 'tier': return `🎭 ${tier ?? '層別'}`
    case 'individual': return '👤 個人指定'
    case 'auto': return '🤖 自動送信'
    default: return type
  }
}
