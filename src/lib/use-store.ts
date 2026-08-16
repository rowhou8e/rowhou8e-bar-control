'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { store, recomputedStockItems, recomputedProductLots } from './store';
import type { Employee } from './types';

/** hook หลักสำหรับอ่าน state ทั้งก้อนแบบ reactive (re-render เมื่อ state เปลี่ยน) */
export function useAppState() {
  useEffect(() => {
    store.hydrate();
  }, []);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const now = new Date();
  return {
    ...state,
    // active=false = ถูก "ลบ" ออกจากรายการแล้ว (soft-delete) — กรองออกเสมอไม่ว่าจะโหมด mock หรือ Supabase จริง
    stockItems: recomputedStockItems(state.stockItems.filter((it) => it.active), now),
    products: state.products.filter((p) => p.active),
    productLots: recomputedProductLots(state.productLots, now),
    suppliers: state.suppliers.filter((s) => s.active),
    now,
  };
}

export function useCurrentEmployee(): Employee | null {
  const { employees, session } = useAppState();
  if (!session) return null;
  return employees.find((e) => e.id === session.employeeId) ?? null;
}
