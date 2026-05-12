// シードベース deterministic picker
//   - 同じ seed 文字列で常に同じ結果
//   - 顧客 ID + 日付 + 状況 + パターン番号で seed を作ると、同じ条件で同じ 5 パターン

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** 配列から 1 つ取り出す (seed-deterministic) */
export function seededPicker<T>(seedStr: string, arr: T[]): T | null {
  if (arr.length === 0) return null
  return arr[hash(seedStr) % arr.length]
}

/**
 * 配列から 1 つ取り出す (パターン番号でローテーション)。
 * 同じ顧客の連続パターンで同じ候補が連発しないよう、index ベースでずらす。
 */
export function rotatedPicker<T>(seedStr: string, arr: T[], rotateIndex: number): T | null {
  if (arr.length === 0) return null
  const base = hash(seedStr)
  return arr[(base + rotateIndex) % arr.length]
}
