'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { EmptyState } from '@/components/ui';
import { formatThaiDate, hexToRgba, supplierColor } from '@/lib/derive';
import type { StockItem, SupplierItemPrice } from '@/lib/types';

type SortMode = 'name' | 'stale';

/** หาราคาล่าสุดของวัตถุดิบชิ้นนี้ — เอาจากผู้ขายที่ผูกไว้ปัจจุบัน (stockItem.supplierId) ก่อนเสมอ
 *  ถ้าไม่เคยมีประวัติราคาจากผู้ขายปัจจุบันเลย (เช่นเพิ่งเปลี่ยนผู้ขาย) ให้ใช้ราคาล่าสุดที่เคยมี (จากผู้ขายเดิม) แทน
 *  พร้อมธงบอกว่าเป็นราคาจาก "ผู้ขายปัจจุบัน" จริงหรือเป็นของเก่าที่ตกค้างมา */
function latestPriceForItem(
  item: StockItem,
  prices: SupplierItemPrice[]
): { price: SupplierItemPrice; fromCurrentSupplier: boolean } | null {
  const pickLatest = (arr: SupplierItemPrice[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b));

  if (item.supplierId) {
    const fromCurrent = pickLatest(prices.filter((p) => p.stockItemId === item.id && p.supplierId === item.supplierId));
    if (fromCurrent) return { price: fromCurrent, fromCurrentSupplier: true };
  }
  const fallback = pickLatest(prices.filter((p) => p.stockItemId === item.id));
  return fallback ? { price: fallback, fromCurrentSupplier: false } : null;
}

function daysAgo(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

/** สีของ badge "อัปเดตล่าสุดกี่วันก่อน" — เขียว = สดใหม่, เหลือง = เริ่มเก่า, แดง = ควรเช็คราคาใหม่ได้แล้ว */
function staleToneClass(days: number): string {
  if (days <= 13) return 'bg-status-okBg text-status-ok';
  if (days <= 29) return 'bg-status-warnBg text-status-warn';
  return 'bg-status-dangerBg text-status-danger';
}

export default function PriceListPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { stockItems, suppliers, supplierItemPrices, stockCategories, now } = useAppState();
  const canManage = employee?.role === 'owner' || employee?.role === 'manager';

  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockItems
      .filter((it) => (supplierFilter === 'all' ? true : it.supplierId === supplierFilter))
      .filter((it) => (q ? it.name.toLowerCase().includes(q) : true))
      .map((it) => {
        const latest = latestPriceForItem(it, supplierItemPrices);
        const category = stockCategories.find((c) => c.id === it.categoryId);
        const supplier = suppliers.find((s) => s.id === it.supplierId);
        return { item: it, latest, category, supplier, days: latest ? daysAgo(latest.price.createdAt, now) : null };
      })
      .sort((a, b) => {
        if (sortMode === 'stale') {
          // ไม่มีราคาเลย = เก่าที่สุด (ควรรีบเติมราคาก่อนเพื่อน) ตามด้วยเรียงจากอัปเดตนานสุดไปใหม่สุด
          const da = a.days ?? Infinity;
          const db = b.days ?? Infinity;
          if (da !== db) return db - da;
        }
        return a.item.name.localeCompare(b.item.name, 'th');
      });
  }, [stockItems, suppliers, supplierItemPrices, stockCategories, now, search, supplierFilter, sortMode]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.category?.id ?? 'ไม่มีหมวดหมู่';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const categoryName = (id: string) => (id === 'ไม่มีหมวดหมู่' ? 'ไม่มีหมวดหมู่' : stockCategories.find((c) => c.id === id)?.name ?? id);
    return Array.from(map.entries())
      .map(([id, items]) => ({ id, name: categoryName(id), items }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [rows, stockCategories]);

  function startEdit(it: StockItem, latest: { price: SupplierItemPrice } | null) {
    setEditingId(it.id);
    setEditPrice(latest ? String(latest.price.price) : '');
    setEditUnit(latest ? latest.price.unit : it.unit);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPrice('');
    setEditUnit('');
  }

  async function saveEdit(it: StockItem) {
    if (!employee || !it.supplierId) return;
    const priceNum = Number(editPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0 || !editUnit.trim()) return;
    setSaving(true);
    try {
      await store.addSupplierItemPrice({
        supplierId: it.supplierId,
        stockItemId: it.id,
        unit: editUnit.trim(),
        price: priceNum,
        note: '',
        actorId: employee.id,
      });
      cancelEdit();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Header title="รายการราคา" subtitle="ราคาล่าสุดของวัตถุดิบทุกชิ้น" currentEmployee={employee} onBack={() => router.back()} />
      <main className="space-y-3 px-4 py-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อวัตถุดิบ..."
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400"
        />

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button
            onClick={() => setSupplierFilter('all')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              supplierFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 shadow-card'
            }`}
          >
            ผู้ขายทั้งหมด
          </button>
          {suppliers.map((s) => (
            <button
              key={s.id}
              onClick={() => setSupplierFilter(s.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                supplierFilter === s.id ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 shadow-card'
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: supplierColor(s) }} />
              {s.name}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">{rows.length} รายการ</p>
          <button
            onClick={() => setSortMode((m) => (m === 'name' ? 'stale' : 'name'))}
            className="text-xs font-semibold text-brand-600"
          >
            {sortMode === 'name' ? 'เรียงตามชื่อ · เปลี่ยนเป็นไม่อัปเดตนานสุดก่อน' : 'เรียงตามไม่อัปเดตนานสุดก่อน · เปลี่ยนเป็นเรียงตามชื่อ'}
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="💰" title="ไม่พบวัตถุดิบที่ตรงกับเงื่อนไข" />
        ) : (
          grouped.map((group) => (
            <div key={group.id} className="rounded-2xl bg-white p-4 shadow-card">
              <p className="mb-2 text-xs font-bold text-gray-700">
                {group.name} ({group.items.length})
              </p>
              <div className="space-y-2">
                {group.items.map(({ item, latest, supplier, days }) => (
                  <div key={item.id} className="border-b border-gray-50 pb-2 text-xs last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-800">{item.name}</p>
                        {item.packNote && <p className="truncate text-[10px] text-gray-400">📝 {item.packNote}</p>}
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                          {supplier ? (
                            <>
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: supplierColor(supplier) }} />
                              <span className="truncate">{supplier.name}</span>
                            </>
                          ) : (
                            <span className="text-status-danger">ยังไม่ได้ระบุผู้ขาย</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {latest ? (
                          <>
                            <p className="font-bold text-gray-900">
                              {latest.price.price.toLocaleString()} บาท/{latest.price.unit}
                            </p>
                            <div className="mt-0.5 flex items-center justify-end gap-1">
                              {!latest.fromCurrentSupplier && (
                                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-400">
                                  ผู้ขายเดิม
                                </span>
                              )}
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${staleToneClass(days ?? 0)}`}>
                                {days === 0 ? 'วันนี้' : `${days} วันก่อน`}
                              </span>
                            </div>
                          </>
                        ) : (
                          <span className="rounded-full bg-status-dangerBg px-2 py-0.5 text-[10px] font-semibold text-status-danger">
                            ยังไม่มีราคา
                          </span>
                        )}
                      </div>
                    </div>

                    {canManage && item.supplierId && (
                      <div className="mt-1.5">
                        {editingId === item.id ? (
                          <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 p-1.5">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              placeholder="ราคา"
                              className="w-20 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-right text-[11px]"
                            />
                            <span className="text-[10px] text-gray-400">บาท /</span>
                            <input
                              type="text"
                              value={editUnit}
                              onChange={(e) => setEditUnit(e.target.value)}
                              placeholder="หน่วย"
                              className="w-16 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px]"
                            />
                            <button
                              onClick={() => saveEdit(item)}
                              disabled={saving}
                              className="ml-auto shrink-0 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                            >
                              {saving ? '...' : 'บันทึก'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(item, latest)} className="text-[10px] font-semibold text-brand-600">
                            ✎ บันทึกราคาใหม่
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
