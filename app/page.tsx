// ─────────────────────────────────────────────────────────────────
//  / (ルート) → /home へリダイレクト
//   v0.3.47-A: アプリ起動時はホーム画面を開く。
//   旧・顧客一覧ページは app/customers/page.tsx へ移動 (完全一致move)。
// ─────────────────────────────────────────────────────────────────
import { redirect } from 'next/navigation'

export default function RootRedirect() {
  redirect('/home')
}
