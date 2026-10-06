'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { Header } from '@/components/Header';
import { EmptyState, SecondaryButton } from '@/components/ui';
import { PurchaseOrderStatusBadge } from '@/components/StatusBadge';
import { formatThaiDate, formatThaiDateTime, formatThaiMonthYear, getEmployeeName, hexToRgba, supplierColor } from '@/lib/derive';
import type { Employee, PurchaseOrder, PurchaseOrderStatus } from '@/lib/types';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function poTotal(po: PurchaseOrder) {
  return po.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
}

const poStatusLabels: Record<PurchaseOrderStatus, string> = {
  draft: 'ร่าง',
  sent: 'ส่งให้ผู้ขายแล้ว',
  confirmed: 'ผู้ขายยืนยันแล้ว',
  received: 'รับสินค้าแล้ว',
  cancelled: 'ยกเลิก',
};

type BreakdownView = 'supplier' | 'category' | 'item';

type BreakdownRow = {
  key: string;
  label: string;
  quantityByUnit: Record<string, number> | null;
  orderCount: number;
  amount: number;
  /** สีประจำผู้ขาย — ตั้งเฉพาะมุมมอง "ตามผู้ขาย" เพื่อให้แถบสีตรงกับหน้าสั่งซื้อ/ใบสั่งซื้อ */
  color?: string;
};

export default function PurchaseReportPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { purchaseOrders, suppliers, employees, stockItems, stockCategories } = useAppState();

  const [month, setMonth] = useState(currentMonth());
  const [view, setView] = useState<BreakdownView>('supplier');

  const prevMonth = useMemo(() => shiftMonthKey(month, -1), [month]);

  const monthOrders = useMemo(
    () =>
      purchaseOrders
        .filter((po) => po.orderDate.startsWith(month) && po.status !== 'cancelled')
        .sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : 0)),
    [purchaseOrders, month]
  );

  const prevMonthOrders = useMemo(
    () => purchaseOrders.filter((po) => po.orderDate.startsWith(prevMonth) && po.status !== 'cancelled'),
    [purchaseOrders, prevMonth]
  );

  const total = useMemo(() => monthOrders.reduce((sum, po) => sum + poTotal(po), 0), [monthOrders]);
  const prevTotal = useMemo(() => prevMonthOrders.reduce((sum, po) => sum + poTotal(po), 0), [prevMonthOrders]);

  const hasPrevData = prevMonthOrders.length > 0;
  const diff = total - prevTotal;
  const diffPct = prevTotal > 0 ? (diff / prevTotal) * 100 : total > 0 ? 100 : 0;

  const receivedCount = monthOrders.filter((po) => po.status === 'received').length;
  const supplierCountUsed = useMemo(() => new Set(monthOrders.map((po) => po.supplierId)).size, [monthOrders]);
  const avgPerOrder = monthOrders.length > 0 ? total / monthOrders.length : 0;

  function supplierName(id: string) {
    return suppliers.find((s) => s.id === id)?.name ?? 'ไม่ระบุผู้ขาย';
  }

  function supplierColorById(id: string) {
    return supplierColor(suppliers.find((s) => s.id === id) ?? null);
  }

  const supplierRows: BreakdownRow[] = useMemo(() => {
    const map = new Map<string, BreakdownRow>();
    for (const po of monthOrders) {
      const key = po.supplierId;
      const amount = poTotal(po);
      const existing = map.get(key);
      if (existing) {
        existing.amount += amount;
        existing.orderCount += 1;
      } else {
        map.set(key, {
          key,
          label: supplierName(key),
          quantityByUnit: null,
          orderCount: 1,
          amount,
          color: supplierColorById(key),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthOrders, suppliers]);

  const itemBreakdown = useMemo(() => {
    function build(mode: 'category' | 'item'): BreakdownRow[] {
      const map = new Map<string, BreakdownRow>();
      for (const po of monthOrders) {
        for (const it of po.items) {
          let key: string;
          let label: string;
          if (mode === 'category') {
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
            existing.orderCount += 1;
            existing.quantityByUnit![it.unit] = (existing.quantityByUnit![it.unit] ?? 0) + it.quantity;
          } else {
            map.set(key, { key, label, quantityByUnit: { [it.unit]: it.quantity }, orderCount: 1, amount });
          }
        }
      }
      return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    }
    return { category: build('category'), item: build('item') };
  }, [monthOrders, stockItems, stockCategories]);

  function handlePrint() {
    if (typeof window !== 'undefined') window.print();
  }

  function shiftMonth(delta: number) {
    setMonth((m) => shiftMonthKey(m, delta));
  }

  const printedAt = new Date();

  return (
    <div>
      <Header
        title="สรุปการซื้อรายเดือน"
        subtitle="ภาพรวม แยกตามผู้ขาย/หมวดหมู่/รายการ และรายการใบสั่งซื้อทั้งหมด"
        currentEmployee={employee}
        onBack={() => router.push('/purchase-orders')}
      />
      <main className="mx-auto max-w-app space-y-4 px-4 py-4 print:max-w-none print:px-0">
        <div className="no-print flex items-center justify-between rounded-2xl bg-white p-3 shadow-card">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded-full bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-100"
          >
            ก่อนหน้า
          </button>
          <p className="text-sm font-bold text-gray-800">{formatThaiMonthYear(month)}</p>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded-full bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-100"
          >
            ถัดไป
          </button>
        </div>

        <div className="hidden print:block">
          <p className="text-lg font-extrabold text-gray-900">Rowhou8e — รายงานสรุปใบสั่งซื้อประจำเดือน</p>
          <p className="text-sm text-gray-700">{formatThaiMonthYear(month)}</p>
          <p className="text-xs text-gray-500">
            พิมพ์เมื่อ {formatThaiDateTime(printedAt.toISOString())} · จัดทำโดย {employee?.name ?? '-'}
          </p>
        </div>

        {monthOrders.length === 0 ? (
          <EmptyState icon="🧾" title="ไม่มีข้อมูลการซื้อในเดือนนี้" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 print:grid-cols-4 print:gap-3 print:break-inside-avoid">
              <SummaryCard label="ยอดซื้อรวม" value={`${total.toLocaleString()} บาท`} />
              <SummaryCard
                label="เทียบเดือนก่อน"
                value={
                  hasPrevData
                    ? `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toLocaleString()} บาท (${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%)`
                    : 'ไม่มีข้อมูลเดือนก่อน'
                }
                tone={hasPrevData ? (diff > 0 ? 'warn' : diff < 0 ? 'ok' : 'idle') : 'idle'}
              />
              <SummaryCard
                label="จำนวนใบสั่งซื้อ"
                value={`${monthOrders.length} ใบ`}
                hint={`รับสินค้าแล้ว ${receivedCount} ใบ`}
              />
              <SummaryCard
                label="ผู้ขายที่สั่งซื้อ"
                value={`${supplierCountUsed} ราย`}
                hint={`เฉลี่ย ${Math.round(avgPerOrder).toLocaleString()} บาท/ใบ`}
              />
            </div>

            <div className="no-print flex gap-2">
              <ViewTab label="ตามผู้ขาย" active={view === 'supplier'} onClick={() => setView('supplier')} />
              <ViewTab label="ตามหมวดหมู่" active={view === 'category'} onClick={() => setView('category')} />
              <ViewTab label="ตามรายการสินค้า" active={view === 'item'} onClick={() => setView('item')} />
            </div>

            <BreakdownTable
              title="สรุปแยกตามผู้ขาย"
              rows={supplierRows}
              total={total}
              countLabel="ใบสั่งซื้อ"
              className={view === 'supplier' ? '' : 'hidden print:block'}
            />
            <BreakdownTable
              title="สรุปแยกตามหมวดหมู่สินค้า"
              rows={itemBreakdown.category}
              total={total}
              countLabel="รายการซื้อ"
              className={view === 'category' ? '' : 'hidden print:block'}
            />
            <BreakdownTable
              title="สรุปแยกตามรายการสินค้า"
              rows={itemBreakdown.item}
              total={total}
              countLabel="รายการซื้อ"
              className={view === 'item' ? '' : 'hidden print:block'}
            />

            <OrderDetailTable
              orders={monthOrders}
              supplierName={supplierName}
              supplierColorById={supplierColorById}
              employees={employees}
              total={total}
            />

            <SecondaryButton onClick={handlePrint} className="no-print">
              ปริ้นรายงาน
            </SecondaryButton>
          </>
        )}
      </main>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}

function ViewTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-2xl py-2.5 text-sm font-bold ${
        active ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 shadow-card'
      }`}
    >
      {label}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'idle',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn' | 'idle';
}) {
  const valueTone = { ok: 'text-status-ok', warn: 'text-status-warn', idle: 'text-gray-900' }[tone];
  return (
    <div className="rounded-2xl bg-white p-3 shadow-card print:rounded-none print:border print:border-gray-200 print:p-2.5 print:shadow-none">
      <p className="text-[11px] font-semibold text-gray-500 print:text-[10px]">{label}</p>
      <p className={`mt-0.5 text-sm font-extrabold leading-tight ${valueTone} print:text-[13px]`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  total,
  countLabel,
  className = '',
}: {
  title: string;
  rows: BreakdownRow[];
  total: number;
  countLabel: string;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-card print:break-inside-avoid print:rounded-none print:border print:border-gray-200 print:p-3 print:shadow-none ${className}`}>
      <p className="mb-2 text-sm font-bold text-gray-800">{title}</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.key}
            className={`flex items-center justify-between border-b border-gray-50 py-1.5 pr-1 text-xs last:border-0 ${
              r.color ? 'border-l-4 pl-2' : ''
            }`}
            style={r.color ? { borderLeftColor: r.color, backgroundColor: hexToRgba(r.color, 0.05) } : undefined}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {r.color && <span className="h-2 w-2 shrink-0 rounded-full print:hidden" style={{ backgroundColor: r.color }} />}
                <p className="truncate font-semibold text-gray-800">{r.label}</p>
              </div>
              <p className="text-gray-400">
                {r.quantityByUnit &&
                  `${Object.entries(r.quantityByUnit)
                    .map(([unit, qty]) => `${qty.toLocaleString()} ${unit}`)
                    .join(' + ')} · `}
                {r.orderCount} {countLabel}
                {total > 0 && ` · ${((r.amount / total) * 100).toFixed(1)}%`}
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
  );
}

function OrderDetailTable({
  orders,
  supplierName,
  supplierColorById,
  employees,
  total,
}: {
  orders: PurchaseOrder[];
  supplierName: (id: string) => string;
  supplierColorById: (id: string) => string;
  employees: Employee[];
  total: number;
}) {
  return (
    <div className="print:break-inside-avoid-page rounded-2xl bg-white p-4 shadow-card print:rounded-none print:border print:border-gray-200 print:p-3 print:shadow-none">
      <p className="mb-2 text-sm font-bold text-gray-800">รายละเอียดใบสั่งซื้อทั้งหมด ({orders.length} ใบ)</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs print:min-w-0">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1.5 pr-2 font-semibold">วันที่สั่ง</th>
              <th className="py-1.5 pr-2 font-semibold">ผู้ขาย</th>
              <th className="py-1.5 pr-2 font-semibold">สถานะ</th>
              <th className="py-1.5 pr-2 text-right font-semibold">จำนวนรายการ</th>
              <th className="py-1.5 pr-2 text-right font-semibold">ยอดรวม (บาท)</th>
              <th className="py-1.5 pr-2 font-semibold">วันที่รับของ</th>
              <th className="py-1.5 font-semibold">ผู้สั่ง</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((po) => (
              <tr key={po.id} className="border-b border-gray-50 last:border-0">
                <td className="whitespace-nowrap py-1.5 pr-2 text-gray-700">{formatThaiDate(po.orderDate)}</td>
                <td className="py-1.5 pr-2 text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full print:hidden"
                      style={{ backgroundColor: supplierColorById(po.supplierId) }}
                    />
                    {supplierName(po.supplierId)}
                  </span>
                </td>
                <td className="py-1.5 pr-2">
                  <span className="print:hidden">
                    <PurchaseOrderStatusBadge status={po.status} />
                  </span>
                  <span className="hidden text-gray-700 print:inline">{poStatusLabels[po.status]}</span>
                </td>
                <td className="py-1.5 pr-2 text-right text-gray-700">{po.items.length}</td>
                <td className="py-1.5 pr-2 text-right font-semibold text-gray-800">{poTotal(po).toLocaleString()}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-gray-700">
                  {po.receivedAt ? formatThaiDate(po.receivedAt) : '-'}
                </td>
                <td className="py-1.5 text-gray-700">{getEmployeeName(employees, po.createdBy)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-2 text-right text-xs font-semibold text-gray-500">
                รวมทั้งหมด
              </td>
              <td className="pt-2 text-right text-sm font-extrabold text-gray-900">{total.toLocaleString()}</td>
              <td colSpan={2} className="pt-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
