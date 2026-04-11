'use client';

import { useState, useEffect } from 'react';
import { Customer, ContactHistory } from '@/types';

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      setCustomers(data);
    } catch (e) {
      console.error('Failed to fetch customers', e);
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const saveCustomer = async (customer: Customer) => {
    try {
      await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customer),
      });
      await fetchCustomers();
    } catch (e) {
      console.error('Failed to save customer', e);
    }
  };

  const addCustomer = async (customer: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'history'>) => {
    const now = new Date().toISOString();
    const newCustomer: Customer = {
      ...customer,
      id: crypto.randomUUID(),
      history: [],
      created_at: now,
      updated_at: now,
    };
    await saveCustomer(newCustomer);
    return newCustomer;
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;
    
    const updatedCustomer: Customer = {
      ...customer,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    await saveCustomer(updatedCustomer);
  };

  const deleteCustomer = async (id: string) => {
    try {
      await fetch(`/api/customers?id=${id}`, { method: 'DELETE' });
      await fetchCustomers();
    } catch (e) {
      console.error('Failed to delete customer', e);
    }
  };

  const getCustomer = (id: string) => {
    return customers.find((c) => c.id === id);
  };

  const logContact = async (customerId: string, historyItem: Omit<ContactHistory, 'id' | 'date'>) => {
    const customer = getCustomer(customerId);
    if (!customer) return;

    const now = new Date().toISOString();
    const newItem: ContactHistory = {
      ...historyItem,
      id: crypto.randomUUID(),
      date: now,
    };

    const updatedCustomer: Customer = {
      ...customer,
      last_contact_date: now,
      history: [newItem, ...(customer.history || [])],
      updated_at: now,
    };

    await saveCustomer(updatedCustomer);
  };

  return {
    customers,
    isLoaded,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomer,
    logContact,
    refresh: fetchCustomers
  };
}
