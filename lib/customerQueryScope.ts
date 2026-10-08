export type CustomerQueryProfile = {
  role: 'admin' | 'cast'
  cast_name: string | null
}

/** 未指定は従来の検索、trueだけが⭐️限定。曖昧な値は全件へ倒さず拒否する。 */
export function parseStarredFilter(raw: string | null): boolean | null {
  if (raw === null) return false
  return raw === 'true' ? true : null
}

export type CustomerQueryScope =
  | { ok: true; castNames: string[] }
  | { ok: false; reason: 'CAST_NAME_MISSING' }

/**
 * service_role で顧客集計を読む前に適用する担当範囲。
 *
 * キャストは従来の「RLS本人担当 AND URLのcastName」と同じ積集合にする。
 * 管理者は認可をAPI側で済ませた後、任意のcastNameだけを適用する。
 */
export function resolveCustomerQueryScope(
  profile: CustomerQueryProfile,
  requestedCastName: string | null,
): CustomerQueryScope {
  if (profile.role === 'admin') {
    return {
      ok: true,
      castNames: requestedCastName === null ? [] : [requestedCastName],
    }
  }

  const ownCastName = profile.cast_name?.trim() ?? ''
  if (!ownCastName) return { ok: false, reason: 'CAST_NAME_MISSING' }

  if (requestedCastName === null || requestedCastName === ownCastName) {
    return { ok: true, castNames: [ownCastName] }
  }
  return { ok: true, castNames: [ownCastName, requestedCastName] }
}
