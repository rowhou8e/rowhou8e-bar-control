'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { EmptyState, PrimaryButton } from '@/components/ui';
import { latestSupplierPricesForItem, toDateStr } from '@/lib/derive';
import type { StockItem } from '@/lib/types';

/**
 * หน้า "สั่งสินค้า" — เปิดให้พนักงานทุกคนสั่งซื้อได้เอง (ไม่ใช่แค่เจ้าของ/ผู้จัดการ)
 * ผู้ขายของแต่ละวัตถุดิบถูกกำหนดไว้ล่วงหน้าโดยเจ้าของ/ผู้จัดการแล้ว (ที่หน้า "ตั้งค่าระบบ")
 * พนักงานแค่ติ๊กเลือก + ใส่จำนวนที่จะสั่งเท่านั้น ไม่ต้องเลือกผู้ขายเอง — ออกแบบให้กรอกได้เร็วเวลาต้องสั่งของทีละหลายรายการ
 * รายการที่ยังไม่ได้กำหนดผู้ขายจะไม่แสดงในหน้านี้ (ต้องให้เจ้าของ/ผู้จัดการไปกำหนดที่หน้าตั้งค่าก่อน)
 *
 * โครงสร้างหน้าจอ: เลือก "ผู้ขาย" ก่อนเป็นลำดับแรก (แท็บด้านบน) เพื่อไม่ให้พนักงานสับสนว่าของชิ้นไหนสั่งจากใคร
 * จากนั้นค่อยกรองย่อยด้วย "หมวดหมู่" ภายในผู้ขายรายนั้นอีกที (เช่น ขนมปัง/ของสด/ของแช่แข็ง/บรรจุภัณฑ์/ไซรัป/แป้ง/นม/จิปาถะ)
 * พนักงานเลือกได้จากหลายผู้ขายในการสั่งครั้งเดียว (สลับแท็บไปมาได้ รายการที่เลือกไว้จะไม่หาย) แล้วระบบจะแยกใบสั่งซื้อให้อัตโนมัติตามผู้ขายตอนบันทึก
 */
export default function OrderPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const { stockItems, stockCategories, suppliers, supplierItemPrices, now } = useAppState();

  const canManage = employee?.role === 'owner' || employee?.role === 'manager';

  const [qty, setQty] = useState<Record<string, string>>({});
  const [priceOverride, setPriceOverride] = useState<Record<string, string>>({});
  const [orderDate, setOrderDate] = useState(toDateStr(now));
  const [activeSupplierId, setActiveSupplierId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategoryId, setNewItemCategoryId] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [addItemError, setAddItemError] = useState('');

  // ค่าใช้จ่ายอื่นๆ — รายการที่ไม่ใช่วัตถุดิบในสต็อก พนักงานกรอกชื่อ+ราคาเอง (เช่น ค่าเดินทาง ค่าน้ำแข็ง ค่าถุง)
  const [customItems, setCustomItems] = useState<Array<{ id: string; supplierId: string; name: string; unitPrice: string }>>([]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpensePrice, setNewExpensePrice] = useState('');
  const [expenseError, setExpenseError] = useState('');

  // ซ่อนรายการที่เจ้าของ/ผู้จัดการยังไม่ได้กำหนดผู้ขายไว้ — พนักงานสั่งซื้อรายการเหล่านี้ไม่ได้
  const orderableItems = useMemo(() => stockItems.filter((it) => !!it.supplierId), [stockItems]);
  const unassignedCount = stockItems.length - orderableItems.length;

  // ผู้ขายที่มีวัตถุดิบให้สั่งได้อย่างน้อย 1 รายการ — เรียงตามชื่อ ให้เป็นลำดับแรกที่พนักงานต้องเลือก
  const suppliersWithItems = useMemo(() => {
    const ids = new Set(orderableItems.map((it) => it.supplierId as string));
    return suppliers.filter((s) => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [suppliers, orderableItems]);

  // ผู้ขายที่กำลังดูอยู่ — ถ้ายังไม่เคยเลือก ให้ default เป็นรายแรกในลิสต์ (ไม่ใช้ useEffect เพื่อกันบั๊ก state ค้าง)
  const currentSupplierId = activeSupplierId && suppliersWithItems.some((s) => s.id === activeSupplierId)
    ? activeSupplierId
    : (suppliersWithItems[0]?.id ?? null);

  const supplierItems = useMemo(
    () => orderableItems.filter((it) => it.supplierId === currentSupplierId),
    [orderableItems, currentSupplierId]
  );

  // หมวดหมู่ย่อยที่ปรากฏจริงในวัตถุดิบของผู้ขายรายนี้เท่านั้น (ไม่โชว์หมวดที่ผู้ขายรายนี้ไม่มีของ)
  const categoriesForSupplier = useMemo(() => {
    const ids = new Set(supplierItems.map((it) => it.categoryId));
    return stockCategories.filter((c) => ids.has(c.id));
  }, [supplierItems, stockCategories]);

  const filteredItems = useMemo(() => {
    return supplierItems.filter((it) => {
      if (categoryFilter !== 'all' && it.categoryId !== categoryFilter) return false;
      if (query && !it.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [supplierItems, categoryFilter, query]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    for (const it of filteredItems) {
      const arr = map.get(it.categoryId) ?? [];
      arr.push(it);
      map.set(it.categoryId, arr);
    }
    return map;
  }, [filteredItems]);

  function effectivePrice(item: StockItem): string {
    if (priceOverride[item.id] !== undefined) return priceOverride[item.id];
    if (item.supplierId) {
      const latest = latestSupplierPricesForItem(supplierItemPrices, item.id).find((p) => p.supplierId === item.supplierId);
      if (latest) return String(latest.price);
    }
    return '';
  }

  function setItemQty(id: string, value: string) {
    setQty((q) => ({ ...q, [id]: value }));
  }

  function selectAllFiltered() {
    setQty((q) => {
      const next = { ...q };
      for (const it of filteredItems) {
        if (!(Number(next[it.id]) > 0)) next[it.id] = '1';
      }
      return next;
    });
  }

  function clearAllSelected() {
    setQty((q) => {
      const next = { ...q };
      for (const it of filteredItems) delete next[it.id];
      return next;
    });
  }

  function selectedCountForSupplier(supplierId: string) {
    return orderableItems.filter((it) => it.supplierId === supplierId && Number(qty[it.id]) > 0).length;
  }

  const selectedItems = orderableItems.filter((it) => Number(qty[it.id]) > 0);

  // แยกรายการที่เลือกไว้ตามผู้ขาย (ผู้ขายถูกกำหนดไว้ล่วงหน้าแล้ว ไม่มีกรณี "ยังไม่ระบุผู้ขาย" อีกต่อไป)
  // — คงไว้ทั้งหมด ไม่ใช่แค่ผู้ขายที่กำลังดูอยู่ เพราะพนักงานสลับแท็บผู้ขายไปมาเลือกของหลายเจ้าในครั้งเดียวได้
  const groups = new Map<string, StockItem[]>();
  for (const it of selectedItems) {
    const key = it.supplierId as string;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const groupList = Array.from(groups.entries());

  function itemTotal(it: StockItem) {
    return (Number(qty[it.id]) || 0) * (Number(effectivePrice(it)) || 0);
  }

  function groupTotal(items: StockItem[]) {
    return items.reduce((sum, it) => sum + itemTotal(it), 0);
  }

  const grandTotal = groupList.reduce((sum, [, items]) => sum + groupTotal(items), 0);

  const customItemsForSupplier = useMemo(
    () => customItems.filter((c) => c.supplierId === currentSupplierId),
    [customItems, currentSupplierId]
  );
  function customItemAmount(c: { unitPrice: string }) {
    return Number(c.unitPrice) || 0;
  }
  function customTotalForSupplier(supplierId: string) {
    return customItems.filter((c) => c.supplierId === supplierId).reduce((sum, c) => sum + customItemAmount(c), 0);
  }
  const customExpenseGrandTotal = customItems.reduce((sum, c) => sum + customItemAmount(c), 0);
  const orderSupplierIds = useMemo(
    () => Array.from(new Set<string>([...groupList.map(([id]) => id), ...customItems.map((c) => c.supplierId)])),
    [groupList, customItems]
  );
  const valid = (selectedItems.length > 0 || customItems.length > 0) && !!orderDate;

  async function handleSubmit() {
    if (!employee || !valid) return;
    setSubmitting(true);
    try {
      const supplierIds = new Set<string>([
        ...groupList.map(([supplierId]) => supplierId),
        ...customItems.map((c) => c.supplierId),
      ]);
      for (const supplierId of supplierIds) {
        const stockGroup = groupList.find(([id]) => id === supplierId)?.[1] ?? [];
        const orderItems = stockGroup.map((it) => ({
          stockItemId: it.id,
          itemName: it.name,
          quantity: Number(qty[it.id]) || 0,
          unit: it.unit,
          unitPrice: Number(effectivePrice(it)) || 0,
          sourcePurchaseRequestId: null,
        }));
        const expenseItems = customItems
          .filter((c) => c.supplierId === supplierId)
          .map((c) => ({
            stockItemId: null,
            itemName: c.name,
            quantity: 1,
            unit: 'รายการ',
            unitPrice: customItemAmount(c),
            sourcePurchaseRequestId: null,
          }));
        await store.createOrMergePurchaseOrder({
          supplierId,
          orderDate,
          items: [...orderItems, ...expenseItems],
          actorId: employee.id,
        });
      }
      router.replace('/purchase-orders');
    } finally {
      setSubmitting(false);
    }
  }

  // เพิ่มค่าใช้จ่ายอื่นๆ ที่ไม่ใช่วัตถุดิบในสต็อก — ผูกกับผู้ขายที่กำลังเลือกอยู่ (ทริปเดียวกัน)
  function handleAddExpense() {
    setExpenseError('');
    if (!currentSupplierId) return;
    const name = newExpenseName.trim();
    const price = Number(newExpensePrice);
    if (!name) {
      setExpenseError('กรอกชื่อรายการ');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setExpenseError('กรอกราคาให้ถูกต้อง');
      return;
    }
    setCustomItems((prev) => [
      ...prev,
      { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, supplierId: currentSupplierId, name, unitPrice: newExpensePrice },
    ]);
    setNewExpenseName('');
    setNewExpensePrice('');
    setShowAddExpense(false);
  }

  function handleRemoveExpense(id: string) {
    setCustomItems((prev) => prev.filter((c) => c.id !== id));
  }

  // เพิ่มวัตถุดิบใหม่เข้าคลังกลาง — ทุกตำแหน่งเพิ่มได้ (เจ้าของ/ผู้จัดการกำหนดผู้ขายภายหลัง)
  async function handleAddStockItem() {
    if (!employee) return;
    const name = newItemName.trim();
    const unit = newItemUnit.trim();
    if (!name || !newItemCategoryId || !unit) {
      setAddItemError('กรอกชื่อวัตถุดิบ หมวดหมู่ และหน่วยให้ครบ');
      return;
    }
    setAddItemError('');
    setAddingItem(true);
    try {
      await store.createStockItem({
        name,
        categoryId: newItemCategoryId,
        unit,
        minQuantity: 0,
        parQuantity: 0,
        quantity: 0,
        supplierId: null,
        actorId: employee.id,
      });
      setNewItemName('');
      setNewItemCategoryId('');
      setNewItemUnit('');
      setShowAddItem(false);
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : 'เพิ่มวัตถุดิบไม่สำเร็จ');
    } finally {
      setAddingItem(false);
    }
  }

  return (
    <div>
      <Header title="สั่งสินค้า" subtitle="เลือกผู้ขายก่อน แล้วติ๊กเลือกรายการที่จะสั่ง" currentEmployee={employee} />
      <main className="space-y-4 px-4 py-4 pb-8">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <label className="text-xs font-semibold text-gray-500">วันที่สั่งซื้อ</label>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700">เพิ่มวัตถุดิบใหม่เข้าคลัง</p>
            <button onClick={() => setShowAddItem((v) => !v)} className="text-[11px] font-semibold text-brand-600">
              {showAddItem ? 'ยกเลิก' : '+ เพิ่มวัตถุดิบ'}
            </button>
          </div>
          {showAddItem && (
            <div className="space-y-2">
              <input
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="ชื่อวัตถุดิบ เช่น นมสด UHT"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-brand-400"
              />
              <div className="flex gap-2">
                <select
                  value={newItemCategoryId}
                  onChange={(e) => setNewItemCategoryId(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-brand-400"
                >
                  <option value="">เลือกหมวดหมู่</option>
                  {stockCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  placeholder="หน่วย เช่น ขวด, กก."
                  className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-brand-400"
                />
              </div>
              {addItemError && <p className="text-[11px] text-status-warn">{addItemError}</p>}
              <button
                onClick={handleAddStockItem}
                disabled={addingItem}
                className="w-full rounded-lg bg-brand-600 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                {addingItem ? 'กำลังบันทึก...' : 'บันทึกวัตถุดิบใหม่'}
              </button>
              <p className="text-[11px] text-gray-400">วัตถุดิบใหม่จะเข้าคลังกลาง เจ้าของ/ผู้จัดการเป็นผู้กำหนดผู้ขายภายหลังที่หน้า &quot;ตั้งค่าระบบ&quot;</p>
            </div>
          )}
        </div>

        {unassignedCount > 0 && (
          <p className="rounded-xl bg-status-warnBg px-3 py-2 text-[11px] text-status-warn">
            มี {unassignedCount} รายการที่ยังไม่ได้กำหนดผู้ขาย จึงไม่แสดงในนี้
            {canManage ? ' — ไปกำหนดผู้ขายได้ที่หน้า "ตั้งค่าระบบ"' : ' — แจ้งเจ้าของร้าน/ผู้จัดการให้กำหนดผู้ขายก่อน'}
          </p>
        )}

        {suppliersWithItems.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 shadow-card">
            <EmptyState icon="🏭" title="ยังไม่มีผู้ขายที่พร้อมให้สั่งซื้อ" subtitle="ให้เจ้าของร้าน/ผู้จัดการไปกำหนดผู้ขายของวัตถุดิบก่อนที่หน้าตั้งค่าระบบ" />
          </div>
        ) : (
          <>
            {/* ขั้นที่ 1 — เลือกผู้ขาย (แสดงก่อนเสมอ กันพนักงานสับสนว่าของชิ้นไหนของใคร) */}
            <div className="rounded-2xl bg-white p-4 shadow-card">
              <p className="mb-2 text-xs font-bold text-gray-700">1. เลือกผู้ขาย</p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {suppliersWithItems.map((s) => {
                  const isActive = s.id === currentSupplierId;
                  const selectedCount = selectedCountForSupplier(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActiveSupplierId(s.id);
                        setCategoryFilter('all');
                        setQuery('');
                      }}
                      className={`shrink-0 rounded-xl border px-3 py-2 text-left ${
                        isActive ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <p className={`text-xs font-bold ${isActive ? 'text-brand-700' : 'text-gray-700'}`}>{s.name}</p>
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        {orderableItems.filter((it) => it.supplierId === s.id).length} รายการ
                        {selectedCount > 0 && <span className="ml-1 font-bold text-brand-600">· เลือกแล้ว {selectedCount}</span>}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ขั้นที่ 2 — ค้นหา/กรองหมวดหมู่ย่อย ภายในผู้ขายที่เลือก */}
            <div className="rounded-2xl bg-white p-4 shadow-card">
              <p className="mb-2 text-xs font-bold text-gray-700">
                2. รายการของ {suppliers.find((s) => s.id === currentSupplierId)?.name ?? ''}
              </p>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาวัตถุดิบ..."
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
              />
              {categoriesForSupplier.length > 1 && (
                <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${
                      categoryFilter === 'all' ? 'border-brand-600 text-brand-600' : 'border-gray-200 text-gray-400'
                    }`}
                  >
                    ทุกหมวดหมู่
                  </button>
                  {categoriesForSupplier.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategoryFilter(c.id)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${
                        categoryFilter === c.id ? 'border-brand-600 text-brand-600' : 'border-gray-200 text-gray-400'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {/* ปุ่มเลือกทั้งหมด/ล้างการเลือก — สำหรับกรณีต้องสั่งของทีละเยอะๆ ให้กรอกเร็วขึ้น */}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={selectAllFiltered}
                  disabled={filteredItems.length === 0}
                  className="flex-1 rounded-lg bg-brand-50 py-1.5 text-[11px] font-bold text-brand-700 disabled:opacity-40"
                >
                  ✓ เลือกทั้งหมดที่แสดงอยู่ ({filteredItems.length})
                </button>
                <button
                  onClick={clearAllSelected}
                  disabled={filteredItems.length === 0}
                  className="flex-1 rounded-lg bg-gray-100 py-1.5 text-[11px] font-semibold text-gray-500 disabled:opacity-40"
                >
                  ล้างที่เลือกในหมวดนี้
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-card">
              <p className="mb-2 text-xs font-bold text-gray-700">รายชื่อวัตถุดิบ ({filteredItems.length} รายการ)</p>
              {filteredItems.length === 0 ? (
                <EmptyState icon="🛒" title="ไม่พบวัตถุดิบตามเงื่อนไข" />
              ) : (
                <div className="space-y-3">
                  {[...groupedByCategory.entries()].map(([catId, items]) => {
                    const cat = stockCategories.find((c) => c.id === catId);
                    return (
                      <div key={catId}>
                        <p className="mb-1.5 text-[11px] font-bold text-gray-400">{cat?.name ?? catId}</p>
                        <div className="space-y-1.5">
                          {items.map((it) => {
                            const isSelected = Number(qty[it.id]) > 0;
                            return (
                              <div
                                key={it.id}
                                className={`flex items-center gap-2 rounded-xl border p-2 ${
                                  isSelected ? 'border-brand-300 bg-brand-50' : 'border-gray-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => (isSelected ? setItemQty(it.id, '') : setItemQty(it.id, '1'))}
                                  className="h-4 w-4 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-bold text-gray-800">{it.name}</p>
                                  <p className="text-[11px] text-gray-400">{it.unit}</p>
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  value={qty[it.id] ?? ''}
                                  onChange={(e) => setItemQty(it.id, e.target.value)}
                                  placeholder="จำนวน"
                                  className="w-16 shrink-0 rounded-lg border border-gray-200 px-2 py-1.5 text-center text-xs outline-none focus:border-brand-400"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  value={effectivePrice(it)}
                                  onChange={(e) => setPriceOverride((p) => ({ ...p, [it.id]: e.target.value }))}
                                  placeholder="ราคา"
                                  title="ราคาต่อหน่วย (บาท)"
                                  className="w-16 shrink-0 rounded-lg border border-gray-200 px-2 py-1.5 text-center text-xs outline-none focus:border-brand-400"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          <div className="rounded-2xl bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700">ค่าใช้จ่ายอื่นๆ</p>
              <button
                type="button"
                onClick={() => setShowAddExpense((v) => !v)}
                className="text-xs font-semibold text-brand-600"
              >
                {showAddExpense ? 'ยกเลิก' : '+ เพิ่มรายการ'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              รายการที่ไม่ใช่วัตถุดิบในสต็อก เช่น ค่าเดินทาง ค่าน้ำแข็ง ค่าถุง — กรอกชื่อและราคาเอง
            </p>

            {showAddExpense && (
              <div className="mt-3 space-y-2">
                <input
                  value={newExpenseName}
                  onChange={(e) => setNewExpenseName(e.target.value)}
                  placeholder="ชื่อรายการ เช่น ค่าเดินทาง"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-brand-400"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  value={newExpensePrice}
                  onChange={(e) => setNewExpensePrice(e.target.value)}
                  placeholder="ราคา (บาท)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-brand-400"
                />
                {expenseError && <p className="text-[11px] text-status-warn">{expenseError}</p>}
                <button
                  type="button"
                  onClick={handleAddExpense}
                  className="w-full rounded-lg bg-brand-600 py-2 text-xs font-bold text-white"
                >
                  เพิ่มรายการ
                </button>
              </div>
            )}

            {customItemsForSupplier.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {customItemsForSupplier.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5">
                    <p className="text-xs font-semibold text-gray-700">{c.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-gray-700">{customItemAmount(c).toLocaleString()} บาท</p>
                      <button
                        type="button"
                        onClick={() => handleRemoveExpense(c.id)}
                        className="text-[11px] font-semibold text-status-warn"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
        )}

        {(selectedItems.length > 0 || customItems.length > 0) && (
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="mb-2 text-xs font-bold text-gray-700">สรุป — จะสร้าง/รวมเป็นใบสั่งซื้อ {orderSupplierIds.length} ใบ</p>
          <div className="space-y-2">
            {orderSupplierIds.map((supplierId) => {
              const supplier = suppliers.find((s) => s.id === supplierId);
              const items = groupList.find(([id]) => id === supplierId)?.[1] ?? [];
              const expenses = customItems.filter((c) => c.supplierId === supplierId);
              const total = groupTotal(items) + customTotalForSupplier(supplierId);
              return (
                <div key={supplierId} className="rounded-xl bg-gray-50 p-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-800">{supplier?.name ?? 'ไม่ระบุผู้ขาย'}</p>
                    <p className="text-xs font-bold text-gray-700">{total.toLocaleString()} บาท</p>
                  </div>
                  {items.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {items.length} รายการ — {items.map((it) => `${it.name} ${qty[it.id] || 0} ${it.unit}`).join(', ')}
                    </p>
                  )}
                  {expenses.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      ค่าใช้จ่ายอื่นๆ {expenses.length} รายการ — {expenses.map((c) => `${c.name} ${customItemAmount(c).toLocaleString()} บาท`).join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
            <p className="text-xs font-semibold text-gray-500">รวมทั้งหมด</p>
            <p className="text-sm font-extrabold text-gray-900">{(grandTotal + customExpenseGrandTotal).toLocaleString()} บาท</p>
          </div>
        </div>
      )}

      <PrimaryButton onClick={handleSubmit} disabled={!valid || submitting}>
          {`บันทึกการสั่งซื้อ (${selectedItems.length + customItems.length} รายการ)`}
        </PrimaryButton>
      </main>
    </div>
  );
}
