'use client'

// 顧客プロフィール写真カード
//   ・写真の表示
//   ・アップロード（管理者のみ）
//   ・削除（管理者のみ）
//
//   ストレージは Supabase Storage の「customer-photos」バケット。
//   ファイル名は `{customerId}/{timestamp}.{ext}` 形式。
//   表示は createSignedUrl で1時間有効な署名URLを発行する（バケットは private）。
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'

type Props = {
  customerId: string
  /** customers.photo_url にセットされている値（オブジェクトのパス） */
  photoUrl: string | null
  isAdmin: boolean
  onChange: (newPath: string | null) => void
}

const BUCKET = 'customer-photos'

export default function CustomerPhotoCard({
  customerId,
  photoUrl,
  isAdmin,
  onChange,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // 署名URLの取得
  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      if (!photoUrl) {
        setSignedUrl(null)
        return
      }
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(photoUrl, 60 * 60)
      if (!cancelled && data?.signedUrl) setSignedUrl(data.signedUrl)
    }
    fetch()
    return () => {
      cancelled = true
    }
  }, [photoUrl, supabase])

  const handleUpload = async (file: File) => {
    if (!isAdmin) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${customerId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (error) {
        alert('アップロードに失敗しました: ' + error.message)
        return
      }
      // 古い写真を削除（あれば）
      if (photoUrl) {
        await supabase.storage.from(BUCKET).remove([photoUrl]).catch(() => {})
      }
      // customers.photo_url を更新
      await supabase.from('customers').update({ photo_url: path }).eq('id', customerId)
      onChange(path)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!isAdmin || !photoUrl) return
    if (!confirm('プロフィール写真を削除しますか？')) return
    await supabase.storage.from(BUCKET).remove([photoUrl]).catch(() => {})
    await supabase.from('customers').update({ photo_url: null }).eq('id', customerId)
    onChange(null)
  }

  return (
    <div
      style={{
        background: '#FFF',
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 12,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: '#F5F0F2',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signedUrl}
            alt="customer"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: 9, color: C.pinkMuted }}>NO PHOTO</span>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', color: C.pinkMuted }}>
          PROFILE PHOTO
        </div>
        <div style={{ fontSize: 11, color: C.pinkMuted, marginTop: 2 }}>
          {photoUrl ? '登録済み' : '未登録'}
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <label
              style={{
                fontSize: 11,
                padding: '4px 12px',
                borderRadius: 8,
                background: '#FBEAF0',
                color: '#72243E',
                cursor: uploading ? 'wait' : 'pointer',
                opacity: uploading ? 0.5 : 1,
              }}
            >
              {uploading ? '送信中...' : photoUrl ? '差替え' : '写真を追加'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={uploading}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f)
                  e.target.value = ''
                }}
              />
            </label>
            {photoUrl && (
              <button
                onClick={handleDelete}
                style={{
                  fontSize: 11,
                  padding: '4px 12px',
                  borderRadius: 8,
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  color: C.dark,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                削除
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
