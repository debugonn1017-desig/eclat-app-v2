// COSTES キャスト教科書 — Native 版 v0.1（2026-05-15）
//
//   /manual
//
//   - 全ロール閲覧可（admin / owner / cast 全員）。v0.1 段階で公開拡大
//   - Server Component → ロール判定 → ManualHomeClient を呼ぶ
//   - admin は ?legacy=1 で旧 iframe（public/manual.html）にフォールバック可
import { getCurrentProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import ManualHomeClient from '@/components/ManualHomeClient'

// 動的レンダリング（Cookie からセッションを読むため）
export const dynamic = 'force-dynamic'

export default async function ManualPage() {
  const profile = await getCurrentProfile()

  // 未ログインは /login へ（proxy.ts でも弾かれるが二重防御）
  if (!profile) {
    redirect('/login')
  }

  const isAdmin = profile.role === 'admin'

  // v0.1 Native 版を表示。cast/admin 両方OK。
  // 内部で ?legacy=1 をハンドル（admin のみ iframe へフォールバック）。
  return (
    <Suspense fallback={null}>
      <ManualHomeClient isAdmin={isAdmin} />
    </Suspense>
  )
}
