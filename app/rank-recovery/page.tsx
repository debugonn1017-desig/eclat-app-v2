import RankRecoveryPage from '@/components/RankRecoveryPage'

export default async function Page({searchParams}:{searchParams:Promise<{castName?:string}>}) {
  const params=await searchParams
  return <RankRecoveryPage initialCastName={params.castName||''}/>
}
