'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useCustomers } from '@/hooks/useCustomers';
import { CustomerForm } from '@/components/CustomerForm';

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { getCustomer, updateCustomer, isLoaded } = useCustomers();

  const customer = getCustomer(id);

  if (!isLoaded) {
    return <div className="flex justify-center items-center h-screen bg-gray-50 font-black text-blue-500">LOADING...</div>;
  }

  if (!customer) {
    return (
      <div className="flex flex-col justify-center items-center h-screen p-4 text-center">
        <p className="text-gray-500 mb-4">顧客が見つかりませんでした。</p>
        <button onClick={() => router.push('/')} className="text-blue-600 font-medium">一覧に戻る</button>
      </div>
    );
  }

  const handleSubmit = async (data: any) => {
    try {
      await updateCustomer(id, data);
      // 編集時は既存のIDを使って確実に詳細画面へ戻る
      if (id) {
        router.push(`/customer/${id}`);
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Failed to update customer:', error);
      alert('更新に失敗しました。');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white p-4 sticky top-0 z-10 shadow-sm border-b">
        <h1 className="text-xl font-bold text-gray-800">顧客編集: {customer.customer_name}</h1>
      </header>

      <main className="p-4">
        <CustomerForm 
          initialData={customer}
          onSubmit={handleSubmit} 
          onCancel={() => router.back()} 
        />
      </main>
    </div>
  );
}
