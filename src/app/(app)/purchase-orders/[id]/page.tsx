'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { PurchaseOrderStatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/ui';
import { formatThaiDate, formatThaiDateTime, getEmployeeName, latestSupplierPricesForItem } from '@/lib/derive';
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
  const { purchaseOrders, suppliers, employees, stockItems, stockCategories, supplierItemPrices } = useAppState();

  const po = purchaseOrders.find((p) => p.id === params.id);
  const canManage = employee?.role === 'owner' || employee?.role === 'manager';
  const [generatingImage, setGeneratingImage] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [newItemStockId, setNewItemStockId] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

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

  const supplierStockItems = stockItems
    .filter((it) => it.active && it.supplierId === po.supplierId)
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));

  function defaultPriceFor(stockItemId: string): number | '' {
    const latest = latestSupplierPricesForItem(supplierItemPrices, stockItemId).find(
      (p) => p.supplierId === po!.supplierId
    );
    return latest ? latest.price : '';
  }

  async function handleAddItem() {
    if (!employee || !po) return;
    const stockItem = stockItems.find((it) => it.id === newItemStockId);
    if (!stockItem) return;
    const quantity = Number(newItemQty);
    const unitPrice = Number(newItemPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
    setAddingItem(true);
    try {
      await store.addPurchaseOrderItem({
        purchaseOrderId: po.id,
        stockItemId: stockItem.id,
        itemName: stockItem.name,
        quantity,
        unit: stockItem.unit,
        unitPrice,
        actorId: employee.id,
      });
      setNewItemStockId('');
      setNewItemQty('1');
      setNewItemPrice('');
    } finally {
      setAddingItem(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!employee || !po) return;
    if (typeof window !== 'undefined' && !window.confirm('ลบรายการนี้ออกจากใบสั่งซื้อ?')) return;
    setRemovingItemId(itemId);
    try {
      await store.removePurchaseOrderItem(po.id, itemId, employee.id);
    } finally {
      setRemovingItemId(null);
    }
  }

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
            {po.status === 'draft' && (
              <button
                type="button"
                onClick={() => handleRemoveItem(it.id)}
                disabled={removingItemId === it.id}
                className="ml-2 shrink-0 rounded-lg border border-status-danger px-2 py-1 text-[11px] font-bold text-status-danger active:bg-status-dangerBg disabled:opacity-50"
              >
                {removingItemId === it.id ? '...' : 'ลบ'}
              </button>
            )}
          </div>
        ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
            <p className="text-xs font-semibold text-gray-500">รวมทั้งหมด</p>
            <p className="text-sm font-extrabold text-gray-900">{total.toLocaleString()} บาท</p>
          </div>

        {po.status === 'draft' && (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            <p className="text-xs font-bold text-gray-700">เพิ่มรายการวัตถุดิบจาก{supplier?.name ?? 'ผู้ขายรายนี้'}</p>
            {supplierStockItems.length === 0 ? (
              <p className="text-[11px] text-gray-400">ไม่มีวัตถุดิบที่ผูกกับผู้ขายรายนี้ — ตั้งค่าผู้ขายของวัตถุดิบได้ที่หน้าตั้งค่า</p>
            ) : (
              <div className="space-y-2">
                <select
                  value={newItemStockId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setNewItemStockId(id);
                    const price = defaultPriceFor(id);
                    setNewItemPrice(price === '' ? '' : String(price));
                  }}
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-700"
                >
                  <option value="">เลือกวัตถุดิบ...</option>
                  {supplierStockItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.unit})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    placeholder="จำนวน"
                    className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-xs text-gray-700"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    placeholder="ราคา/หน่วย"
                    className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-xs text-gray-700"
                  />
                  <span className="text-[11px] text-gray-400">บาท</span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!newItemStockId || addingItem}
                    className="ml-auto shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white active:bg-brand-700 disabled:opacity-50"
                >
                  {addingItem ? 'กำลังเพิ่ม...' : '+ เพิ่ม'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
