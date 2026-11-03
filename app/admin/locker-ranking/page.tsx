import { notFound, redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import LockerRankingPage from '@/components/LockerRankingPage'

export default async function Page() {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login')
    if (error instanceof Error && error.message === 'FORBIDDEN') notFound()
    throw error
  }
  return <LockerRankingPage/>
}
