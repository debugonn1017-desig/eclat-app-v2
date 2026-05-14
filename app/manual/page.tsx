// COSTES キャスト教科書（α案：iframe 埋め込み）
//
//   /manual
//
//   - admin ロールのみ閲覧可（スタッフレビュー期間中。cast には後日公開予定）
//   - 認証は proxy.ts が一次ガード（未ログインは /login へ）
//   - 本ファイルは Server Component。getCurrentProfile() でロール判定し、
//     admin 以外には案内文だけを返す。
//   - 本体は public/manual.html を iframe で全画面表示（高さは BottomNav 分を引く）
//   - BottomNav を表示して他ページへ戻れるようにする（2026-05-14 修正）
import { getCurrentProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { C } from '@/lib/colors'
import BottomNav from '@/components/BottomNav'

// 動的レンダリング（Cookie からセッションを読むため）
export const dynamic = 'force-dynamic'

export default async function ManualPage() {
  const profile = await getCurrentProfile()

  // 未ログインは /login へ（proxy.ts でも弾かれるが二重防御）
  if (!profile) {
    redirect('/login')
  }

  // cast（role は 'admin' | 'cast' の2値）は今回非公開（準備中）
  if (profile.role !== 'admin') {
    return (
      <>
        <div style={{
          minHeight: 'calc(100vh - 60px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          textAlign: 'center',
          background: C.bg,
        }}>
          <div>
            <h1 style={{ fontSize: 18, marginBottom: 12, color: C.dark, fontWeight: 600 }}>
              COSTES キャスト教科書
            </h1>
            <p style={{ color: C.pinkMuted, fontSize: 13, lineHeight: 1.8, margin: 0 }}>
              このページは現在、管理者・スタッフのレビュー用に公開されています。<br />
              キャスト本人向けは準備中、後日公開予定です。
            </p>
          </div>
        </div>
        <BottomNav />
      </>
    )
  }

  // admin: iframe で manual.html を全画面表示（スタッフレビュー用）
  return (
    <>
      <div style={{
        width: '100%',
        // BottomNav（モバイル 60px）の分を引く。PC では BottomNav は overlay だが
        // 同じ高さでも実害なし（少し余白が出るだけ）。
        height: 'calc(100vh - 60px)',
        overflow: 'hidden',
        background: '#FFF8FA',
      }}>
        <iframe
          src="/manual.html"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
          title="COSTES キャスト教科書"
        />
      </div>
      <BottomNav />
    </>
  )
}
