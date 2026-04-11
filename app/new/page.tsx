'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useCustomers } from '@/hooks/useCustomers';
import { CustomerForm } from '@/components/CustomerForm';

export default function NewCustomerPage() {
  const router = useRouter();
  const { addCustomer } = useCustomers();

  const handleSubmit = async (data: any) => {
    try {
      // 1. 保存処理を非同期で実行し、生成された顧客データを取得
      const newCustomer = await addCustomer(data);
      
      // 2. IDが存在することを確実に保証してから遷移
      if (newCustomer && newCustomer.id) {
        router.push(`/customer/${newCustomer.id}`);
      } else {
        throw new Error('Customer ID was not generated correctly');
      }
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('保存に失敗しました。もう一度お試しください。');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white p-4 sticky top-0 z-10 shadow-sm border-b">
        <h1 className="text-xl font-bold text-gray-800">新規顧客登録</h1>
      </header>

      <main className="p-4">
        <CustomerForm 
          onSubmit={handleSubmit} 
          onCancel={() => router.back()} 
        />
      </main>
    </div>
  );
}
