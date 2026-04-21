'use client'

import { useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Palette (matches home/detail pages) ───────────────────────────────
import { CLogin as C } from '@/lib/colors'

export default function LoginPage() {
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handlePasswordLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (err) {
      setError('メールアドレスまたはパスワードが違います')
      setSubmitting(false)
      return
    }
    // Full reload so proxy.ts picks up the fresh session and redirects.
    window.location.href = '/'
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(
      `${email} にログイン用リンクを送りました。メールを開いてリンクをタップしてください。`
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${C.bg} 0%, ${C.dark} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: `linear-gradient(180deg, ${C.panel} 0%, ${C.dark} 100%)`,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: '40px 32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              fontFamily: '"Playfair Display", "Didot", serif',
              fontSize: 42,
              fontWeight: 400,
              letterSpacing: '0.08em',
              background: `linear-gradient(135deg, ${C.pinkLight} 0%, ${C.pink} 50%, ${C.pinkMuted} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Éclat
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              letterSpacing: '0.3em',
              color: C.pinkMuted,
            }}
          >
            SALES SUPPORT
          </div>
          <div
            style={{
              marginTop: 20,
              height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${C.border} 50%, transparent 100%)`,
            }}
          />
        </div>

        {/* Mode switch */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: C.dark,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            marginBottom: 24,
          }}
        >
          {(['password', 'magic'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError(null)
                setMessage(null)
              }}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 8,
                background:
                  mode === m
                    ? `linear-gradient(135deg, ${C.pink} 0%, ${C.pinkMuted} 100%)`
                    : 'transparent',
                color: mode === m ? C.dark : C.textMuted,
                fontSize: 12,
                letterSpacing: '0.15em',
                fontWeight: mode === m ? 700 : 500,
                transition: 'all 0.15s',
              }}
            >
              {m === 'password' ? 'パスワード' : 'メールリンク'}
            </button>
          ))}
        </div>

        <form
          onSubmit={mode === 'password' ? handlePasswordLogin : handleMagicLink}
        >
          <label
            style={{
              display: 'block',
              fontSize: 11,
              letterSpacing: '0.2em',
              color: C.pinkMuted,
              marginBottom: 8,
            }}
          >
            EMAIL
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />

          {mode === 'password' && (
            <>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  letterSpacing: '0.2em',
                  color: C.pinkMuted,
                  marginTop: 20,
                  marginBottom: 8,
                }}
              >
                PASSWORD
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
              />
            </>
          )}

          {error && (
            <div
              style={{
                marginTop: 16,
                padding: '10px 12px',
                background: 'rgba(184, 90, 72, 0.1)',
                border: `1px solid ${C.danger}`,
                borderRadius: 8,
                color: C.danger,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 14px',
                background: 'rgba(201, 169, 97, 0.08)',
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.pinkLight,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              marginTop: 28,
              padding: '14px',
              border: 'none',
              cursor: submitting ? 'wait' : 'pointer',
              borderRadius: 10,
              background: submitting
                ? C.pinkMuted
                : `linear-gradient(135deg, ${C.pinkLight} 0%, ${C.pink} 50%, ${C.pinkMuted} 100%)`,
              color: C.dark,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.25em',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting
              ? '送信中…'
              : mode === 'password'
              ? 'ログイン'
              : 'ログインリンクを送信'}
          </button>
        </form>

        <div
          style={{
            marginTop: 24,
            fontSize: 11,
            color: C.textMuted,
            textAlign: 'center',
            lineHeight: 1.7,
          }}
        >
          管理者またはキャストのみ利用できます
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  background: C.dark,
  color: C.text,
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
