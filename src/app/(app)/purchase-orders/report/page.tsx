'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { Header } from '@/components/Header';
import { EmptyState, SecondaryButton } from '@/components/ui';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type ViewMode = 'category' | 'item';

type ReportRow = {
  key: string;
  label: string;
  quantityByUnit: Record<string, number>;
  amount: number;
  count: number;
};

export default function PurchaseReportPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { purchaseOrders, stockItems, stockCategories } = useAppState();

  const [month, setMonth] = useState(currentMonth());
  const [view, setView] = useState<ViewMode>('category');

  const monthOrders = useMemo(
    () => purchaseOrders.filter((po) => po.orderDate.startsWith(month) && po.status !== 'cancelled'),
    [purchaseOrders, month]
  );

  const rows = useMemo(() => {
    const map = new Map<string, ReportRow>();

    for (const po of monthOrders) {
      for (const it of po.items) {
        let key: string;
        let label: string;
        if (view === 'category') {
          const stockItem = it.stockItemId ? stockItems.find((s) => s.id === it.stockItemId) : undefined;
          const category = stockItem ? stockCategories.find((c) => c.id === stockItem.categoryId) : undefined;
          key = category?.id ?? 'uncategorized';
          label = category?.name ?? 'ค่าใช้จ่ายอื่นๆ';
        } else {
          key = it.stockItemId ?? `name:${it.itemName}`;
          label = it.itemName;
        }
        const amount = it.quantity * it.unitPrice;
        const existing = map.get(key);
        if (existing) {
          existing.amount += amount;
          existing.count += 1;
          existing.quantityByUnit[it.unit] = (existing.quantityByUnit[it.unit] ?? 0) + it.quantity;
        } else {
          map.set(key, { key, label, quantityByUnit: { [it.unit]: it.quantity }, amount, count: 1 });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [monthOrders, view, stockItems, stockCategories]);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  function handlePrint() {
    if (typeof window !== 'undefined') window.print();
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div>
      <Header
        title="สรุปการซื้อรายเดือน"
        subtitle="แยกตามหมวดหมู่หรือรายการสินค้า"
        currentEmployee={employee}
        onBack={() => router.push('/purchase-orders')}
      />
      <main className="mx-auto max-w-app space-y-4 px-4 py-4">
        <div className="no-print flex items-center justify-between rounded-2xl bg-white p-3 shadow-card">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded-full bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-100"
          >
            ก่อนหน้า
          </button>
          <p className="text-sm font-bold text-gray-800">{monthLabel(month)}</p>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded-full bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-100"
          >
            ถัดไป
          </button>
        </div>

        <div className="no-print flex gap-2">
          <button
            onClick={() => setView('category')}
            className={`flex-1 rounded-2xl py-2.5 text-sm font-bold ${
              view === 'category' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 shadow-card'
            }`}
          >
            ตามหมวดหมู่
          </button>
          <button
            onClick={() => setView('item')}
            className={`flex-1 rounded-2xl py-2.5 text-sm font-bold ${
              view === 'item' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 shadow-card'
            }`}
          >
            ตามรายการสินค้า
          </button>
        </div>

        <div className="hidden print:block">
          <p className="text-lg font-extrabold text-gray-900">สรุปการซื้อประจำเดือน {monthLabel(month)}</p>
          <p className="text-xs text-gray-500">
            แยก{view === 'category' ? 'ตามหมวดหมู่' : 'ตามรายการสินค้า'} · พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH')}
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="🧾" title="ไม่มีข้อมูลการซื้อในเดือนนี้" />
        ) : (
          <div className="rounded-2xl bg-white p-4 shadow-card print:rounded-none print:shadow-none">
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.key} className="flex items-center justify-between border-b border-gray-50 pb-2 text-xs last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-800">{r.label}</p>
                    <p className="text-gray-400">
                      {Object.entries(r.quantityByUnit)
                        .map(([unit, qty]) => `${qty.toLocaleString()} ${unit}`)
                        .join(' + ')}{' '}
                      · {r.count} รายการซื้อ
                    </p>
                  </div>
                  <p className="shrink-0 font-bold text-gray-700">{r.amount.toLocaleString()} บาท</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
              <p className="text-xs font-semibold text-gray-500">รวมทั้งหมด</p>
              <p className="text-sm font-extrabold text-gray-900">{total.toLocaleString()} บาท</p>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <SecondaryButton onClick={handlePrint} className="no-print">
            ปริ้นรายงาน
          </SecondaryButton>
        )}
      </main>
    </div>
  );
}
