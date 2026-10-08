import { C } from '@/lib/colors'

export default function CustomerReplyBadge({ active }: { active: boolean }) {
  if (!active) return null
  return <div style={{ marginTop: 4 }}><span style={{ display: 'inline-block', color: C.tagTextStrong, background: C.tagBg2, borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>返信なし</span></div>
}
