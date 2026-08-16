'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { Header } from '@/components/Header';
import { PurchaseOrderStatusBadge } from '@/components/StatusBadge';
import { EmptyState, PrimaryButton } from '@/components/ui';
import { formatThaiDate } from '@/lib/derive';
import type { PurchaseOrderStatus } from '@/lib/types';

const TABS: { value: PurchaseOrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'draft', label: 'ร่าง' },
  { value: 'sent', label: 'ส่งแล้ว' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'received', label: 'รับแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
];

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { purchaseOrders, suppliers } = useAppState();
  const [tab, setTab] = useState<PurchaseOrderStatus | 'all'>('all');

  const canManage = employee?.role === 'owner' || employee?.role === 'manager';

  const filtered = purchaseOrders
    .filter((po) => tab === 'all' || po.status === tab)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      <Header title="ใบสั่งซื้อ" subtitle="รวมรายการเสนอซื้อที่อนุมัติแล้วเป็นใบสั่งซื้อต่อผู้ขาย" currentEmployee={employee} />
      <main className="space-y-4 px-4 py-4">
        {canManage && (
          <div>
            <PrimaryButton onClick={() => router.push('/order')}>+ สั่งสินค้าเพิ่ม</PrimaryButton>
          </div>
        )}

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                tab === t.value ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 shadow-card'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="📦" title="ไม่มีใบสั่งซื้อในหมวดนี้" />
        ) : (
          <div className="space-y-2.5">
            {filtered.map((po) => {
              const supplier = suppliers.find((s) => s.id === po.supplierId);
              const total = po.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
              return (
                <button
                  key={po.id}
                  onClick={() => router.push(`/purchase-orders/${po.id}`)}
                  className="block w-full rounded-2xl bg-white p-4 text-left shadow-card active:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">{supplier?.name ?? 'ไม่ระบุผู้ขาย'}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatThaiDate(po.orderDate)} · {po.items.length} รายการ
                      </p>
                    </div>
                    <PurchaseOrderStatusBadge status={po.status} />
                  </div>
                  {total > 0 && <p className="mt-2 text-xs font-semibold text-gray-600">รวม {total.toLocaleString()} บาท</p>}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
