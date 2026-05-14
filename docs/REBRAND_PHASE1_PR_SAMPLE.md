# フェーズ1 PR サンプル — 「グローバル基盤」

## このPRで変える3ファイル

1. `lib/colors.ts` — 桜系階調に微調整
2. `app/layout.tsx` — Zen Maru Gothic 導入 + SakuraAnimation 配置
3. `app/globals.css` — body の background-tint と font-family

---

## 1. `lib/colors.ts`

### Before (現状想定)

```ts
export const C = {
  bg: '#FAFAFA',
  white: '#FFFFFF',
  dark: '#3A2A2F',
  pink: '#E8789A',
  pinkLight: '#F4A5B8',
  pinkMuted: '#B0909A',
  border: '#E8DDE0',
  danger: '#D4537E',
}
```

### After (リブランド)

```ts
export const C = {
  // ─── 背景 (うっすら桜) ──────────
  bg: '#FFF9FA',           // 純白 → ほんのり桜
  white: '#FFFFFF',

  // ─── テキスト ───────────────
  dark: '#3A2A2F',         // 維持 (可読性)
  pinkMuted: '#B0909A',    // 維持

  // ─── ピンク階調 (主軸) ──────
  pink: '#E8879A',         // メイン CTA — やや桜寄りに調整 (旧 #E8789A)
  pinkLight: '#F4A5B8',    // 副 CTA
  pinkSoft: '#FFE4ED',     // 極淡 (Cランク・ホバー背景に使用)

  // ─── ボーダー (やわらか桜) ───
  border: '#F0DDE2',       // 旧 #E8DDE0 → よりピンク寄り

  // ─── 顧客ランク色 (桜系階調) ───
  rankS: '#D45060',
  rankA: '#E8879B',
  rankB: '#F4A5B8',
  rankC: '#FFE4ED',

  // ─── アクセント ─────────────
  danger: '#D4537E',
  gold: '#D4A017',
}
```

---

## 2. `app/layout.tsx`

### Before (想定)

```tsx
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={geist.className}>
        {children}
      </body>
    </html>
  )
}
```

### After

```tsx
import { Zen_Maru_Gothic } from 'next/font/google'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import SakuraAnimation from '@/components/ui/SakuraAnimation'
import './globals.css'

const zenMaru = Zen_Maru_Gothic({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
})

// SSR で桜アニメのグローバル ON/OFF を取得
async function getSakuraEnabled(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } } as never,
    )
    const { data } = await supabase
      .from('app_settings')
      .select('sakura_animation_enabled')
      .single()
    return data?.sakura_animation_enabled ?? true
  } catch {
    return true // デフォルト ON
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sakuraEnabled = await getSakuraEnabled()
  return (
    <html lang="ja">
      <body className={zenMaru.className}>
        <SakuraAnimation globalEnabled={sakuraEnabled} />
        {children}
      </body>
    </html>
  )
}
```

---

## 3. `app/globals.css`

### Before (想定)

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

### After

```css
:root {
  --background: #FFF9FA;  /* 桜のうすい背景 */
  --foreground: #3A2A2F;
}

body {
  background: var(--background);
  color: var(--foreground);
  /* font-family は Zen Maru Gothic を next/font 経由で当てる */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* prefers-reduced-motion で桜アニメを止めるバックアップ */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## レビューチェックリスト

- [ ] `npm run typecheck` 通過
- [ ] `npm run build` 通過
- [ ] ホーム画面でフォントが Zen Maru Gothic に切り替わっている
- [ ] 桜の花びらが背景で舞っている (12 枚程度)
- [ ] localStorage で `eclat.sakuraAnimation = 'off'` をセットしてリロード → 桜が止まる
- [ ] `update app_settings set sakura_animation_enabled = false` → リロード → 全員 OFF
- [ ] 既存の顧客一覧/シフト/管理画面が正常表示

---

## デプロイ後の確認

```bash
# 1. Vercel デプロイ URL を開く
# 2. DevTools → Application → Local Storage → eclat.sakuraAnimation
#    値: なし (デフォルト ON) / 'on' / 'off'
# 3. アニメ FPS 確認 (DevTools → Performance → 60fps 出ているか)
# 4. iPhone Safari で動作確認 (iOS の Low Power Mode で勝手に止まらないか)
```
