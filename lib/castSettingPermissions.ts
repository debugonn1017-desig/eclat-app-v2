type Viewer = { role?: string; is_owner?: boolean; permissions?: Record<string, boolean> }

export function getCastSettingPermissions(viewer: Viewer | null | undefined) {
  const admin = viewer?.role === 'admin'
  return {
    canEditTargets: admin && (viewer?.is_owner === true || viewer?.permissions?.['ノルマ.設定'] === true),
    canEditProfile: admin && (viewer?.is_owner === true || viewer?.permissions?.['キャスト.アカウント管理'] === true),
  }
}
