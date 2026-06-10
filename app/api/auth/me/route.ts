// GET /api/auth/me -> current user profile + permissions
import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { STAFF_PERMISSIONS } from '@/types'

export async function GET() {
  try {
    const profile = await getCurrentProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // For admin users, fetch their permissions
    let permissions: Record<string, boolean> = {}
    if (profile.role === 'admin') {
      if (profile.is_owner) {
        // Owner has all permissions
        for (const p of STAFF_PERMISSIONS) {
          permissions[p] = true
        }
      } else {
        const supabase = await createClient()
        const { data } = await supabase
          .from('staff_permissions')
          .select('permission, enabled')
          .eq('staff_id', profile.id)

        for (const p of STAFF_PERMISSIONS) {
          const found = data?.find(d => d.permission === p)
          permissions[p] = found?.enabled ?? false
        }
      }
    }

    // ⚡ パフォーマンス対策: ブラウザキャッシュを 60秒 効かせる。
    //    /api/auth/me は 17ファイルから呼ばれていてページ遷移ごとに走るが、
    //    プロフィールや権限はそう頻繁には変わらないので 60秒キャッシュで OK。
    //    private = ユーザーごと、must-revalidate = 期限後は再取得。
    return NextResponse.json({
      id: profile.id,
      role: profile.role,
      display_name: profile.display_name,
      // v0.3.43-A: クライアント側で profiles 再取得を不要にするため cast_name も返す。
      //   null 明示で型を安定させる (cast 以外は null)。
      cast_name: profile.cast_name ?? null,
      is_owner: profile.is_owner,
      permissions,
    }, {
      headers: {
        // v0.3.44-A2: 認証情報は HTTP キャッシュに乗せない。
        //   fetchMe() の sessionStorage 5分キャッシュが既にあるため HTTP キャッシュのメリットは薄く、
        //   ログアウト直後に古い認証情報を踏むリスクの方が大きい（Codex 助言）
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
