import { NextResponse } from 'next/server'
export async function GET() { return NextResponse.json({error:'旧ホームの確認カードは廃止されました'}, {status:410}) }
