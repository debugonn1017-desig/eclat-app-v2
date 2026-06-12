'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'

import BottomNav from '@/components/BottomNav'
import PageHeader from '@/components/PageHeader'
import ViewModeToggle from '@/components/ViewModeToggle'
import WeekdayPatternCard from '@/components/WeekdayPatternCard'
import { useCasts } from '@/hooks/useCasts'
import { CAST_TIERS, CastTier, Announcement, StaffMember, StaffPermission, PERMISSION_GROUPS, SENSITIVE_PERMISSIONS } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { invalidateCache, invalidateCacheByPrefix } from '@/lib/cache'
// v0.3.41: ローカル関数 fetchMe との名前衝突を避けるため fetchCachedMe にリネーム import
import { fetchMe as fetchCachedMe } from '@/lib/authCache'
// v0.3.49-D: alert 12箇所を非ブロッキングのトーストに置換 (success/warning/error)
import { useToast } from '@/hooks/useToast'

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
  useScrollTopOnMount()
  const { isPC } = useViewMode()

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
  // v0.3.49-D: トーストは useToast に1本化 (v0.3.38 の引継ぎ専用 transferToast を統合)。
  //   confirm() (実行確認) は破壊的操作のため残す。エラー詳細は console.error にも継続出力。
  const { toast, ToastView } = useToast()

  // ─── タブ管理 ───
  const [activeTab, setActiveTab] = useState<'casts' | 'staff'>('casts')

  // ─── スタッフ管理 ───
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffLoaded, setStaffLoaded] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  // v0.3.28: お客様担当リスト等の「オーナー・管理者のみ」UI 判定用
  const [myRole, setMyRole] = useState<string>('')
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
      // v0.3.41: fetchCachedMe (lib/authCache) で sessionStorage キャッシュ + session 検証
      const data = await fetchCachedMe()
      if (!data) {
        // 401 = 未ログイン → ホームへ
        setAccessAllowed(false)
        return
      }
      const owner = data.is_owner === true
      const perms: Record<string, boolean> = data.permissions ?? {}
      setIsOwner(owner)
      setMyRole(data.role ?? '')
      if (data.permissions) setMyPermissions(perms)

      // いずれかの「管理ページに対応UIがある権限」を持っていれば入場を許可する。
      //   ・owner は常に許可
      //   ・「顧客編集」は管理ページ内に対応UIが無い（顧客詳細での編集権限）ため、
      //     入場権限のチェックからは除外する。これがあるだけのスタッフを
      //     管理ページに入れても見るものが無く混乱するので。
      const adminPagePerms = [
        '売上.入力', '売上.閲覧',
        'シフト.管理', 'シフト.閲覧',
        'お知らせ.管理', 'お知らせ.閲覧', 'お知らせ.投稿',
        'レポート.閲覧', 'レポート.出力',
        'キャスト.アカウント管理', 'キャスト.閲覧',
        '顧客.引継ぎ',
        // v0.3.36: v6 権限を入場対象に追加（顧客.編集 は管理ハブ内に対応UIが無いので除外維持）
        'KPI.閲覧', 'KPI.詳細分析',
        '顧客.全店分析',
        'レポート.全店ビュー',
        '通知.送信', '通知.自動配信設定',
        'ランク基準.設定', 'ノルマ.設定',
      ]
      const anyAdminPagePerm = adminPagePerms.some(p => perms[p] === true)
      setAccessAllowed(owner || anyAdminPagePerm)
    } catch {
      setAccessAllowed(false)
    }
  }, [])

  useEffect(() => { fetchMe() }, [fetchMe])

  // 管理権限ゼロのユーザーはホームへリダイレクト（少しディレイを入れて
  // 「権限がありません」表示を見せてから飛ばす）。
  useEffect(() => {
    if (accessAllowed === false) {
      const t = setTimeout(() => router.push('/home'), 1200)
      return () => clearTimeout(t)
    }
  }, [accessAllowed, router])

  /** Owner has all permissions; staff checks myPermissions
   *  上位権限の包含も考慮する。例: 'お知らせ.閲覧' は 'お知らせ.管理' があれば true
   *  ⚠ lib/auth.ts の PERMISSION_PARENTS と必ず一致させること（旧: KPI/レポート系が抜けてた）
   *  v0.3.35: 顧客.全店分析 / レポート.全店ビュー の v6 包含を追加
   */
  const PERM_PARENTS: Record<string, string[]> = {
    '顧客.閲覧': ['顧客.編集', '顧客.全店分析'],
    'キャスト.閲覧': ['キャスト.アカウント管理'],
    'KPI.閲覧': ['KPI.詳細分析'],
    'シフト.閲覧': ['シフト.管理'],
    '売上.閲覧': ['売上.入力'],
    'お知らせ.閲覧': ['お知らせ.投稿', 'お知らせ.管理'],
    'お知らせ.投稿': ['お知らせ.管理'],
    'レポート.閲覧': ['レポート.出力', 'レポート.全店ビュー'],
  }
  const hasPerm = useCallback((perm: string) => {
    if (isOwner) return true
    if (myPermissions[perm] === true) return true
    const parents = PERM_PARENTS[perm] ?? []
    return parents.some(p => myPermissions[p] === true)
    // PERM_PARENTS は固定なので useCallback の依存に含めなくてよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // ⚠ 影響範囲が大きい権限を ON にしようとしたときは確認を入れる
    //   （OFF にする時は確認なし、即時取り消しは安全方向）
    if (!currentEnabled && SENSITIVE_PERMISSIONS.includes(permission)) {
      const ok = window.confirm(
        `「${permission}」は影響範囲が大きい権限です。\n\n` +
        `本当にこのスタッフに付与しますか？`
      )
      if (!ok) return
    }
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
        // ⚠ 旧: 失敗してもユーザーに何も表示せず revert だけ → 操作者が成功と誤認していた
        const errBody = await res.json().catch(() => null) as { error?: string } | null
        const msg = errBody?.error || `「${permission}」の権限変更に失敗しました（HTTP ${res.status}）`
        toast(msg, 'error')
        // Revert
        setStaffList(prev => prev.map(s => {
          if (s.id !== staffId) return s
          return { ...s, permissions: { ...s.permissions, [permission]: currentEnabled } }
        }))
      }
    } catch (err) {
      console.error('handleTogglePermission error:', err)
      toast(`「${permission}」の権限変更に失敗しました（通信エラー）`, 'error')
      // Revert
      setStaffList(prev => prev.map(s => {
        if (s.id !== staffId) return s
        return { ...s, permissions: { ...s.permissions, [permission]: currentEnabled } }
      }))
    }
  }

  // ロールプリセットは v5 で廃止。個別 ON/OFF のみ。

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
      if (res.ok) {
        await fetchStaff()
        // v0.3.49-D: 成功フィードバック追加 (旧: 無音)
        toast(currentActive ? `${label} を無効にしました` : `${label} を有効にしました`, 'success')
      } else {
        // ⚠ 旧: 失敗時に何も表示せずスルー → 操作者が成功したと誤認していた
        const errBody = await res.json().catch(() => null) as { error?: string } | null
        toast(errBody?.error || `スタッフの有効/無効切替に失敗しました（HTTP ${res.status}）`, 'error')
      }
    } catch (err) {
      console.error('handleToggleStaffActive error:', err)
      toast('スタッフの有効/無効切替に失敗しました（通信エラー）', 'error')
    }
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

  // 送信者ID → 表示名 のマップ（announcements 一覧に併記表示するため）
  const [authorNames, setAuthorNames] = useState<Map<string, string>>(new Map())

  const fetchAnnouncements = useCallback(async () => {
    const { data } = await supabaseClient
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) {
      setAnnouncements(data as Announcement[])
      // 送信者ID を集めて profiles から表示名を取得
      const ids = Array.from(new Set(
        (data as Array<{ created_by?: string | null }>)
          .map(a => a.created_by)
          .filter((v): v is string => !!v)
      ))
      if (ids.length > 0) {
        const { data: profs } = await supabaseClient
          .from('profiles')
          .select('id, display_name, cast_name')
          .in('id', ids)
        const m = new Map<string, string>()
        for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null; cast_name: string | null }>) {
          m.set(p.id, p.display_name || p.cast_name || '(不明)')
        }
        setAuthorNames(m)
      }
    }
  }, [supabaseClient])

  useEffect(() => {
    if (showAnnouncements) fetchAnnouncements()
  }, [showAnnouncements, fetchAnnouncements])

  const handleSaveAnnouncement = async () => {
    if (!announcementForm.title.trim()) {
      toast('タイトルを入力してください', 'warning')
      return
    }
    setAnnouncementSaving(true)

    // v0.3.43-C: created_by 用の自分のユーザーIDも fetchCachedMe (sessionStorage キャッシュ) 経由で取得。
    //   これで app/ 配下のクライアント側 auth.getUser() 直叩きが完全消滅。
    const me = await fetchCachedMe()

    const payload: Record<string, unknown> = {
      title: announcementForm.title,
      body: announcementForm.body,
      priority: announcementForm.priority,
      target_type: announcementForm.target_type,
      target_cast_ids: announcementForm.target_type === 'individual'
        ? announcementForm.target_cast_ids : [],
      target_cast_id: null,
    }

    // ⚠ 旧: insert/update のエラーを握りつぶしてた → 投稿失敗でもフォームクリアして成功風
    try {
      if (editingAnnouncementId) {
        const { error } = await supabaseClient.from('announcements').update(payload).eq('id', editingAnnouncementId)
        if (error) throw new Error(`お知らせの更新に失敗: ${error.message}`)
      } else {
        // 新規投稿時のみ created_by をセット（編集時は元の投稿者を保持）
        if (me?.id) payload.created_by = me.id
        const { error } = await supabaseClient.from('announcements').insert(payload)
        if (error) throw new Error(`お知らせの投稿に失敗: ${error.message}`)
      }
    } catch (err) {
      console.error('handleSubmitAnnouncement error:', err)
      const msg = err instanceof Error ? err.message : '不明なエラー'
      toast(msg, 'error')
      setAnnouncementSaving(false)
      return
    }

    // v0.3.49-D: 成功フィードバック追加 (旧: 無音でフォームクリアのみ)
    toast('お知らせを保存しました', 'success')
    setAnnouncementForm({ title: '', body: '', priority: 'normal', target_type: 'all', target_cast_ids: [] })
    setEditingAnnouncementId(null)
    setAnnouncementSaving(false)
    fetchAnnouncements()
  }

  const handleToggleAnnouncement = async (id: string, currentActive: boolean) => {
    const { error } = await supabaseClient.from('announcements').update({ is_active: !currentActive }).eq('id', id)
    if (error) {
      console.error('handleToggleAnnouncement error:', error)
      toast(`お知らせの有効/無効切替に失敗しました: ${error.message}`, 'error')
      return
    }
    fetchAnnouncements()
  }

  const handleDeleteAnnouncement = async (id: string) => {
    if (!window.confirm('このお知らせを削除しますか？')) return
    const { error } = await supabaseClient.from('announcements').delete().eq('id', id)
    if (error) {
      console.error('handleDeleteAnnouncement error:', error)
      toast(`お知らせの削除に失敗しました: ${error.message}`, 'error')
      return
    }
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
          setTimeout(() => router.push('/home'), 1200)
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

  // キャスト管理 or お知らせ投稿（個人送信のターゲット選択で必要）の
  // どちらかを持っている時にキャスト一覧を取得。
  // 他の権限のみのスタッフでも、管理ページ自体には入れるようにする。
  useEffect(() => {
    if (hasPerm('キャスト.アカウント管理') || hasPerm('お知らせ.投稿')) {
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
        toast(data?.error || '更新に失敗しました', 'error')
        return
      }
      setCasts((prev) => prev.map((c) => (c.id === cast.id ? (data as Cast) : c)))
      // v0.3.49-D: 成功フィードバック追加 (旧: 無音)
      toast(next ? `${label} を復帰させました` : `${label} を退店扱いにしました`, 'success')
    } catch (err) {
      console.error('toggleActive error:', err)
      toast('更新に失敗しました', 'error')
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
        toast(data?.error || '層の更新に失敗しました', 'error')
        return
      }
      setCasts((prev) => prev.map((c) => (c.id === cast.id ? (data as Cast) : c)))
      // v0.3.49-D: 成功フィードバック追加 (旧: 無音)
      toast(`${cast.display_name || cast.cast_name || 'キャスト'} の層を「${tierValue ?? '未設定'}」に変更しました`, 'success')
    } catch (err) {
      console.error('handleTierChange error:', err)
      toast('層の更新に失敗しました', 'error')
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
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>
      {/* v0.3.49-D: 通知トースト (useToast に1本化。引継ぎ/お知らせ/スタッフ/キャスト管理共用) */}
      {ToastView}
      {/* ─── ヘッダー ─── */}
      <PageHeader
        title="キャスト管理"
        subtitle="CAST MANAGEMENT"
        actions={<ViewModeToggle />}
      />
      {/* タブ切り替え */}
      {isOwner && (
        <div style={{ background: C.headerBg, borderBottom: `1px solid ${C.border}` }}>
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
                {tab === 'casts' ? "キャスト管理" : "スタッフ管理"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── スタッフ管理タブ ─── */}
      {activeTab === 'staff' && isOwner && (
        <div style={{ maxWidth: '420px', margin: '0 auto', padding: '20px 16px' }}>
          {/* オーナー/権限保持者向け: 設定系へのリンク */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '14px' }}>
            <button
              onClick={() => router.push('/admin/rank-criteria')}
              style={{
                width: '100%',
                background: '#FFF', color: C.dark,
                fontSize: '12px', fontWeight: 600,
                letterSpacing: '0.1em',
                padding: '12px 14px',
                border: `1px solid ${C.pink}`, borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>📊 顧客ランク設定</span>
              <span style={{ fontSize: '10px', color: C.pinkMuted }}>本指名のランク自動判定基準を編集 →</span>
            </button>
            <button
              onClick={() => router.push('/admin/targets')}
              style={{
                width: '100%',
                background: '#FFF', color: C.dark,
                fontSize: '12px', fontWeight: 600,
                letterSpacing: '0.1em',
                padding: '12px 14px',
                border: `1px solid ${C.pink}`, borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>💰 ノルマ設定</span>
              <span style={{ fontSize: '10px', color: C.pinkMuted }}>層別/個別の月次ノルマを編集 →</span>
            </button>
          </div>

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

                        {/* v5: カテゴリ別グループ表示（PERMISSION_GROUPS / 8 カテゴリ）。
                            ⚠ 印は SENSITIVE_PERMISSIONS（影響範囲が大きい権限）の目印。 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {PERMISSION_GROUPS.map(group => (
                            <div key={group.category}>
                              {/* カテゴリヘッダー */}
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '10px', letterSpacing: '0.15em',
                                color: C.pinkMuted, marginBottom: '6px',
                                paddingLeft: '4px',
                              }}>
                                <span style={{ fontSize: '13px' }}>{group.emoji}</span>
                                <span style={{ fontWeight: 600 }}>{group.category}</span>
                              </div>

                              {/* このカテゴリの権限トグル */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {group.permissions.map(perm => {
                                  const enabled = staff.permissions[perm] ?? false
                                  const isSensitive = SENSITIVE_PERMISSIONS.includes(perm)
                                  return (
                                    <div key={perm} style={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                      padding: '8px 12px',
                                      background: enabled ? 'rgba(232,135,155,0.04)' : C.tagBg,
                                      border: `1px solid ${enabled ? 'rgba(232,135,155,0.2)' : C.border}`,
                                    }}>
                                      <span style={{
                                        fontSize: '12px', color: C.dark,
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                      }}>
                                        {/* カテゴリ部分はグレーアウト、アクション部分のみ強調 */}
                                        <span style={{ color: C.pinkMuted }}>{perm.split('.')[0]}.</span>
                                        <span style={{ fontWeight: 500 }}>{perm.split('.')[1]}</span>
                                        {isSensitive && (
                                          <span title="影響範囲が大きい権限" style={{
                                            fontSize: '10px', color: C.danger,
                                            border: `1px solid ${C.danger}`,
                                            padding: '0 4px', borderRadius: '4px',
                                            letterSpacing: '0.05em',
                                          }}>⚠</span>
                                        )}
                                      </span>
                                      <button
                                        onClick={() => handleTogglePermission(staff.id, perm, enabled)}
                                        style={{
                                          width: '40px', height: '22px', borderRadius: '11px',
                                          background: enabled ? C.pink : '#D0C8CC',
                                          border: 'none', cursor: 'pointer', position: 'relative', padding: 0,
                                          flexShrink: 0,
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
                          ))}
                        </div>

                        {/* 凡例 */}
                        <div style={{
                          fontSize: '10px', color: C.pinkMuted,
                          marginTop: '10px', padding: '8px 10px',
                          background: '#FAFAF9', border: `1px dashed ${C.border}`,
                        }}>
                          <span style={{ color: C.danger, marginRight: '4px' }}>⚠</span>
                          印は影響範囲が大きい権限。付与する前に内容を確認してください。
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
          {hasPerm('売上.入力') && (
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
          {hasPerm('シフト.管理') && (
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
        {/* ⚠ 旧: 1ブロック全体を「レポート.閲覧」でゲートしてたが、
            ボタンの中身がレポート系に限らず（成績一覧=KPI、通知送信=通知系等）
            混在していたので、ボタン毎に正しい権限でゲートするように修正 */}
        {(hasPerm('KPI.閲覧') || hasPerm('レポート.閲覧') || hasPerm('KPI.詳細分析') || hasPerm('顧客.全店分析') || hasPerm('通知.送信') || hasPerm('通知.自動配信設定')) && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {hasPerm('KPI.閲覧') && (
              <button
                onClick={() => router.push('/admin/performance')}
                style={{
                  flex: '1 1 30%', minWidth: 100,
                  background: 'transparent',
                  color: C.pink,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '12px 8px',
                  border: `1px solid ${C.pink}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                📊 成績一覧
              </button>
            )}
            {hasPerm('レポート.閲覧') && (
              <button
                onClick={() => router.push('/admin/monthly-report')}
                style={{
                  flex: '1 1 30%', minWidth: 100,
                  background: 'transparent',
                  color: C.pink,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '12px 8px',
                  border: `1px solid ${C.pink}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                📄 月次レポート
              </button>
            )}
            {hasPerm('KPI.詳細分析') && (
              <button
                onClick={() => router.push('/admin/cast-analysis')}
                style={{
                  flex: '1 1 30%', minWidth: 100,
                  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  color: C.white,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '12px 8px',
                  border: `1px solid ${C.pink}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                🔬 キャスト分析
              </button>
            )}
            {hasPerm('KPI.詳細分析') && (
              <button
                onClick={() => router.push('/admin/cast-evaluation')}
                style={{
                  flex: '1 1 30%', minWidth: 100,
                  background: `linear-gradient(135deg, #5B8DBE, #85B7EB)`,
                  color: C.white,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '12px 8px',
                  border: `1px solid #5B8DBE`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                📊 キャスト評価
              </button>
            )}
            {hasPerm('顧客.全店分析') && (
              <button
                onClick={() => router.push('/admin/customer-analysis')}
                style={{
                  flex: '1 1 30%', minWidth: 100,
                  background: `linear-gradient(135deg, #D4A017, #F5C842)`,
                  color: C.white,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '12px 8px',
                  border: `1px solid #D4A017`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                🔍 お客様分析
              </button>
            )}
            {(hasPerm('通知.送信') || hasPerm('通知.自動配信設定')) && (
              <button
                onClick={() => router.push('/admin/notifications')}
                style={{
                  flex: '1 1 30%', minWidth: 100,
                  background: `linear-gradient(135deg, #B89AD0, #DCC4F0)`,
                  color: '#FFF',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '12px 8px',
                  border: `1px solid #B89AD0`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                📢 通知管理
              </button>
            )}
          </div>
        )}

        {/* v0.3.36: ランク基準/ノルマ設定リンク (castsタブから権限スタッフがアクセスできるよう追加)
            ★ staffタブ内の既存リンク (line 695〜728) は owner 用にそのまま維持。
               owner は staffタブ側と castsタブ側の両方にボタンが見えるが UX 上問題なし。 */}
        {(hasPerm('ランク基準.設定') || hasPerm('ノルマ.設定')) && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {hasPerm('ランク基準.設定') && (
              <button
                onClick={() => router.push('/admin/rank-criteria')}
                style={{
                  flex: '1 1 30%', minWidth: 100,
                  background: 'transparent',
                  color: C.pink,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '12px 8px',
                  border: `1px solid ${C.pink}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                📊 ランク基準設定
              </button>
            )}
            {hasPerm('ノルマ.設定') && (
              <button
                onClick={() => router.push('/admin/targets')}
                style={{
                  flex: '1 1 30%', minWidth: 100,
                  background: 'transparent',
                  color: C.pink,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '12px 8px',
                  border: `1px solid ${C.pink}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                💰 ノルマ設定
              </button>
            )}
          </div>
        )}

        {/* v0.3.28: お客様担当リスト（オーナー・管理者のみ・独立ブロック） */}
        {(isOwner || myRole === 'admin') && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push('/admin/customer-staff')}
              style={{
                flex: '1 1 30%', minWidth: 100,
                background: `linear-gradient(135deg, #E8789A, #F4A5B8)`,
                color: C.white,
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                padding: '12px 8px',
                border: `1px solid #E8789A`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              🧑‍💼 お客様担当リスト
            </button>
          </div>
        )}

        {/* 店舗の曜日別来店パターン（管理ページの目に入る場所に常時表示） */}
        {/* ⚠ 中身は KPI 系（曜日別の来客数チャート）なので KPI.閲覧 でゲート */}
        {hasPerm('KPI.閲覧') && (
          <div style={{ marginBottom: '20px' }}>
            <WeekdayPatternCard month={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`} />
          </div>
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

        {/* ─── お知らせ管理セクション（閲覧と投稿を分離） ─── */}
        {/* hasPerm('お知らせ.閲覧') は包含で 'お知らせ.管理' / 'お知らせ.投稿' も拾う */}
        {(hasPerm('お知らせ.閲覧') || hasPerm('お知らせ.投稿')) && <div style={{ marginBottom: '20px' }}>
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
            {showAnnouncements ? "閉じる" : "お知らせ管理"}
          </button>

          {showAnnouncements && (
            <div style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              borderTop: 'none',
              padding: '16px',
            }}>
              {/* 作成/編集フォーム — 投稿権限がある人のみ */}
              {hasPerm('お知らせ.投稿') && <>
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
              </>}{/* /hasPerm('お知らせ.投稿') */}

              {/* お知らせ一覧（閲覧は誰でも） */}
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
                        {/* トグル — 投稿権限がない人は disabled */}
                        <button
                          onClick={() => hasPerm('お知らせ.投稿') && handleToggleAnnouncement(a.id, a.is_active)}
                          disabled={!hasPerm('お知らせ.投稿')}
                          style={{
                            width: '36px', height: '20px', borderRadius: '10px',
                            background: a.is_active ? C.pink : '#D0C8CC',
                            border: 'none',
                            cursor: hasPerm('お知らせ.投稿') ? 'pointer' : 'not-allowed',
                            opacity: hasPerm('お知らせ.投稿') ? 1 : 0.5,
                            position: 'relative',
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
                          <div style={{ display: 'flex', gap: '4px', marginTop: '2px', fontSize: '9px', flexWrap: 'wrap' }}>
                            {a.priority === 'important' && (
                              <span style={{ background: C.pink, color: '#FFF', padding: '1px 4px', borderRadius: '2px' }}>重要</span>
                            )}
                            <span style={{ color: C.pinkMuted }}>
                              {a.target_type === 'all' ? '全体' : `個人: ${targetNames || '?'}`}
                            </span>
                            <span style={{ color: C.pinkMuted }}>
                              {a.created_at?.slice(0, 10)}
                            </span>
                            {a.created_by && (
                              <span style={{ color: C.pinkMuted }}>
                                投稿: {authorNames.get(a.created_by) ?? '...'}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* アクション — 投稿権限が無いと表示しない */}
                        {hasPerm('お知らせ.投稿') && (<>
                        <button
                          onClick={() => handleEditAnnouncement(a)}
                          style={{ fontSize: '10px', color: C.pink, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >編集</button>
                        <button
                          onClick={() => handleDeleteAnnouncement(a.id)}
                          style={{ fontSize: '10px', color: C.danger, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >削除</button>
                        </>)}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>}

        {/* ─── キャスト一覧セクション（閲覧と編集を分離）─── */}
        {/* 'キャスト.閲覧' は包含で 'キャスト.アカウント管理' も拾う */}
        {hasPerm('キャスト.閲覧') && (<>
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
                    {/* ⚠ 認証情報変更・退店処理は「キャスト.アカウント管理」が必要。
                          旧: 親ブロックの「キャスト.閲覧」だけで両方とも見えていた */}
                    {hasPerm('キャスト.アカウント管理') && (
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
                    )}
                    {hasPerm('キャスト.アカウント管理') && (
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
                    )}
                    {/* キャスト分析（オーナー or 'KPI.詳細分析' 権限） */}
                    {hasPerm('KPI.詳細分析') && (
                      <button
                        onClick={() => router.push(`/admin/casts/${cast.id}`)}
                        style={{
                          background: `linear-gradient(160deg, ${C.pink}, ${C.pinkLight})`,
                          color: '#FFF',
                          border: `1px solid ${C.pink}`,
                          fontSize: '10px',
                          letterSpacing: '0.15em',
                          padding: '6px 14px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontWeight: 600,
                        }}
                        title="キャスト個別 詳細分析"
                      >
                        📊 分析
                      </button>
                    )}
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
      {hasPerm('顧客.引継ぎ') && <div style={{
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
          {showTransfer ? "閉じる" : "顧客引継ぎ"}
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
                const failures: { id: string; error: string }[] = []
                for (const id of selectedIds) {
                  const { error } = await supabaseClient
                    .from('customers')
                    .update({ cast_name: transferTo })
                    .eq('id', Number(id))
                  if (!error) successCount++
                  else failures.push({ id, error: error.message })
                }
                // ⚠ キャッシュ無効化: 旧担当と新担当の達成率・顧客リストが切り替わるよう
                invalidateCache('customers:all')
                invalidateCacheByPrefix('castPage:')
                invalidateCacheByPrefix('castsKPI:')
                invalidateCacheByPrefix('customerDetail:')
                // ⚠ 失敗件数を表示（旧: 成功数だけ → 失敗があっても気付かない）
                // v0.3.49-D: transferToast → useToast に統合 (文言は v0.3.38 のまま)
                if (failures.length > 0) {
                  console.error('handover failures:', failures)
                  console.warn(`引継ぎ失敗例: ${failures[0].error}`)
                  toast(`${successCount}人を引き継ぎました（${failures.length}人失敗）`, 'warning')
                } else {
                  toast(`${successCount}人の顧客を引き継ぎました`, 'success')
                }
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
