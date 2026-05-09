// Browser-side Supabase client.
// Uses @supabase/ssr so auth cookies are read/written consistently with the server.
//
// ⚡ パフォーマンス対策（2026-05-09）:
//   ブラウザ側で createClient() を呼ぶたびに新しいクライアントが
//   作られていた（コンポーネントごとに useMemo で1個ずつ）。
//   実は全コンポーネントで 1個共有で十分。シングルトンに変更。
//   → 認証状態の維持・cookie 同期が安定、メモリ少なく、初期化時間も短縮。
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    // SSR/RSC からも呼ばれる可能性があるのでその場合は新規作成（シングルトンしない）
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}
