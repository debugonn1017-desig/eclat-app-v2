'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'

import BottomNav from '@/components/BottomNav'
import PageNav from '@/components/PageNav'
import { useCasts } from '@/hooks/useCasts'
import { CAST_TIERS, CastTier, Announcement, StaffMember, StaffPermission, STAFF_PERMISSIONS } from '@/types'
import { createClient } from '@/lib/supabase/client'

type Cast = {
  id: string
  role: 'admin' | 'cast'
  cast_name: string | null
  display_name: string | null
  cast_tier: CastTier | null
  is_active: boolean
  created_at: string
}

export default function AdminCastsPage() {
  const router = useRouter()
  const { isPC, toggle: toggleView } = useViewMode()

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

  const { updateCastTier } = useCasts()
  const supabaseClient = createClient()

  // ─── 顧客引継ぎ ───
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferFrom, setTransferFrom] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [transferCustomers, setTransferCustomers] = useState<{id: string; customer_name: string; selected: boolean}[]>([])
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferSubmitting, setTransferSubmitting] = useState(false)

  // ─── タブ管理 ───
  const [activeTab, setActiveTab] = useState<'casts' | 'staff'>('casts')

  // ─── スタッフ管理 ───
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffLoaded, setStaffLoaded] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffDisplayName, setStaffDisplayName] = useState('')
  const [staffFormError, setStaffFormError] = useState<string | null>(null)
  const [staffSubmitting, setStaffSubmitting] = useState(false)

  // ─── 権限管理 ───
  const [myPermissions, setMyPermissions] = useState<Record<string, boolean>>({})

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/staff')
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) setStaffList(data as StaffMember[])
      setStaffLoaded(true)
    } catch {
      setStaffLoaded(true)
    }
  }, [])

  // 管理ページ全体の入口ガード用フラグ。
  //   - null: /api/auth/me を取得中（読み込み中UIを表示）
  //   - true: いずれかの管理権限あり、入場OK
  //   - false: 管理権限ゼロ → ホームへリダイレクト
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null)

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (!res.ok) {
        // 401 = 未ログイン → ホームへ
        setAccessAllowed(false)
        return
      }
      const data = await res.json()
      const owner = data.is_owner === true
      const perms: Record<string, boolean> = data.permissions ?? {}
      setIsOwner(owner)
      if (data.permissions) setMyPermissions(perms)

      // いずれかの管理権限を持っていれば入場を許可する。
      //   ・owner は常に許可
      //   ・それ以外は permissions の中にひとつでも true があれば許可
      const anyPermission = owner || Object.values(perms).some(v => v === true)
      setAccessAllowed(anyPermission)
    } catch {
      setAccessAllowed(false)
    }
  }, [])

  useEffect(() => { fetchMe() }, [fetchMe])

  // 管理権限ゼロのユーザーはホームへリダイレクト（少しディレイを入れて
  // 「権限がありません」表示を見せてから飛ばす）。
  useEffect(() => {
    if (accessAllowed === false) {
      const t = setTimeout(() => router.push('/'), 1200)
      return () => clearTimeout(t)
    }
  }, [accessAllowed, router])

  /** Owner has all permissions; staff checks myPermissions */
  const hasPerm = useCallback((perm: string) => {
    if (isOwner) return true
    return myPermissions[perm] === true
  }, [isOwner, myPermissions])

  useEffect(() => {
    if (activeTab === 'staff' && isOwner) fetchStaff()
  }, [activeTab, isOwner, fetchStaff])

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    setStaffFormError(null)
    if (!staffEmail.trim() || !staffPassword || !staffDisplayName.trim()) {
      setStaffFormError('全項目を入力してください')
      return
    }
    if (staffPassword.length < 8) {
      setStaffFormError('パスワードは8文字以上にしてください')
      return
    }
    setStaffSubmitting(true)
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: staffEmail.trim(),
          password: staffPassword,
          display_name: staffDisplayName.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStaffFormError(data?.error || '登録に失敗しました')
        return
      }
      setStaffEmail('')
      setStaffPassword('')
      setStaffDisplayName('')
      setShowStaffForm(false)
      await fetchStaff()
    } catch {
      setStaffFormError('登録に失敗しました')
    } finally {
      setStaffSubmitting(false)
    }
  }

  const handleTogglePermission = async (staffId: string, permission: StaffPermission, currentEnabled: boolean) => {
    // Optimistic update
    setStaffList(prev => prev.map(s => {
      if (s.id !== staffId) return s
      return { ...s, permissions: { ...s.permissions, [permission]: !currentEnabled } }
    }))
    try {
      const res = await fetch(`/api/admin/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission, enabled: !currentEnabled }),
      })
      if (!res.ok) {
        // Revert
        setStaffList(prev => prev.map(s => {
          if (s.id !== staffId) return s
          return { ...s, permissions: { ...s.permissions, [permission]: currentEnabled } }
        }))
      }
    } catch {
      // Revert
      setStaffList(prev => prev.map(s => {
        if (s.id !== staffId) return s
        return { ...s, permissions: { ...s.permissions, [permission]: currentEnabled } }
      }))
    }
  }

  const handleToggleStaffActive = async (staffId: string, currentActive: boolean) => {
    const label = staffList.find(s => s.id === staffId)?.display_name || 'このスタッフ'
    const msg = currentActive
      ? `${label} を無効にしますか？ログインできなくなります。`
      : `${label} を有効にしますか？`
    if (!window.confirm(msg)) return

    try {
      const res = await fetch(`/api/admin/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      })
      if (res.ok) await fetchStaff()
    } catch { /* ignore */ }
  }

  // ─── お知らせ管理 ───
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [showAnnouncements, setShowAnnouncements] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({
    title: '', body: '', priority: 'normal' as 'important' | 'normal',
    target_type: 'all' as 'all' | 'individual', target_cast_ids: [] as string[],
  })
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null)
  const [announcementSaving, setAnnouncementSaving] = useState(false)

  const fetchAnnouncements = useCallback(async () => {
    const { data } = await supabaseClient
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setAnnouncements(data as Announcement[])
  }, [supabaseClient])

  useEffect(() => {
    if (showAnnouncements) fetchAnnouncements()
  }, [showAnnouncements, fetchAnnouncements])

  const handleSaveAnnouncement = async () => {
    if (!announcementForm.title.trim()) {
      alert('タイトルを入力してください')
      return
    }
    setAnnouncementSaving(true)

    const payload = {
      title: announcementForm.title,
      body: announcementForm.body,
      priority: announcementForm.priority,
      target_type: announcementForm.target_type,
      target_cast_ids: announcementForm.target_type === 'individual'
        ? announcementForm.target_cast_ids : [],
      target_cast_id: null,
    }

    if (editingAnnouncementId) {
      await supabaseClient.from('announcements').update(payload).eq('id', editingAnnouncementId)
    } else {
      await supabaseClient.from('announcements').insert(payload)
    }

    setAnnouncementForm({ title: '', body: '', priority: 'normal', target_type: 'all', target_cast_ids: [] })
    setEditingAnnouncementId(null)
    setAnnouncementSaving(false)
    fetchAnnouncements()
  }

  const handleToggleAnnouncement = async (id: string, currentActive: boolean) => {
    await supabaseClient.from('announcements').update({ is_active: !currentActive }).eq('id', id)
    fetchAnnouncements()
  }

  const handleDeleteAnnouncement = async (id: string) => {
    if (!window.confirm('このお知らせを削除しますか？')) return
    await supabaseClient.from('announcements').delete().eq('id', id)
    fetchAnnouncements()
  }

  const handleEditAnnouncement = (a: Announcement) => {
    setEditingAnnouncementId(a.id)
    setAnnouncementForm({
      title: a.title, body: a.body, priority: a.priority,
      target_type: a.target_type,
      target_cast_ids: a.target_cast_ids?.length ? a.target_cast_ids : (a.target_cast_id ? [a.target_cast_id] : []),
    })
  }

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
        // 403 = キャスト管理権限なし。ページ全体を蹴るのではなく、
        // 該当セクションを非表示にして他の管理機能は使えるようにする。
        if (res.status === 401) {
          // 未ログインのときのみホームへ
          setTimeout(() => router.push('/'), 1200)
        }
        setLoadError(null)
        setIsLoaded(true)
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

  // キャスト管理権限を持っている時だけ、キャスト一覧を取りに行く。
  // その他の権限（売上入力 / シフト管理 / お知らせ管理 など）しか
  // 持たないスタッフでも、管理ページ自体には入れるようにする。
  useEffect(() => {
    if (hasPerm('キャスト管理')) {
      fetchCasts()
    } else {
      setIsLoaded(true)
    }
  }, [fetchCasts, hasPerm])

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

  const handleTierChange = async (cast: Cast, newTier: string) => {
    const tierValue = newTier === '' ? null : newTier
    try {
      const res = await fetch(`/api/admin/casts/${cast.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cast_tier: tierValue }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data?.error || '層の更新に失敗しました')
        return
      }
      setCasts((prev) => prev.map((c) => (c.id === cast.id ? (data as Cast) : c)))
    } catch (err) {
      console.error('handleTierChange error:', err)
      alert('層の更新に失敗しました')
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

  // ─── 入口ガード: いずれかの管理権限を持っていない場合は弾く ───
  if (accessAllowed === null) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: C.pinkMuted }}>読み込み中…</div>
      </div>
    )
  }
  if (accessAllowed === false) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: C.dark, fontWeight: 600, margin: '0 0 8px 0', letterSpacing: '0.1em' }}>
            管理ページへのアクセス権限がありません
          </p>
          <p style={{ fontSize: '10px', color: C.pinkMuted, margin: 0, letterSpacing: '0.1em' }}>
            ホームに戻ります…
          </p>
        </div>
      </div>
    )
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
            maxWidth: isPC ? '900px' : '420px',
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

          <button
            onClick={toggleView}
            style={{
              background: isPC
                ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                : C.white,
              border: `1px solid ${C.pink}`,
              color: isPC ? C.white : C.pink,
              fontSize: '9px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              padding: '5px 8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            {isPC ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
                </svg>
                MOBILE
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                PC
              </>
            )}
          </button>
        </div>
        {/* ページナビ */}
        <div style={{ maxWidth: '420px', margin: '0 auto', padding: '0 20px 12px' }}>
          <PageNav />
        </div>

        {/* タブ切り替え */}
        {isOwner && (
          <div style={{ maxWidth: '420px', margin: '0 auto', padding: '0 20px 8px', display: 'flex', gap: '0' }}>
            {(['casts', 'staff'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '10px',
                  fontSize: '11px',
                  letterSpacing: '0.2em',
                  fontWeight: activeTab === tab ? 600 : 400,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  border: `1px solid ${activeTab === tab ? C.pink : C.border}`,
                  borderBottom: activeTab === tab ? `2px solid ${C.pink}` : `1px solid ${C.border}`,
                  background: activeTab === tab ? 'rgba(232,135,155,0.06)' : 'transparent',
                  color: activeTab === tab ? C.pink : C.pinkMuted,
                }}
              >
                {tab === 'casts' ? 'キャスト管理' : 'スタッフ管理'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── スタッフ管理タブ ─── */}
      {activeTab === 'staff' && isOwner && (
        <div style={{ maxWidth: '420px', margin: '0 auto', padding: '20px 16px' }}>
          {/* スタッフ追加ボタン */}
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ height: '1px', width: '32px', background: `linear-gradient(90deg, ${C.pink}, transparent)` }} />
              <p style={{ fontSize: '9px', letterSpacing: '0.35em', color: C.pink, margin: 0 }}>
                STAFF &mdash; {staffList.filter(s => !s.is_owner).length}
              </p>
            </div>
            <button
              onClick={() => { setShowStaffForm(v => !v); setStaffFormError(null) }}
              style={{
                background: showStaffForm ? 'transparent' : `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                color: showStaffForm ? C.pink : C.dark,
                fontSize: '10px', fontWeight: 600, letterSpacing: '0.2em',
                padding: '8px 14px', border: `1px solid ${C.pink}`,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {showStaffForm ? 'キャンセル' : '+ スタッフ追加'}
            </button>
          </div>

          {/* 新規スタッフフォーム */}
          {showStaffForm && (
            <form onSubmit={handleCreateStaff} style={{
              background: C.white, border: `1px solid ${C.border}`,
              padding: '18px', marginBottom: '20px',
              boxShadow: '0 2px 12px rgba(232,135,155,0.05)',
            }}>
              <p style={{ fontSize: '10px', letterSpacing: '0.25em', color: C.pink, margin: '0 0 14px 0' }}>
                NEW STAFF
              </p>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>EMAIL</label>
                <input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)}
                  style={inputStyle} placeholder="staff@example.com" required />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>PASSWORD (8文字以上)</label>
                <input type="text" value={staffPassword} onChange={e => setStaffPassword(e.target.value)}
                  style={inputStyle} placeholder="初期パスワード" required minLength={8} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>表示名</label>
                <input type="text" value={staffDisplayName} onChange={e => setStaffDisplayName(e.target.value)}
                  style={inputStyle} placeholder="例：田中太郎" required />
              </div>
              {staffFormError && (
                <p style={{ fontSize: '11px', color: C.danger, margin: '0 0 12px 0',
                  padding: '8px 10px', background: 'rgba(196,64,64,0.08)', border: `1px solid ${C.danger}` }}>
                  {staffFormError}
                </p>
              )}
              <button type="submit" disabled={staffSubmitting} style={{
                width: '100%',
                background: staffSubmitting ? C.pinkMuted : `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                color: C.dark, fontSize: '11px', fontWeight: 600, letterSpacing: '0.25em',
                padding: '12px', border: `1px solid ${C.pink}`,
                cursor: staffSubmitting ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}>
                {staffSubmitting ? '登録中…' : '登録する'}
              </button>
            </form>
          )}

          {/* スタッフ一覧 */}
          {!staffLoaded ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', letterSpacing: '0.3em', color: C.pinkMuted, margin: 0 }}>LOADING...</p>
            </div>
          ) : staffList.filter(s => !s.is_owner).length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', letterSpacing: '0.3em', color: C.pinkMuted, margin: 0 }}>NO STAFF REGISTERED</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {staffList.filter(s => !s.is_owner).map(staff => (
                <div key={staff.id} style={{
                  background: staff.is_active ? C.white : C.tagBg,
                  border: `1px solid ${C.border}`,
                  boxShadow: '0 2px 12px rgba(232,135,155,0.05)',
                  opacity: staff.is_active ? 1 : 0.72,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '2px',
                    background: staff.is_active
                      ? `linear-gradient(90deg, ${C.pink}, ${C.pinkLight}, ${C.pink})`
                      : C.border,
                  }} />
                  <div style={{ padding: '16px 18px' }}>
                    {/* ヘッダー */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '0.05em', color: C.dark, margin: 0 }}>
                          {staff.display_name}
                        </p>
                        <p style={{ fontSize: '10px', color: C.pinkMuted, margin: '2px 0 0 0' }}>
                          {staff.email}
                        </p>
                      </div>
                      <div style={{
                        fontSize: '9px', letterSpacing: '0.2em', padding: '3px 10px',
                        color: staff.is_active ? C.pink : C.pinkMuted,
                        border: `1px solid ${staff.is_active ? C.pink : C.border}`,
                        background: staff.is_active ? 'rgba(232,135,155,0.08)' : C.tagBg,
                      }}>
                        {staff.is_active ? 'ACTIVE' : '無効'}
                      </div>
                    </div>

                    {/* 権限トグル */}
                    {staff.is_active && (
                      <div style={{ marginTop: '14px' }}>
                        <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pink, margin: '0 0 8px 0' }}>
                          PERMISSIONS
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {STAFF_PERMISSIONS.map(perm => {
                            const enabled = staff.permissions[perm] ?? false
                            return (
                              <div key={perm} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '8px 12px', background: enabled ? 'rgba(232,135,155,0.04)' : C.tagBg,
                                border: `1px solid ${enabled ? 'rgba(232,135,155,0.2)' : C.border}`,
                              }}>
                                <span style={{ fontSize: '12px', color: C.dark }}>{perm}</span>
                                <button
                                  onClick={() => handleTogglePermission(staff.id, perm, enabled)}
                                  style={{
                                    width: '40px', height: '22px', borderRadius: '11px',
                                    background: enabled ? C.pink : '#D0C8CC',
                                    border: 'none', cursor: 'pointer', position: 'relative', padding: 0,
                                  }}
                                >
                                  <span style={{
                                    position: 'absolute', top: '2px',
                                    left: enabled ? '20px' : '2px',
                                    width: '18px', height: '18px', borderRadius: '50%',
                                    background: '#FFF', transition: 'left 0.2s',
                                  }} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* アクション */}
                    <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleToggleStaffActive(staff.id, staff.is_active)}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${staff.is_active ? C.danger : C.pink}`,
                          color: staff.is_active ? C.danger : C.pink,
                          fontSize: '10px', letterSpacing: '0.2em', padding: '6px 14px',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {staff.is_active ? '無効にする' : '有効にする'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── キャスト管理タブ ─── */}
      {activeTab === 'casts' && (<>
      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '20px 16px' }}>
        {/* ─── 日次売上入力 & シフト管理 ─── */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {hasPerm('売上入力') && (
            <button
              onClick={() => router.push('/admin/daily-sales')}
              style={{
                flex: 1,
                background: `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                color: C.dark,
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.15em',
                padding: '14px',
                border: `1px solid ${C.pink}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              日次売上入力
            </button>
          )}
          {hasPerm('シフト管理') && (
            <button
              onClick={() => router.push('/admin/shifts')}
              style={{
                flex: 1,
                background: 'transparent',
                color: C.pink,
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.15em',
                padding: '14px',
                border: `1px solid ${C.pink}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              シフト一括管理
            </button>
          )}
        </div>
        {hasPerm('レポート閲覧') && (
          <button
            onClick={() => router.push('/admin/performance')}
            style={{
              width: '100%',
              background: 'transparent',
              color: C.pink,
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.15em',
              padding: '14px',
              border: `1px solid ${C.pink}`,
              cursor: 'pointer',
              fontFamily: 'inherit',
              marginBottom: '20px',
            }}
          >
            📊 キャスト成績一覧
          </button>
        )}

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

        {/* ─── お知らせ管理セクション ─── */}
        {hasPerm('お知らせ管理') && <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => setShowAnnouncements(v => !v)}
            style={{
              background: showAnnouncements
                ? `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`
                : 'transparent',
              border: `1px solid ${showAnnouncements ? C.pink : C.border}`,
              color: showAnnouncements ? '#FFF' : C.pinkMuted,
              fontSize: '10px',
              fontWeight: showAnnouncements ? 600 : 400,
              letterSpacing: '0.15em',
              padding: '8px 14px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
            }}
          >
            {showAnnouncements ? '閉じる' : 'お知らせ管理'}
          </button>

          {showAnnouncements && (
            <div style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              borderTop: 'none',
              padding: '16px',
            }}>
              {/* 作成/編集フォーム */}
              <p style={{
                fontSize: '9px', letterSpacing: '0.25em',
                color: C.pink, margin: '0 0 10px 0',
              }}>
                {editingAnnouncementId ? 'お知らせを編集' : '新しいお知らせを作成'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  value={announcementForm.title}
                  onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                  placeholder="タイトル"
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: '13px',
                    border: `1px solid ${C.border}`, background: C.white,
                    color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
                <textarea
                  value={announcementForm.body}
                  onChange={e => setAnnouncementForm({ ...announcementForm, body: e.target.value })}
                  placeholder="本文（任意）"
                  rows={2}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: '13px',
                    border: `1px solid ${C.border}`, background: C.white,
                    color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />

                {/* 重要度 */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['normal', 'important'] as const).map(p => (
                    <button key={p} type="button"
                      onClick={() => setAnnouncementForm({ ...announcementForm, priority: p })}
                      style={{
                        flex: 1, padding: '8px', fontSize: '11px', fontFamily: 'inherit',
                        background: announcementForm.priority === p
                          ? (p === 'important' ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})` : C.pink)
                          : 'transparent',
                        color: announcementForm.priority === p ? '#FFF' : C.pinkMuted,
                        border: `1px solid ${announcementForm.priority === p ? C.pink : C.border}`,
                        cursor: 'pointer',
                      }}
                    >
                      {p === 'important' ? '重要' : '通常'}
                    </button>
                  ))}
                </div>

                {/* 対象 */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['all', 'individual'] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setAnnouncementForm({ ...announcementForm, target_type: t })}
                      style={{
                        flex: 1, padding: '8px', fontSize: '11px', fontFamily: 'inherit',
                        background: announcementForm.target_type === t ? C.pink : 'transparent',
                        color: announcementForm.target_type === t ? '#FFF' : C.pinkMuted,
                        border: `1px solid ${announcementForm.target_type === t ? C.pink : C.border}`,
                        cursor: 'pointer',
                      }}
                    >
                      {t === 'all' ? '全体' : '個人'}
                    </button>
                  ))}
                </div>

                {/* 個人の場合キャスト複数選択 */}
                {announcementForm.target_type === 'individual' && (
                  <div style={{
                    border: `1px solid ${C.border}`, padding: '8px 10px',
                    display: 'flex', flexWrap: 'wrap', gap: '6px',
                  }}>
                    {casts.filter(c => c.is_active).map(c => {
                      const selected = announcementForm.target_cast_ids.includes(c.id)
                      return (
                        <button key={c.id} type="button"
                          onClick={() => {
                            setAnnouncementForm(prev => ({
                              ...prev,
                              target_cast_ids: selected
                                ? prev.target_cast_ids.filter(id => id !== c.id)
                                : [...prev.target_cast_ids, c.id],
                            }))
                          }}
                          style={{
                            padding: '6px 12px', fontSize: '11px', fontFamily: 'inherit',
                            background: selected ? C.pink : 'transparent',
                            color: selected ? '#FFF' : C.pinkMuted,
                            border: `1px solid ${selected ? C.pink : C.border}`,
                            cursor: 'pointer', fontWeight: selected ? 600 : 400,
                          }}
                        >
                          {selected ? '✓ ' : ''}{c.cast_name || c.display_name}
                        </button>
                      )
                    })}
                    {announcementForm.target_cast_ids.length === 0 && (
                      <span style={{ fontSize: '11px', color: C.pinkMuted }}>キャストを選択してください</span>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={handleSaveAnnouncement}
                    disabled={announcementSaving}
                    style={{
                      flex: 1, padding: '10px',
                      background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                      color: '#FFF', border: 'none', fontSize: '11px',
                      letterSpacing: '0.15em', cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 600, opacity: announcementSaving ? 0.6 : 1,
                    }}
                  >
                    {announcementSaving ? '保存中...' : editingAnnouncementId ? '更新' : '作成'}
                  </button>
                  {editingAnnouncementId && (
                    <button
                      onClick={() => {
                        setEditingAnnouncementId(null)
                        setAnnouncementForm({ title: '', body: '', priority: 'normal', target_type: 'all', target_cast_ids: [] })
                      }}
                      style={{
                        padding: '10px 16px', background: 'transparent',
                        border: `1px solid ${C.border}`, color: C.pinkMuted,
                        fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      キャンセル
                    </button>
                  )}
                </div>
              </div>

              {/* お知らせ一覧 */}
              <p style={{
                fontSize: '9px', letterSpacing: '0.25em',
                color: C.pink, margin: '12px 0 8px 0',
              }}>
                お知らせ一覧
              </p>
              {announcements.length === 0 ? (
                <p style={{ fontSize: '11px', color: C.pinkMuted, textAlign: 'center', padding: '16px 0', margin: 0 }}>
                  まだお知らせがありません
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {announcements.map(a => {
                    const targetIds = a.target_cast_ids?.length ? a.target_cast_ids : (a.target_cast_id ? [a.target_cast_id] : [])
                    const targetNames = targetIds
                      .map(id => casts.find(c => c.id === id)?.cast_name)
                      .filter(Boolean)
                      .join(', ')
                    return (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 12px',
                        background: a.is_active ? '#FFF5F7' : C.white,
                        border: `1px solid ${C.border}`,
                      }}>
                        {/* トグル */}
                        <button
                          onClick={() => handleToggleAnnouncement(a.id, a.is_active)}
                          style={{
                            width: '36px', height: '20px', borderRadius: '10px',
                            background: a.is_active ? C.pink : '#D0C8CC',
                            border: 'none', cursor: 'pointer', position: 'relative',
                            flexShrink: 0, padding: 0,
                          }}
                        >
                          <span style={{
                            position: 'absolute',
                            top: '2px',
                            left: a.is_active ? '18px' : '2px',
                            width: '16px', height: '16px',
                            borderRadius: '50%', background: '#FFF',
                            transition: 'left 0.2s',
                          }} />
                        </button>
                        {/* 内容 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '12px', fontWeight: 500,
                            color: a.is_active ? C.dark : C.pinkMuted,
                            textDecoration: a.is_active ? 'none' : 'line-through',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{a.title}</div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '2px', fontSize: '9px' }}>
                            {a.priority === 'important' && (
                              <span style={{ background: C.pink, color: '#FFF', padding: '1px 4px', borderRadius: '2px' }}>重要</span>
                            )}
                            <span style={{ color: C.pinkMuted }}>
                              {a.target_type === 'all' ? '全体' : `個人: ${targetNames || '?'}`}
                            </span>
                            <span style={{ color: C.pinkMuted }}>
                              {a.created_at?.slice(0, 10)}
                            </span>
                          </div>
                        </div>
                        {/* アクション */}
                        <button
                          onClick={() => handleEditAnnouncement(a)}
                          style={{ fontSize: '10px', color: C.pink, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >編集</button>
                        <button
                          onClick={() => handleDeleteAnnouncement(a.id)}
                          style={{ fontSize: '10px', color: '#D45060', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >削除</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>}

        {/* ─── キャスト一覧セクション（cast_manage 権限のみ） ─── */}
        {hasPerm('キャスト管理') && (<>
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {cast.is_active && (
                        <select
                          value={cast.cast_tier ?? ''}
                          onChange={(e) => handleTierChange(cast, e.target.value)}
                          style={{
                            fontSize: '10px',
                            letterSpacing: '0.1em',
                            padding: '3px 6px',
                            color: C.dark,
                            border: `1px solid ${C.border}`,
                            background: C.white,
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="">未設定</option>
                          {CAST_TIERS.map((tier) => (
                            <option key={tier} value={tier}>{tier}</option>
                          ))}
                        </select>
                      )}
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
        </>)}
      </div>

      {/* ─── 顧客引継ぎセクション ─── */}
      {hasPerm('顧客引継ぎ') && <div style={{
        maxWidth: '420px', margin: '0 auto',
        padding: '0 16px', marginBottom: '20px',
      }}>
        <button
          onClick={() => setShowTransfer(!showTransfer)}
          style={{
            width: '100%', padding: '12px',
            background: showTransfer ? C.pink : C.white,
            color: showTransfer ? C.white : C.dark,
            border: `1px solid ${C.pink}`,
            fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {showTransfer ? '閉じる' : '顧客引継ぎ'}
        </button>

        {showTransfer && (
          <div style={{
            background: C.white, border: `1px solid ${C.border}`,
            borderTop: 'none', padding: '16px',
          }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: '12px' }}>
              担当顧客を別キャストに一括移管
            </div>

            {/* 引継ぎ元 */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', color: C.dark, marginBottom: '4px' }}>引継ぎ元キャスト</div>
              <select
                value={transferFrom}
                onChange={async (e) => {
                  const castName = e.target.value
                  setTransferFrom(castName)
                  setTransferCustomers([])
                  if (!castName) return
                  setTransferLoading(true)
                  const { data } = await supabaseClient
                    .from('customers')
                    .select('id, customer_name')
                    .eq('cast_name', castName)
                    .order('customer_name')
                  if (data) {
                    setTransferCustomers(data.map(c => ({
                      id: String(c.id), customer_name: c.customer_name, selected: true,
                    })))
                  }
                  setTransferLoading(false)
                }}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: '12px',
                  border: `1px solid ${C.border}`, background: C.white,
                  color: C.dark, fontFamily: 'inherit',
                }}
              >
                <option value="">選択してください</option>
                {casts.filter(c => c.role === 'cast').map(c => (
                  <option key={c.id} value={c.display_name || c.cast_name || ''}>
                    {c.display_name || c.cast_name}
                  </option>
                ))}
              </select>
            </div>

            {/* 引継ぎ先 */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', color: C.dark, marginBottom: '4px' }}>引継ぎ先キャスト</div>
              <select
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: '12px',
                  border: `1px solid ${C.border}`, background: C.white,
                  color: C.dark, fontFamily: 'inherit',
                }}
              >
                <option value="">選択してください</option>
                {casts.filter(c => c.role === 'cast' && (c.display_name || c.cast_name) !== transferFrom).map(c => (
                  <option key={c.id} value={c.display_name || c.cast_name || ''}>
                    {c.display_name || c.cast_name}
                  </option>
                ))}
              </select>
            </div>

            {/* 顧客リスト */}
            {transferLoading && (
              <div style={{ fontSize: '10px', color: C.pinkMuted, padding: '10px 0' }}>読み込み中...</div>
            )}
            {transferCustomers.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '6px',
                }}>
                  <span style={{ fontSize: '10px', color: C.dark }}>
                    対象顧客（{transferCustomers.filter(c => c.selected).length}/{transferCustomers.length}人）
                  </span>
                  <button
                    onClick={() => {
                      const allSelected = transferCustomers.every(c => c.selected)
                      setTransferCustomers(prev => prev.map(c => ({ ...c, selected: !allSelected })))
                    }}
                    style={{
                      fontSize: '9px', color: C.pink, background: 'transparent',
                      border: `1px solid ${C.pink}`, padding: '2px 8px',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {transferCustomers.every(c => c.selected) ? '全解除' : '全選択'}
                  </button>
                </div>
                <div style={{
                  maxHeight: '200px', overflowY: 'auto',
                  border: `1px solid ${C.border}`, borderRadius: '4px',
                }}>
                  {transferCustomers.map((c) => (
                    <label key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', cursor: 'pointer',
                      borderBottom: `1px solid ${C.border}`,
                      background: c.selected ? 'rgba(232,135,155,0.04)' : 'transparent',
                    }}>
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => {
                          setTransferCustomers(prev => prev.map(x =>
                            x.id === c.id ? { ...x, selected: !x.selected } : x
                          ))
                        }}
                        style={{ accentColor: C.pink }}
                      />
                      <span style={{ fontSize: '12px', color: C.dark }}>{c.customer_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 実行ボタン */}
            <button
              disabled={transferSubmitting || !transferFrom || !transferTo || transferCustomers.filter(c => c.selected).length === 0}
              onClick={async () => {
                const selectedIds = transferCustomers.filter(c => c.selected).map(c => c.id)
                if (!window.confirm(`${selectedIds.length}人の顧客を「${transferFrom}」→「${transferTo}」に引き継ぎますか？`)) return
                setTransferSubmitting(true)
                let successCount = 0
                for (const id of selectedIds) {
                  const { error } = await supabaseClient
                    .from('customers')
                    .update({ cast_name: transferTo })
                    .eq('id', Number(id))
                  if (!error) successCount++
                }
                alert(`${successCount}人の顧客を引き継ぎました`)
                setTransferCustomers([])
                setTransferFrom('')
                setTransferTo('')
                setTransferSubmitting(false)
              }}
              style={{
                width: '100%', padding: '12px',
                background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                color: C.white, border: 'none',
                fontSize: '12px', fontWeight: 600, letterSpacing: '0.15em',
                cursor: 'pointer', fontFamily: 'inherit',
                opacity: (!transferFrom || !transferTo || transferCustomers.filter(c => c.selected).length === 0) ? 0.4 : 1,
              }}
            >
              {transferSubmitting ? '引継ぎ中...' : `${transferCustomers.filter(c => c.selected).length}人を引き継ぐ`}
            </button>
          </div>
        )}
      </div>}
      </>)}

      <BottomNav />

      <style>{`
        input:focus, select:focus {
          border-color: ${C.pink} !important;
          box-shadow: 0 0 0 2px rgba(232,135,155,0.18);
        }
      `}</style>
    </div>
  )
}
