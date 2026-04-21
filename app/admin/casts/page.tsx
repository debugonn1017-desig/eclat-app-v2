'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'

type Cast = {
  id: string
  role: 'admin' | 'cast'
  cast_name: string | null
  display_name: string | null
  is_active: boolean
  created_at: string
}

export default function AdminCastsPage() {
  const router = useRouter()

  const [casts, setCasts] = useState<Cast[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [castName, setCastName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // credential edit state
  const [editCredId, setEditCredId] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [credSubmitting, setCredSubmitting] = useState(false)
  const [credMsg, setCredMsg] = useState<string | null>(null)
  const [credError, setCredError] = useState<string | null>(null)

  // admin own password
  const [showAdminPw, setShowAdminPw] = useState(false)
  const [adminNewPw, setAdminNewPw] = useState('')
  const [adminPwSubmitting, setAdminPwSubmitting] = useState(false)
  const [adminPwMsg, setAdminPwMsg] = useState<string | null>(null)
  const [adminPwError, setAdminPwError] = useState<string | null>(null)

  const fetchCasts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/casts')
      const data = await res.json()
      if (!res.ok) {
        setLoadError(data?.error || '読み込みに失敗しました')
        setIsLoaded(true)
        // 403 → not admin, send home
        if (res.status === 403 || res.status === 401) {
          setTimeout(() => router.push('/'), 1200)
        }
        return
      }
      setCasts(Array.isArray(data) ? data : [])
      setIsLoaded(true)
    } catch (err) {
      console.error('fetchCasts error:', err)
      setLoadError('読み込みに失敗しました')
      setIsLoaded(true)
    }
  }, [router])

  useEffect(() => {
    fetchCasts()
  }, [fetchCasts])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!email.trim() || !password || !castName.trim()) {
      setFormError('メール・パスワード・キャスト名は必須です')
      return
    }
    if (password.length < 8) {
      setFormError('パスワードは8文字以上にしてください')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/casts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          cast_name: castName.trim(),
          display_name: displayName.trim() || castName.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data?.error || '登録に失敗しました')
        return
      }
      // reset + refresh
      setEmail('')
      setPassword('')
      setCastName('')
      setDisplayName('')
      setShowForm(false)
      await fetchCasts()
    } catch (err) {
      console.error('create cast error:', err)
      setFormError('登録に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (cast: Cast) => {
    const next = !cast.is_active
    const label = cast.display_name || cast.cast_name || 'このキャスト'
    const msg = next
      ? `${label} を復帰させて、ログインできるようにしますか？`
      : `${label} を退店扱いにします。ログインできなくなります。よろしいですか？`
    if (!window.confirm(msg)) return

    try {
      const res = await fetch(`/api/admin/casts/${cast.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data?.error || '更新に失敗しました')
        return
      }
      setCasts((prev) => prev.map((c) => (c.id === cast.id ? (data as Cast) : c)))
    } catch (err) {
      console.error('toggleActive error:', err)
      alert('更新に失敗しました')
    }
  }

  const handleUpdateCredentials = async (castId: string) => {
    setCredError(null)
    setCredMsg(null)
    if (!newEmail.trim() && !newPassword) {
      setCredError('メールアドレスまたはパスワードを入力してください')
      return
    }
    if (newPassword && newPassword.length < 8) {
      setCredError('パスワードは8文字以上にしてください')
      return
    }
    if (newEmail && !newEmail.includes('@')) {
      setCredError('正しいメールアドレスを入力してください')
      return
    }
    setCredSubmitting(true)
    try {
      const body: Record<string, string> = { target_user_id: castId }
      if (newEmail.trim()) body.new_email = newEmail.trim()
      if (newPassword) body.new_password = newPassword
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setCredError(data?.error || '変更に失敗しました')
        return
      }
      setCredMsg(data?.message || '変更しました')
      setNewEmail('')
      setNewPassword('')
      setTimeout(() => { setEditCredId(null); setCredMsg(null) }, 1500)
    } catch {
      setCredError('変更に失敗しました')
    } finally {
      setCredSubmitting(false)
    }
  }

  const handleAdminPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminPwError(null)
    setAdminPwMsg(null)
    if (!adminNewPw || adminNewPw.length < 8) {
      setAdminPwError('パスワードは8文字以上で入力してください')
      return
    }
    setAdminPwSubmitting(true)
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: adminNewPw }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAdminPwError(data?.error || '変更に失敗しました')
        return
      }
      setAdminPwMsg('パスワードを変更しました')
      setAdminNewPw('')
      setTimeout(() => { setShowAdminPw(false); setAdminPwMsg(null) }, 1500)
    } catch {
      setAdminPwError('変更に失敗しました')
    } finally {
      setAdminPwSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.white,
    border: `1px solid ${C.border}`,
    padding: '12px 14px',
    fontSize: '13px',
    color: C.dark,
    letterSpacing: '0.05em',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '9px',
    letterSpacing: '0.25em',
    color: C.pinkMuted,
    marginBottom: '6px',
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '60px' }}>
      {/* ─── ヘッダー ─── */}
      <div
        style={{
          background: C.headerBg,
          borderBottom: `1px solid ${C.border}`,
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: '420px',
            margin: '0 auto',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: C.pinkMuted,
              fontSize: '9px',
              letterSpacing: '0.2em',
              padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            BACK
          </button>

          <div style={{ textAlign: 'center' }}>
            <Image
              src="/logo.png"
              alt="Éclat"
              width={100}
              height={30}
              priority
              className="object-contain"
              style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
            <p
              style={{
                fontSize: '7px',
                letterSpacing: '0.35em',
                color: C.pinkMuted,
                margin: '2px 0 0 0',
              }}
            >
              CAST MANAGEMENT
            </p>
          </div>

          <div style={{ width: '48px' }} />
        </div>
      </div>

      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '20px 16px' }}>
        {/* ─── 管理者パスワード変更 ─── */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => { setShowAdminPw((v) => !v); setAdminPwError(null); setAdminPwMsg(null) }}
            style={{
              background: 'transparent',
              border: `1px solid ${C.border}`,
              color: C.pinkMuted,
              fontSize: '10px',
              letterSpacing: '0.15em',
              padding: '8px 14px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
            }}
          >
            {showAdminPw ? 'キャンセル' : '管理者パスワードを変更'}
          </button>
          {showAdminPw && (
            <form
              onSubmit={handleAdminPasswordChange}
              style={{
                background: C.white,
                border: `1px solid ${C.border}`,
                borderTop: 'none',
                padding: '14px',
              }}
            >
              <label style={labelStyle}>新しいパスワード（8文字以上）</label>
              <input
                type="text"
                value={adminNewPw}
                onChange={(e) => setAdminNewPw(e.target.value)}
                style={inputStyle}
                placeholder="新しいパスワード"
                autoComplete="new-password"
              />
              {adminPwError && (
                <p style={{ fontSize: '11px', color: C.danger, margin: '8px 0 0 0' }}>{adminPwError}</p>
              )}
              {adminPwMsg && (
                <p style={{ fontSize: '11px', color: C.pink, margin: '8px 0 0 0' }}>{adminPwMsg}</p>
              )}
              <button
                type="submit"
                disabled={adminPwSubmitting}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  background: `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                  color: C.dark,
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.2em',
                  padding: '10px',
                  border: `1px solid ${C.pink}`,
                  cursor: adminPwSubmitting ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: adminPwSubmitting ? 0.6 : 1,
                }}
              >
                {adminPwSubmitting ? '変更中…' : '変更する'}
              </button>
            </form>
          )}
        </div>

        {/* ─── セクションタイトル + 追加ボタン ─── */}
        <div
          style={{
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ height: '1px', width: '32px', background: `linear-gradient(90deg, ${C.pink}, transparent)` }} />
            <p style={{ fontSize: '9px', letterSpacing: '0.35em', color: C.pink, margin: 0 }}>
              CASTS &mdash; {casts.length}
            </p>
          </div>
          <button
            onClick={() => {
              setShowForm((v) => !v)
              setFormError(null)
            }}
            style={{
              background: showForm
                ? 'transparent'
                : `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
              color: showForm ? C.pink : C.dark,
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.2em',
              padding: '8px 14px',
              border: `1px solid ${C.pink}`,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {showForm ? 'キャンセル' : '+ 新規追加'}
          </button>
        </div>

        {/* ─── 新規追加フォーム ─── */}
        {showForm && (
          <form
            onSubmit={handleCreate}
            style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              padding: '18px',
              marginBottom: '20px',
              boxShadow: '0 2px 12px rgba(232,135,155,0.05)',
            }}
          >
            <p
              style={{
                fontSize: '10px',
                letterSpacing: '0.25em',
                color: C.pink,
                margin: '0 0 14px 0',
              }}
            >
              NEW CAST
            </p>

            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                style={inputStyle}
                placeholder="cast@example.com"
                required
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>PASSWORD (8文字以上)</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
                placeholder="初期パスワード"
                required
                minLength={8}
              />
              <p style={{ fontSize: '10px', color: C.pinkMuted, margin: '4px 0 0 0' }}>
                本人に伝えてログインしてもらってください
              </p>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>CAST 名（源氏名・必須）</label>
              <input
                type="text"
                value={castName}
                onChange={(e) => setCastName(e.target.value)}
                style={inputStyle}
                placeholder="例：みゆ"
                required
              />
              <p style={{ fontSize: '10px', color: C.pinkMuted, margin: '4px 0 0 0' }}>
                顧客の担当キャスト名と一致させてください
              </p>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>表示名（任意）</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={inputStyle}
                placeholder="空欄ならキャスト名と同じ"
              />
            </div>

            {formError && (
              <p
                style={{
                  fontSize: '11px',
                  color: C.danger,
                  margin: '0 0 12px 0',
                  padding: '8px 10px',
                  background: 'rgba(196,64,64,0.08)',
                  border: `1px solid ${C.danger}`,
                }}
              >
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                background: submitting
                  ? C.pinkMuted
                  : `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                color: C.dark,
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.25em',
                padding: '12px',
                border: `1px solid ${C.pink}`,
                cursor: submitting ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {submitting ? '登録中…' : '登録する'}
            </button>
          </form>
        )}

        {/* ─── エラー ─── */}
        {loadError && (
          <div
            style={{
              padding: '14px',
              background: 'rgba(196,64,64,0.08)',
              border: `1px solid ${C.danger}`,
              marginBottom: '16px',
            }}
          >
            <p style={{ fontSize: '11px', color: C.danger, margin: 0 }}>{loadError}</p>
          </div>
        )}

        {/* ─── 一覧 ─── */}
        {!isLoaded ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', letterSpacing: '0.3em', color: C.pinkMuted, margin: 0 }}>
              LOADING...
            </p>
          </div>
        ) : casts.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', letterSpacing: '0.3em', color: C.pinkMuted, margin: 0 }}>
              NO CASTS REGISTERED
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {casts.map((cast) => (
              <div
                key={cast.id}
                style={{
                  background: cast.is_active ? C.white : C.tagBg,
                  border: `1px solid ${C.border}`,
                  boxShadow: '0 2px 12px rgba(232,135,155,0.05)',
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: cast.is_active ? 1 : 0.72,
                }}
              >
                <div
                  style={{
                    height: '2px',
                    background: cast.is_active
                      ? `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})`
                      : C.border,
                  }}
                />
                <div style={{ padding: '16px 18px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: '17px',
                          fontWeight: 400,
                          letterSpacing: '0.05em',
                          color: C.dark,
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cast.cast_name || '(名前未設定)'}
                      </p>
                      {cast.display_name && cast.display_name !== cast.cast_name && (
                        <p
                          style={{
                            fontSize: '10px',
                            color: C.pinkMuted,
                            fontStyle: 'italic',
                            letterSpacing: '0.1em',
                            margin: '2px 0 0 0',
                          }}
                        >
                          &ldquo;{cast.display_name}&rdquo;
                        </p>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '9px',
                        letterSpacing: '0.2em',
                        padding: '3px 10px',
                        minWidth: '48px',
                        textAlign: 'center',
                        flexShrink: 0,
                        color: cast.is_active ? C.pink : C.pinkMuted,
                        border: `1px solid ${cast.is_active ? C.pink : C.border}`,
                        background: cast.is_active ? 'rgba(232,135,155,0.08)' : C.tagBg,
                      }}
                    >
                      {cast.is_active ? 'ACTIVE' : '退店'}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: '14px',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '8px',
                    }}
                  >
                    <button
                      onClick={() => {
                        setEditCredId(editCredId === cast.id ? null : cast.id)
                        setNewEmail('')
                        setNewPassword('')
                        setCredError(null)
                        setCredMsg(null)
                      }}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${C.border}`,
                        color: C.pinkMuted,
                        fontSize: '10px',
                        letterSpacing: '0.15em',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {editCredId === cast.id ? '閉じる' : '認証情報'}
                    </button>
                    <button
                      onClick={() => toggleActive(cast)}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${cast.is_active ? C.danger : C.pink}`,
                        color: cast.is_active ? C.danger : C.pink,
                        fontSize: '10px',
                        letterSpacing: '0.2em',
                        padding: '6px 14px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {cast.is_active ? '退店にする' : '復帰させる'}
                    </button>
                  </div>

                  {/* ── 認証情報編集 ── */}
                  {editCredId === cast.id && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: C.tagBg,
                      border: `1px solid ${C.border}`,
                    }}>
                      <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pink, margin: '0 0 10px 0' }}>
                        メールアドレス・パスワード変更
                      </p>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={labelStyle}>新しいメールアドレス（変更しない場合は空欄）</label>
                        <input
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          style={inputStyle}
                          placeholder="新しいメールアドレス"
                        />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={labelStyle}>新しいパスワード（変更しない場合は空欄）</label>
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          style={inputStyle}
                          placeholder="新しいパスワード（8文字以上）"
                        />
                      </div>
                      {credError && (
                        <p style={{ fontSize: '11px', color: C.danger, margin: '0 0 8px 0' }}>{credError}</p>
                      )}
                      {credMsg && (
                        <p style={{ fontSize: '11px', color: C.pink, margin: '0 0 8px 0' }}>{credMsg}</p>
                      )}
                      <button
                        onClick={() => handleUpdateCredentials(cast.id)}
                        disabled={credSubmitting}
                        style={{
                          width: '100%',
                          background: `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                          color: C.dark,
                          fontSize: '11px',
                          fontWeight: 600,
                          letterSpacing: '0.2em',
                          padding: '10px',
                          border: `1px solid ${C.pink}`,
                          cursor: credSubmitting ? 'wait' : 'pointer',
                          fontFamily: 'inherit',
                          opacity: credSubmitting ? 0.6 : 1,
                        }}
                      >
                        {credSubmitting ? '変更中…' : '変更する'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        input:focus {
          border-color: ${C.pink} !important;
          box-shadow: 0 0 0 2px rgba(232,135,155,0.18);
        }
      `}</style>
    </div>
  )
}
