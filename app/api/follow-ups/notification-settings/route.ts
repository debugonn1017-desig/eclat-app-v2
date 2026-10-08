import { NextResponse } from 'next/server'
const retired = () => NextResponse.json({ error: 'この機能は廃止されました' }, { status: 410 })
export const GET = retired
export const PATCH = retired
