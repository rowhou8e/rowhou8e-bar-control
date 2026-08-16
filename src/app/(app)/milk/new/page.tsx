'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { PhotoAttach, PrimaryButton } from '@/components/ui';
import { formatThaiDateTime } from '@/lib/derive';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** บันทึกล็อตการผลิตใหม่ — แทนหน้า "บันทึกการต้มนม" เดิม ใช้ได้กับสินค้าทุกชนิดที่แผนกผลิตได้ */
export default function NewProductLotPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { products } = useAppState();

  // staff เห็นเฉพาะสินค้าของแผนกตัวเอง — owner/manager เลือกได้ทุกแผนก
  const availableProducts = useMemo(() => {
    if (!employee) return products;
    if (employee.role === 'owner' || employee.role === 'manager') return products;
    return products.filter((p) => p.stationId === employee.stationId);
  }, [products, employee]);

  const now = new Date();
  const [productId, setProductId] = useState('');
  const [date, setDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [time, setTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // staff เพิ่ม "สินค้าที่ผลิต" ของแผนกตัวเองได้เอง โดยไม่ต้องรอผู้จัดการ/เจ้าของร้านตั้งค่าให้ก่อน
  const canAddOwnProduct = employee?.role === 'staff';
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('');
  const [newProductShelfLifeDays, setNewProductShelfLifeDays] = useState('3');
  const [addingProduct, setAddingProduct] = useState(false);
  const [pendingProductName, setPendingProductName] = useState<string | null>(null);

  useEffect(() => {
    if (!productId && availableProducts.length > 0) {
      setProductId(availableProducts[0].id);
      setUnit(availableProducts[0].unit);
    }
  }, [availableProducts, productId]);

  // เมื่อสินค้าที่เพิ่งเพิ่มมาถึง (หลัง refetch) ให้เลือกให้อัตโนมัติ
  useEffect(() => {
    if (!pendingProductName) return;
    const created = availableProducts.find((p) => p.name === pendingProductName);
    if (created) {
      setProductId(created.id);
      setUnit(created.unit);
      setPendingProductName(null);
    }
  }, [availableProducts, pendingProductName]);

  const selectedProduct = availableProducts.find((p) => p.id === productId);

  const previewExpiry = useMemo(() => {
    if (!date || !time || !selectedProduct) return null;
    const producedAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(producedAt.getTime())) return null;
    return new Date(producedAt.getTime() + selectedProduct.shelfLifeDays * 24 * 60 * 60 * 1000);
  }, [date, time, selectedProduct]);

  const valid = productId && date && time && Number(quantity) > 0 && unit;

  function handleSubmit() {
    if (!employee || !valid) return;
    setSubmitting(true);
    store.createProductLot({
      productId,
      producedDate: date,
      producedTime: time,
      quantity: Number(quantity),
      unit,
      producedBy: employee.id,
      note,
      photoUrl,
    });
    router.replace('/milk');
  }

  async function handleAddProduct() {
    if (!employee || !employee.stationId || !newProductName.trim() || !newProductUnit.trim()) return;
    setAddingProduct(true);
    try {
      await store.createProduct({
        stationId: employee.stationId,
        name: newProductName.trim(),
        unit: newProductUnit.trim(),
        shelfLifeDays: Number(newProductShelfLifeDays) || 1,
        actorId: employee.id,
      });
      setPendingProductName(newProductName.trim());
      setNewProductName('');
      setNewProductUnit('');
      setNewProductShelfLifeDays('3');
      setShowAddProduct(false);
    } finally {
      setAddingProduct(false);
    }
  }

  function AddProductForm() {
    return (
      <div className="mt-3 space-y-2 rounded-xl bg-gray-50 p-2.5">
        <input
          value={newProductName}
          onChange={(e) => setNewProductName(e.target.value)}
          placeholder="ชื่อสินค้า เช่น นมต้ม"
          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <input
            value={newProductUnit}
            onChange={(e) => setNewProductUnit(e.target.value)}
            placeholder="หน่วย เช่น ลิตร"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <input
            type="number"
            min={1}
            value={newProductShelfLifeDays}
            onChange={(e) => setNewProductShelfLifeDays(e.target.value)}
            placeholder="อายุเก็บ (วัน)"
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
        </div>
        <button
          type="button"
          onClick={handleAddProduct}
          disabled={!newProductName.trim() || !newProductUnit.trim() || addingProduct}
          className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white disabled:opacity-40"
        >
          {addingProduct ? 'กำลังเพิ่ม...' : 'เพิ่มสินค้า'}
        </button>
      </div>
    );
  }

  if (availableProducts.length === 0) {
    return (
      <div>
        <Header title="บันทึกล็อตการผลิตใหม่" currentEmployee={employee} onBack={() => router.back()} />
        <main className="px-4 py-4">
          {canAddOwnProduct ? (
            <div className="rounded-2xl bg-white p-4 shadow-card">
              <p className="text-sm text-gray-500">แผนกนี้ยังไม่มีรายการสินค้าที่ผลิต — เพิ่มสินค้าแรกที่แผนกนี้ผลิตได้เลย</p>
              <AddProductForm />
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-4 text-center shadow-card">
              <p className="text-sm text-gray-500">แผนกนี้ยังไม่มีรายการสินค้าที่ผลิต — กรุณาให้ผู้จัดการ/เจ้าของร้านเพิ่มในหน้าตั้งค่าก่อน</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div>
      <Header title="บันทึกล็อตการผลิตใหม่" currentEmployee={employee} onBack={() => router.back()} />
      <main className="space-y-4 px-4 py-4">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-500">สินค้าที่ผลิต</label>
            {canAddOwnProduct && (
              <button
                type="button"
                onClick={() => setShowAddProduct((v) => !v)}
                className="text-[11px] font-semibold text-brand-600"
              >
                {showAddProduct ? 'ยกเลิก' : '+ เพิ่มสินค้าใหม่'}
              </button>
            )}
          </div>
          <select
            value={productId}
            onChange={(e) => {
              const p = availableProducts.find((x) => x.id === e.target.value);
              setProductId(e.target.value);
              if (p) setUnit(p.unit);
            }}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          >
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {canAddOwnProduct && showAddProduct && <AddProductForm />}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <label className="text-xs font-semibold text-gray-500">วันที่ผลิต</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <label className="text-xs font-semibold text-gray-500">เวลาที่ผลิต</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-card">
            <label className="text-xs font-semibold text-gray-500">จำนวนที่ผลิต</label>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
            />
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-card">
            <label className="text-xs font-semibold text-gray-500">หน่วย</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
            />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <label className="text-xs font-semibold text-gray-500">ชื่อผู้ผลิต</label>
          <p className="mt-1.5 text-sm font-semibold text-gray-900">{employee?.name ?? '-'}</p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <label className="text-xs font-semibold text-gray-500">หมายเหตุ (ถ้ามี)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="เช่น ผลิตเผื่อวันหยุดยาว"
            className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <label className="text-xs font-semibold text-gray-500">รูปภาพฉลากหรือภาชนะ</label>
          <div className="mt-2">
            <PhotoAttach value={photoUrl} onChange={setPhotoUrl} />
          </div>
        </div>

        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="text-xs font-semibold text-brand-700">ระบบคำนวณวันหมดอายุอัตโนมัติ</p>
          <p className="mt-1 text-xs text-gray-600">
            อายุการเก็บของ{selectedProduct?.name ?? 'สินค้านี้'}: {selectedProduct?.shelfLifeDays ?? '-'} วัน
          </p>
          <p className="mt-1.5 text-base font-extrabold text-brand-700">
            {previewExpiry ? formatThaiDateTime(previewExpiry.toISOString()) : '-'}
          </p>
        </div>

        <PrimaryButton onClick={handleSubmit} disabled={!valid || submitting}>
          บันทึกล็อตการผลิต
        </PrimaryButton>
      </main>
    </div>
  );
}
