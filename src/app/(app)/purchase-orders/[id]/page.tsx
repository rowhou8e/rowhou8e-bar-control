'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { PurchaseOrderStatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/ui';
import { formatThaiDate, formatThaiDateTime, getEmployeeName } from '@/lib/derive';
import { downloadPurchaseOrderImage, sharePurchaseOrderImage } from '@/lib/order-image';
import type { PurchaseOrderStatus } from '@/lib/types';

const NEXT_STATUS: Partial<Record<PurchaseOrderStatus, { status: PurchaseOrderStatus; label: string; className: string }>> = {
  draft: { status: 'sent', label: 'ทำเครื่องหมายว่าส่งให้ผู้ขายแล้ว', className: 'bg-sky-600 active:bg-sky-700' },
  sent: { status: 'confirmed', label: 'ผู้ขายยืนยันรับออเดอร์แล้ว', className: 'bg-sky-600 active:bg-sky-700' },
  confirmed: { status: 'received', label: 'รับสินค้าแล้ว (เพิ่มเข้าสต๊อก)', className: 'bg-brand-600 active:bg-brand-700' },
};

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const employee = useCurrentEmployee();
  const { purchaseOrders, suppliers, employees, stockItems, stockCategories } = useAppState();

  const po = purchaseOrders.find((p) => p.id === params.id);
  const canManage = employee?.role === 'owner' || employee?.role === 'manager';
  const [generatingImage, setGeneratingImage] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);

  if (!po) {
    return (
      <div>
        <Header title="ไม่พบใบสั่งซื้อ" currentEmployee={employee} onBack={() => router.back()} />
        <main className="px-4 py-6">
          <EmptyState title="ไม่พบข้อมูลใบสั่งซื้อนี้" />
        </main>
      </div>
    );
  }

  const supplier = suppliers.find((s) => s.id === po.supplierId);
  const total = po.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const next = NEXT_STATUS[po.status];
  const canCancel = po.status === 'draft' || po.status === 'sent' || po.status === 'confirmed';
  const canEditPrice = po.status !== 'cancelled';

  function handleAdvance() {
    if (!employee || !next) return;
    store.updatePurchaseOrderStatus(po!.id, next.status, employee.id);
  }

  function handleCancel() {
    if (!employee) return;
    if (typeof window !== 'undefined' && !window.confirm('ยกเลิกใบสั่งซื้อนี้? รายการเสนอซื้อต้นทางจะกลับไปเป็นสถานะ "อนุมัติแล้ว"')) return;
    store.updatePurchaseOrderStatus(po!.id, 'cancelled', employee.id);
  }

  function handleTotalPriceCommit(itemId: string, quantity: number, rawValue: string) {
    if (!employee) return;
    const totalPrice = Number(rawValue);
    if (!Number.isFinite(totalPrice) || totalPrice < 0) return;
    const item = po!.items.find((it) => it.id === itemId);
    if (!item) return;
    const unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice;
    if (item.unitPrice === unitPrice) return;
    store.updatePurchaseOrderItemPrice(po!.id, itemId, unitPrice, employee.id);
  }

  async function handleDownloadImage() {
    if (!po || generatingImage) return;
    setGeneratingImage(true);
    try {
      await downloadPurchaseOrderImage(po, supplier, employees, stockItems, stockCategories);
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handleShareImage() {
    if (!po || sharingImage) return;
    setSharingImage(true);
    try {
      await sharePurchaseOrderImage(po, supplier, employees, stockItems, stockCategories);
    } finally {
      setSharingImage(false);
    }
  }

  return (
    <div>
      <Header title={supplier?.name ?? 'ใบสั่งซื้อ'} subtitle={formatThaiDate(po.orderDate)} currentEmployee={employee} onBack={() => router.back()} />
      <main className="space-y-4 px-4 py-4">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">{supplier?.name ?? 'ไม่ระบุผู้ขาย'}</p>
            <PurchaseOrderStatusBadge status={po.status} />
          </div>
          {(supplier?.contactPerson || supplier?.phone) && (
            <p className="mt-1 text-xs text-gray-400">
              {supplier?.contactPerson}
              {supplier?.contactPerson && supplier?.phone ? ' · ' : ''}
              {supplier?.phone}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-400">สร้างโดย</p>
              <p className="font-semibold text-gray-700">{getEmployeeName(employees, po.createdBy)}</p>
            </div>
            <div>
              <p className="text-gray-400">สร้างเมื่อ</p>
              <p className="font-semibold text-gray-700">{formatThaiDateTime(po.createdAt)}</p>
            </div>
            {po.sentAt && (
              <div>
                <p className="text-gray-400">ส่งให้ผู้ขายเมื่อ</p>
                <p className="font-semibold text-gray-700">{formatThaiDateTime(po.sentAt)}</p>
              </div>
            )}
            {po.receivedAt && (
              <div>
                <p className="text-gray-400">รับสินค้าเมื่อ</p>
                <p className="font-semibold text-gray-700">
                  {formatThaiDateTime(po.receivedAt)} · {getEmployeeName(employees, po.receivedBy)}
                </p>
              </div>
            )}
          </div>
          {po.note && <p className="mt-3 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-500">หมายเหตุ: {po.note}</p>}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="mb-2 text-xs font-bold text-gray-700">รายการสินค้า ({po.items.length} รายการ)</p>
      {canEditPrice && (
        <p className="-mt-1 mb-2 text-[11px] text-gray-400">
          แตะยอดรวมเพื่อแก้ไขราคาให้ตรงกับที่ซื้อจริง เช่น กรณีสินค้ามาเกินจำนวนที่สั่ง
        </p>
      )}
          <div className="space-y-2">
        {po.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between border-b border-gray-50 pb-2 text-xs last:border-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-800">{it.itemName}</p>
              <p className="mt-1 text-gray-400">
                {it.quantity} {it.unit}
              </p>
            </div>
            {canEditPrice ? (
              <div className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  defaultValue={it.quantity * it.unitPrice}
                  onBlur={(e) => handleTotalPriceCommit(it.id, it.quantity, e.target.value)}
                  className="w-24 rounded-lg border border-gray-200 px-1.5 py-0.5 text-right text-xs font-bold text-gray-700"
                />
                <span className="text-gray-500">บาท</span>
              </div>
            ) : (
              <p className="shrink-0 font-bold text-gray-700">{(it.quantity * it.unitPrice).toLocaleString()} บาท</p>
            )}
          </div>
        ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
            <p className="text-xs font-semibold text-gray-500">รวมทั้งหมด</p>
            <p className="text-sm font-extrabold text-gray-900">{total.toLocaleString()} บาท</p>
          </div>
        </div>

        <button
          onClick={handleDownloadImage}
          disabled={generatingImage}
          className="w-full rounded-2xl border border-brand-200 bg-brand-50 py-3 text-sm font-bold text-brand-700 active:bg-brand-100 disabled:opacity-50"
        >
          {generatingImage ? 'กำลังสร้างรูปภาพ...' : '📷 บันทึกเป็นรูปภาพ (ส่งให้ผู้ขาย)'}
        </button>

        <button
          onClick={handleShareImage}
          disabled={sharingImage}
          className="mt-2 w-full rounded-2xl bg-[#06C755] py-3 text-sm font-bold text-white active:bg-[#05b34c] disabled:opacity-50"
        >
          {sharingImage ? 'กำลังเตรียมรูปภาพ...' : '💬 แชร์ไปยัง LINE'}
        </button>

        {canManage && (next || canCancel) && (
          <div className="space-y-2">
            {next && (
              <button onClick={handleAdvance} className={`w-full rounded-2xl py-3.5 text-sm font-bold text-white ${next.className}`}>
                {next.label}
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                className="w-full rounded-2xl border border-status-danger py-3.5 text-sm font-bold text-status-danger active:bg-status-dangerBg"
              >
                ยกเลิกใบสั่งซื้อ
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
