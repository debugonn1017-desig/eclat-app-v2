'use client'
import { Suspense } from 'react'
import CastWorkspace from '@/components/CastWorkspace'
export default function CastDetailPage() {
  return <Suspense fallback={<p>読み込み中…</p>}><CastWorkspace /></Suspense>
}
