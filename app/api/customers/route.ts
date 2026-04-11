import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { Customer } from '@/types';

const DB_PATH = path.join(process.cwd(), 'data', 'customers.json');

async function ensureDb() {
  const dir = path.dirname(DB_PATH);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify([], null, 2));
  }
}

export async function GET() {
  await ensureDb();
  const data = await fs.readFile(DB_PATH, 'utf-8');
  return NextResponse.json(JSON.parse(data));
}

export async function POST(request: Request) {
  await ensureDb();
  const customer: Customer = await request.json();
  const data = await fs.readFile(DB_PATH, 'utf-8');
  const customers: Customer[] = JSON.parse(data);
  
  const existingIndex = customers.findIndex(c => c.id === customer.id);
  if (existingIndex > -1) {
    customers[existingIndex] = customer;
  } else {
    customers.push(customer);
  }
  
  await fs.writeFile(DB_PATH, JSON.stringify(customers, null, 2));
  // 保存した顧客データをそのまま返すことで、フロントエンドでの確実なID取得を保証
  return NextResponse.json(customer);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

  await ensureDb();
  const data = await fs.readFile(DB_PATH, 'utf-8');
  const customers: Customer[] = JSON.parse(data);
  const filtered = customers.filter(c => c.id !== id);
  await fs.writeFile(DB_PATH, JSON.stringify(filtered, null, 2));
  return NextResponse.json({ success: true });
}
