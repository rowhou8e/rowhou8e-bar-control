'use client';

/**
 * ============================================================================
 *  MOCK STORE — ทำงานฝั่ง client ล้วน ๆ (ไม่ใช่ production backend)
 * ============================================================================
 * ไฟล์นี้จำลองพฤติกรรมของ backend จริงไว้ทั้งหมด (บันทึกเช็กลิสต์, ต้มนม,
 * ปรับสต๊อก, อนุมัติคำสั่งซื้อ, สร้าง history log ฯลฯ) โดยเก็บ state ไว้ใน
 * localStorage ของเบราว์เซอร์ เพื่อให้ demo ได้ครบ flow แบบไม่ต้องต่อฐานข้อมูลจริง
 *
 * เมื่อจะขึ้นระบบจริง ให้แทนที่การเรียกใช้ store นี้ในหน้าต่าง ๆ ด้วยการเรียก
 * Supabase ผ่านไฟล์ src/lib/supabase/queries.ts (โครง query พร้อมใช้แล้ว)
 * ดูรายละเอียดวิธี migrate ใน README หัวข้อ "การเชื่อมฐานข้อมูลจริง"
 * ============================================================================
 */
import {
  appSettings as initialSettings,
  cashReports as initialCashReports,
  checklistRuns as initialChecklistRuns,
  checklistTemplate,
  employees as initialEmployees,
  historyLogs as initialHistoryLogs,
  orderReminders as initialOrderReminders,
  products as initialProducts,
  productLots as initialProductLots,
  purchaseOrders as initialPurchaseOrders,
  purchaseRequests as initialPurchaseRequests,
  stations as initialStations,
  stockCategories as initialStockCategories,
  stockItems as initialStockItems,
  storeHolidays as initialStoreHolidays,
  suppliers as initialSuppliers,
  supplierItemPrices as initialSupplierItemPrices,
  TODAY_STR,
} from './mock-data';
import { computeProductLotStatus, computeStockStatus } from './derive';
import { detectDeviceLabel } from './device';
import { getDataMode } from './supabase/client';
import { LiveStore } from './supabase/live-store';
import type {
  AppSettings,
  AppState,
  AppStore,
  CashReport,
  ChecklistEntryItem,
  ChecklistItemFrequency,
  ChecklistRun,
  ChecklistTemplateItem,
  Employee,
  HistoryActionType,
  HistoryLog,
  OrderDraftPick,
  OrderReminder,
  Product,
  ProductLot,
  ProductLotStatus,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseRequest,
  PurchaseRequestStatus,
  Role,
  Station,
  StockCategory,
  StockItem,
  StoreHoliday,
  Supplier,
  SupplierItemPrice,
} from './types';

// v6: เพิ่ม storeHolidays + Employee.lastLoginAt/lastLoginDevice (เฟส 4) — เปลี่ยนเวอร์ชันคีย์เพื่อไม่ให้
// localStorage เก่าที่ยังไม่มีฟิลด์นี้ทำให้แอปพัง
// v7: เพิ่ม orderReminders (แจ้งเตือนให้แผนกสั่งสินค้า — เฟส 5)
// v8: เพิ่ม orderDraftPicks (ติ๊กเลือกสินค้าแบบเรียลไทม์ที่หน้า "สั่งสินค้า")
const STORAGE_KEY = 'rowhou8e-bar-control-state-v8';

function loadInitialState(): AppState {
  return {
    employees: initialEmployees,
    stations: initialStations,
    stockItems: initialStockItems,
    stockCategories: initialStockCategories,
    checklistRuns: initialChecklistRuns,
    checklistTemplate,
    products: initialProducts,
    productLots: initialProductLots,
    purchaseRequests: initialPurchaseRequests,
    suppliers: initialSuppliers,
    supplierItemPrices: initialSupplierItemPrices,
    purchaseOrders: initialPurchaseOrders,
    cashReports: initialCashReports,
    storeHolidays: initialStoreHolidays,
    orderReminders: initialOrderReminders,
    orderDraftPicks: [],
    historyLogs: initialHistoryLogs,
    settings: initialSettings,
    session: null,
    initializing: true,
  };
}

function reviveState(raw: string): AppState | null {
  try {
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !parsed.employees) return null;
    return parsed;
  } catch {
    return null;
  }
}

let idCounter = 1000;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}`;
}

class Store {
  private state: AppState;
  private listeners = new Set<() => void>();
  private hydrated = false;

  constructor() {
    this.state = loadInitialState();
  }

  hydrate() {
    if (this.hydrated || typeof window === 'undefined') return;
    this.hydrated = true;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const revived = reviveState(raw);
      if (revived) {
        this.state = { ...revived, initializing: false };
        this.notify();
        return;
      }
    }
    this.state = { ...this.state, initializing: false };
    this.notify();
  }

  private persist() {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private update(mutator: (draft: AppState) => AppState) {
    this.state = mutator(this.state);
    this.persist();
    this.notify();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AppState => this.state;

  getServerSnapshot = (): AppState => loadInitialState();

  private log(actionType: HistoryActionType, actorId: string, targetLabel: string, detail: string) {
    const entry: HistoryLog = {
      id: nextId('log'),
      actionType,
      actorId,
      targetLabel,
      detail,
      createdAt: new Date().toISOString(),
    };
    this.state = { ...this.state, historyLogs: [entry, ...this.state.historyLogs] };
  }

  // ================= AUTH =================
  login(employeeId: string, pin: string): { ok: boolean; error?: string } {
    const emp = this.state.employees.find((e) => e.id === employeeId);
    if (!emp || !emp.active) return { ok: false, error: 'ไม่พบพนักงานนี้ในระบบ' };
    if (emp.pinCode !== pin) return { ok: false, error: 'รหัส PIN ไม่ถูกต้อง' };
    const loginAt = new Date().toISOString();
    const device = detectDeviceLabel();
    this.update((s) => ({
      ...s,
      session: { employeeId, loggedInAt: loginAt },
      employees: s.employees.map((e) => (e.id === employeeId ? { ...e, lastLoginAt: loginAt, lastLoginDevice: device } : e)),
    }));
    return { ok: true };
  }

  logout() {
    this.update((s) => ({ ...s, session: null }));
  }

  // ================= CHECKLIST =================
  submitChecklist(stationId: string, dateStr: string, items: ChecklistEntryItem[], employeeId: string, backdatedReason: string | null) {
    this.update((s) => {
      const date = dateStr || TODAY_STR;
      const backdated = date !== TODAY_STR;
      const runs = s.checklistRuns.filter((r) => !(r.date === date && r.stationId === stationId));
      const stationItemCount = checklistTemplate.filter((t) => t.stationId === stationId && t.active).length;
      const run: ChecklistRun = {
        id: nextId('chk'),
        stationId,
        date,
        submittedAt: new Date().toISOString(),
        submittedBy: employeeId,
        items,
        isComplete: items.length === stationItemCount,
        backdated,
        backdatedReason: backdated ? backdatedReason : null,
      };
      const station = s.stations.find((st) => st.id === stationId);
      const problemCount = items.filter((i) => i.status !== 'normal').length;
      const backdatedNote = backdated ? ` (ทำย้อนหลัง: ${backdatedReason ?? ''})` : '';
      this.log(
        'checklist_submit',
        employeeId,
        `${station?.name ?? stationId} · เช็กลิสต์วันที่ ${date}`,
        (problemCount > 0
          ? `ทำเช็กลิสต์ครบ ${items.length} ข้อ พบ ${problemCount} รายการที่ต้องติดตาม`
          : `ทำเช็กลิสต์ครบ ${items.length} ข้อ ทุกรายการปกติ`) + backdatedNote
      );
      return { ...s, checklistRuns: [run, ...runs] };
    });
  }

  // ================= สินค้าที่ผลิต (Products) =================
  createProduct(input: { stationId: string; name: string; unit: string; shelfLifeDays: number; actorId: string }) {
    this.update((s) => {
      const product: Product = {
        id: nextId('prod'),
        stationId: input.stationId,
        name: input.name,
        unit: input.unit,
        shelfLifeDays: input.shelfLifeDays,
        active: true,
      };
      this.log(
        'settings_change',
        input.actorId,
        input.name,
        `เพิ่มสินค้าที่ผลิตใหม่: ${input.name} (${input.unit}, เก็บได้ ${input.shelfLifeDays} วัน)`
      );
      return { ...s, products: [product, ...s.products] };
    });
  }

  updateProduct(id: string, patch: { name?: string; unit?: string; shelfLifeDays?: number }, actorId: string) {
    this.update((s) => {
      const products = s.products.map((p) => (p.id === id ? { ...p, ...patch } : p));
      const p = s.products.find((x) => x.id === id);
      if (p) {
        this.log('settings_change', actorId, patch.name ?? p.name, `แก้ไขข้อมูลสินค้าที่ผลิต: ${Object.keys(patch).join(', ')}`);
      }
      return { ...s, products };
    });
  }

  deleteProduct(id: string, actorId: string) {
    this.update((s) => {
      const p = s.products.find((x) => x.id === id);
      if (p) {
        this.log('settings_change', actorId, p.name, `ลบสินค้าที่ผลิตออกจากรายการ: ${p.name}`);
      }
      return { ...s, products: s.products.map((x) => (x.id === id ? { ...x, active: false } : x)) };
    });
  }

  // ================= ล็อตการผลิต (Product Lots — แทนนมต้มเดิม) =================
  createProductLot(input: {
    productId: string;
    producedDate: string;
    producedTime: string;
    quantity: number;
    unit: string;
    producedBy: string;
    note: string;
    photoUrl: string | null;
  }) {
    this.update((s) => {
      const product = s.products.find((p) => p.id === input.productId);
      const shelfLifeDays = product?.shelfLifeDays ?? 3;
      const lotSeq = s.productLots.length + 1;
      const prefix = (product?.name ?? 'L').trim().charAt(0).toUpperCase() || 'L';
      const lotNumber = `${prefix}-${String(1000 + lotSeq)}`;
      const producedAt = new Date(`${input.producedDate}T${input.producedTime}:00`);
      const expiresAt = new Date(producedAt.getTime() + shelfLifeDays * 24 * 60 * 60 * 1000);
      const lot: ProductLot = {
        id: nextId('lot'),
        productId: input.productId,
        lotNumber,
        producedDate: input.producedDate,
        producedTime: input.producedTime,
        quantity: input.quantity,
        unit: input.unit,
        producedBy: input.producedBy,
        shelfLifeDays,
        expiresAt: expiresAt.toISOString(),
        note: input.note,
        photoUrl: input.photoUrl,
        status: 'active',
        usedUpAt: null,
        createdAt: new Date().toISOString(),
      };
      this.log(
        'production_log',
        input.producedBy,
        `${product?.name ?? 'สินค้า'} ล็อต ${lotNumber}`,
        `ผลิต ${input.quantity} ${input.unit} เก็บได้ ${shelfLifeDays} วัน หมดอายุ ${expiresAt.toLocaleString('th-TH')}`
      );
      return { ...s, productLots: [lot, ...s.productLots] };
    });
  }

  setProductLotStatus(id: string, status: ProductLotStatus, employeeId: string) {
    this.update((s) => {
      const lots = s.productLots.map((l) =>
        l.id === id ? { ...l, status, usedUpAt: status === 'used_up' ? new Date().toISOString() : l.usedUpAt } : l
      );
      const lot = s.productLots.find((l) => l.id === id);
      if (lot) {
        this.log('lot_status_change', employeeId, `ล็อต ${lot.lotNumber}`, `เปลี่ยนสถานะเป็น "${status}"`);
      }
      return { ...s, productLots: lots };
    });
  }

  // ================= STOCK =================
  adjustStock(id: string, quantity: number, note: string, employeeId: string) {
    this.update((s) => {
      const items = s.stockItems.map((it) =>
        it.id === id
          ? { ...it, quantity, note, updatedAt: new Date().toISOString(), updatedBy: employeeId }
          : it
      );
      const item = s.stockItems.find((it) => it.id === id);
      if (item) {
        this.log('stock_adjust', employeeId, item.name, `ปรับจำนวนคงเหลือเป็น ${quantity} ${item.unit}${note ? ` (${note})` : ''}`);
      }
      return { ...s, stockItems: items };
    });
    this.autoGeneratePurchaseRequests();
  }

  markStockUnusable(id: string, note: string, employeeId: string) {
    this.update((s) => {
      const items = s.stockItems.map((it) =>
        it.id === id
          ? { ...it, status: 'unusable' as const, note, updatedAt: new Date().toISOString(), updatedBy: employeeId }
          : it
      );
      const item = s.stockItems.find((it) => it.id === id);
      if (item) {
        this.log('waste_report', employeeId, item.name, `แจ้งของเสีย/ใช้ไม่ได้: ${note || 'ไม่ระบุเหตุผล'}`);
      }
      return { ...s, stockItems: items };
    });
  }

  // ================= PURCHASE REQUESTS =================
  createPurchaseRequest(input: {
    stockItemId: string | null;
    itemName: string;
    currentQuantity: number;
    requestedQuantity: number;
    unit: string;
    reason: string;
    neededBy: string;
    requestedBy: string;
    photoUrl: string | null;
  }) {
    this.update((s) => {
      const pr: PurchaseRequest = {
        id: nextId('pr'),
        ...input,
        status: 'pending',
        approvedBy: null,
        approvedAt: null,
        receivedAt: null,
        autoGenerated: false,
        createdAt: new Date().toISOString(),
      };
      this.log('purchase_create', input.requestedBy, input.itemName, `สร้างรายการเสนอซื้อ ${input.requestedQuantity} ${input.unit}`);
      return { ...s, purchaseRequests: [pr, ...s.purchaseRequests] };
    });
  }

  private autoGeneratePurchaseRequests() {
    this.update((s) => {
      const now = new Date();
      const newRequests: PurchaseRequest[] = [];
      for (const item of s.stockItems) {
        const status = computeStockStatus(item, now);
        if (status !== 'low' && status !== 'out') continue;
        const hasOpenRequest = s.purchaseRequests.some(
          (pr) => pr.stockItemId === item.id && ['pending', 'approved', 'ordered'].includes(pr.status)
        );
        if (hasOpenRequest) continue;
        newRequests.push({
          id: nextId('pr'),
          stockItemId: item.id,
          itemName: item.name,
          currentQuantity: item.quantity,
          requestedQuantity: Math.max(item.parQuantity - item.quantity, item.minQuantity),
          unit: item.unit,
          reason: status === 'out' ? 'สต๊อกหมด (สร้างอัตโนมัติ)' : 'ต่ำกว่าจำนวนขั้นต่ำ (สร้างอัตโนมัติ)',
          neededBy: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          requestedBy: 'system',
          photoUrl: null,
          status: 'pending',
          approvedBy: null,
          approvedAt: null,
          receivedAt: null,
          autoGenerated: true,
          createdAt: now.toISOString(),
        });
      }
      if (newRequests.length === 0) return s;
      return { ...s, purchaseRequests: [...newRequests, ...s.purchaseRequests] };
    });
  }

  updatePurchaseRequestStatus(id: string, status: PurchaseRequestStatus, employeeId: string) {
    this.update((s) => {
      const requests = s.purchaseRequests.map((pr) => {
        if (pr.id !== id) return pr;
        const patch: Partial<PurchaseRequest> = { status };
        if (status === 'approved') {
          patch.approvedBy = employeeId;
          patch.approvedAt = new Date().toISOString();
        }
        if (status === 'received') {
          patch.receivedAt = new Date().toISOString();
        }
        return { ...pr, ...patch };
      });
      const pr = s.purchaseRequests.find((p) => p.id === id);
      let stockItems = s.stockItems;
      if (pr && status === 'received') {
        stockItems = s.stockItems.map((it) =>
          it.id === pr.stockItemId
            ? {
                ...it,
                quantity: it.quantity + pr.requestedQuantity,
                status: 'normal',
                updatedAt: new Date().toISOString(),
                updatedBy: employeeId,
              }
            : it
        );
      }
      if (pr) {
        const actionType: HistoryActionType = status === 'approved' ? 'purchase_approve' : status === 'received' ? 'purchase_receive' : 'purchase_create';
        const detailMap: Record<string, string> = {
          approved: 'อนุมัติรายการเสนอซื้อ',
          ordered: 'เปลี่ยนสถานะเป็นสั่งซื้อแล้ว',
          received: `รับสินค้าเข้าสต๊อกเรียบร้อย ${pr.requestedQuantity} ${pr.unit}`,
          cancelled: 'ยกเลิกรายการเสนอซื้อ',
        };
        this.log(actionType, employeeId, pr.itemName, detailMap[status] ?? `เปลี่ยนสถานะเป็น ${status}`);
      }
      return { ...s, purchaseRequests: requests, stockItems };
    });
  }

  // ================= SETTINGS =================
  updateSettings(patch: Partial<AppSettings>, employeeId: string) {
    this.update((s) => {
      this.log('settings_change', employeeId, 'ตั้งค่าระบบ', `อัปเดตการตั้งค่า: ${Object.keys(patch).join(', ')}`);
      return { ...s, settings: { ...s.settings, ...patch } };
    });
  }

  /** เพิ่มพนักงานใหม่ — โหมด mock ใช้ pinCode ล็อกอิน (email/password ไม่ใช้) */
  createEmployee(input: {
    name: string;
    nickname: string;
    role: Role;
    stationId: string | null;
    pinCode: string;
    email: string;
    password: string;
    actorId: string;
  }) {
    const palette = ['#EA580C', '#0EA5E9', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6'];
    this.update((s) => {
      const emp: Employee = {
        id: nextId('emp'),
        name: input.name,
        nickname: input.nickname,
        role: input.role,
        avatarColor: palette[s.employees.length % palette.length],
        pinCode: input.pinCode,
        stationId: input.stationId,
        active: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
        lastLoginDevice: null,
      };
      this.log('settings_change', input.actorId, `พนักงาน: ${input.name}`, `เพิ่มพนักงานใหม่: ${input.name} (${input.nickname}) — สิทธิ์ ${input.role}`);
      return { ...s, employees: [...s.employees, emp] };
    });
  }

  /** pinCode ใช้ได้เฉพาะโหมด mock — เปลี่ยน PIN ของตัวเอง หรือ owner รีเซ็ต PIN ให้พนักงานคนอื่น
   *  name/nickname เปลี่ยนได้เฉพาะเจ้าของร้านเท่านั้น (จำกัดสิทธิ์ที่หน้าจอ) */
  updateEmployee(id: string, patch: Partial<Pick<Employee, 'role' | 'active' | 'stationId' | 'pinCode' | 'name' | 'nickname'>>, actorId: string) {
    this.update((s) => {
      const emp = s.employees.find((e) => e.id === id);
      const employees = s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e));
      if (emp) {
        let detail = 'แก้ไขข้อมูลพนักงาน';
        if (patch.role) detail = `เปลี่ยนสิทธิ์เป็น ${patch.role}`;
        else if (patch.active !== undefined) detail = patch.active ? 'เปิดใช้งานพนักงาน' : 'ระงับการใช้งานพนักงาน';
        else if (patch.stationId !== undefined) {
          const station = s.stations.find((st) => st.id === patch.stationId);
          detail = `เปลี่ยนแผนกที่ประจำเป็น ${station?.name ?? 'ไม่ระบุ'}`;
        } else if (patch.pinCode !== undefined) {
          detail = actorId === id ? 'เปลี่ยนรหัส PIN ของตัวเอง' : `รีเซ็ตรหัส PIN ให้ ${emp.name}`;
        } else if (patch.name !== undefined || patch.nickname !== undefined) {
          detail = `เปลี่ยนชื่อจาก "${emp.name}" เป็น "${patch.name ?? emp.name}"${patch.nickname !== undefined ? ` (ชื่อเล่น: ${patch.nickname})` : ''}`;
        }
        this.log('settings_change', actorId, `พนักงาน: ${emp.name}`, detail);
      }
      return { ...s, employees };
    });
  }

  /** โหมด mock ไม่มีระบบรหัสผ่านจริง (ใช้ PIN ผ่าน updateEmployee แทน) — เมธอดนี้แค่บันทึกประวัติไว้เผื่อเรียกผิดโหมด */
  resetEmployeePassword(employeeId: string, _newPassword: string, actorId: string) {
    this.update((s) => {
      const emp = s.employees.find((e) => e.id === employeeId);
      this.log('settings_change', actorId, `พนักงาน: ${emp?.name ?? employeeId}`, 'พยายามรีเซ็ตรหัสผ่าน (โหมด mock ไม่มีรหัสผ่านจริง ใช้ปุ่มรีเซ็ต PIN แทน)');
      return s;
    });
  }

  // ================= จัดการรายการวัตถุดิบ =================
  createStockItem(input: {
    name: string;
    categoryId: string;
    unit: string;
    minQuantity: number;
    parQuantity: number;
    quantity: number;
    supplierId: string | null;
    actorId: string;
  }) {
    this.update((s) => {
      const item: StockItem = {
        id: nextId('stock'),
        name: input.name,
        categoryId: input.categoryId,
        quantity: input.quantity,
        unit: input.unit,
        minQuantity: input.minQuantity,
        parQuantity: input.parQuantity,
        expiryDate: null,
        status: 'normal',
        note: '',
        updatedAt: new Date().toISOString(),
        updatedBy: input.actorId,
        active: true,
        supplierId: input.supplierId,
      };
      this.log('settings_change', input.actorId, input.name, `เพิ่มวัตถุดิบใหม่ในสต๊อก: ${input.name} (${input.unit})`);
      return { ...s, stockItems: [item, ...s.stockItems] };
    });
  }

  updateStockItemDetails(
    id: string,
    patch: { name?: string; categoryId?: string; unit?: string; minQuantity?: number; parQuantity?: number; supplierId?: string | null },
    actorId: string
  ) {
    this.update((s) => {
      const items = s.stockItems.map((it) =>
        it.id === id ? { ...it, ...patch, updatedAt: new Date().toISOString(), updatedBy: actorId } : it
      );
      const item = s.stockItems.find((it) => it.id === id);
      if (item) {
        this.log('settings_change', actorId, patch.name ?? item.name, `แก้ไขข้อมูลวัตถุดิบ: ${Object.keys(patch).join(', ')}`);
      }
      return { ...s, stockItems: items };
    });
  }

  deleteStockItem(id: string, actorId: string) {
    this.update((s) => {
      const item = s.stockItems.find((it) => it.id === id);
      if (item) {
        this.log('settings_change', actorId, item.name, `ลบวัตถุดิบออกจากสต๊อก: ${item.name}`);
      }
      return { ...s, stockItems: s.stockItems.map((it) => (it.id === id ? { ...it, active: false } : it)) };
    });
  }

  updateStockCategoryName(id: string, name: string, actorId: string) {
    this.update((s) => {
      const category = s.stockCategories.find((c) => c.id === id);
      if (!category || !name.trim() || name.trim() === category.name) return s;
      this.log('settings_change', actorId, name.trim(), `เปลี่ยนชื่อหมวดหมู่วัตถุดิบ: ${category.name} -> ${name.trim()}`);
      return {
        ...s,
        stockCategories: s.stockCategories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)),
      };
    });
  }

  createStockCategory(input: { name: string; actorId: string }) {
    this.update((s) => {
      const trimmed = input.name.trim();
      if (!trimmed) return s;
      if (s.stockCategories.some((c) => c.name === trimmed)) return s;
      const category: StockCategory = { id: nextId('cat'), name: trimmed };
      this.log('settings_change', input.actorId, trimmed, `เพิ่มหมวดหมู่วัตถุดิบใหม่: ${trimmed}`);
      return { ...s, stockCategories: [...s.stockCategories, category] };
    });
  }

  deleteStockCategory(id: string, actorId: string) {
    this.update((s) => {
      const category = s.stockCategories.find((c) => c.id === id);
      if (!category) return s;
      const inUse = s.stockItems.some((it) => it.active && it.categoryId === id);
      if (inUse) return s;
      this.log('settings_change', actorId, category.name, `ลบหมวดหมู่วัตถุดิบ: ${category.name}`);
      return { ...s, stockCategories: s.stockCategories.filter((c) => c.id !== id) };
    });
  }

  // ================= ผู้ขาย/ซัพพลายเออร์ (Suppliers) =================
  createSupplier(input: { name: string; contactPerson: string; phone: string; address: string; note: string; actorId: string }) {
    this.update((s) => {
      const supplier: Supplier = {
        id: nextId('sup'),
        name: input.name,
        contactPerson: input.contactPerson,
        phone: input.phone,
        address: input.address,
        note: input.note,
        active: true,
      };
      this.log('supplier_change', input.actorId, input.name, `เพิ่มผู้ขายใหม่: ${input.name}`);
      return { ...s, suppliers: [supplier, ...s.suppliers] };
    });
  }

  updateSupplier(
    id: string,
    patch: { name?: string; contactPerson?: string; phone?: string; address?: string; note?: string },
    actorId: string
  ) {
    this.update((s) => {
      const suppliers = s.suppliers.map((sup) => (sup.id === id ? { ...sup, ...patch } : sup));
      const sup = s.suppliers.find((x) => x.id === id);
      if (sup) {
        this.log('supplier_change', actorId, patch.name ?? sup.name, `แก้ไขข้อมูลผู้ขาย: ${Object.keys(patch).join(', ')}`);
      }
      return { ...s, suppliers };
    });
  }

  deleteSupplier(id: string, actorId: string) {
    this.update((s) => {
      const sup = s.suppliers.find((x) => x.id === id);
      if (sup) {
        this.log('supplier_change', actorId, sup.name, `ลบผู้ขายออกจากรายการ: ${sup.name}`);
      }
      return { ...s, suppliers: s.suppliers.map((x) => (x.id === id ? { ...x, active: false } : x)) };
    });
  }

  addSupplierItemPrice(input: { supplierId: string; stockItemId: string; unit: string; price: number; note: string; actorId: string }) {
    this.update((s) => {
      const price: SupplierItemPrice = {
        id: nextId('price'),
        supplierId: input.supplierId,
        stockItemId: input.stockItemId,
        unit: input.unit,
        price: input.price,
        note: input.note,
        createdBy: input.actorId,
        createdAt: new Date().toISOString(),
      };
      const supplier = s.suppliers.find((x) => x.id === input.supplierId);
      const item = s.stockItems.find((x) => x.id === input.stockItemId);
      this.log(
        'supplier_change',
        input.actorId,
        `${supplier?.name ?? input.supplierId} · ${item?.name ?? input.stockItemId}`,
        `เพิ่มราคาใหม่: ${input.price} บาท/${input.unit}`
      );
      return { ...s, supplierItemPrices: [price, ...s.supplierItemPrices] };
    });
  }

  // ================= ใบสั่งซื้อ (Purchase Orders — แยกจาก purchase_requests, auto-merge ตามผู้ขาย+วันที่) =================
  createOrMergePurchaseOrder(input: {
    supplierId: string;
    orderDate: string;
    items: {
      stockItemId: string | null;
      itemName: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      sourcePurchaseRequestId: string | null;
    }[];
    actorId: string;
  }) {
    this.update((s) => {
      const existing = s.purchaseOrders.find(
        (po) => po.supplierId === input.supplierId && po.orderDate === input.orderDate && po.status === 'draft'
      );
      const supplier = s.suppliers.find((x) => x.id === input.supplierId);
      const orderId = existing?.id ?? nextId('po');
      const newItems = input.items.map((it) => ({
        id: nextId('poi'),
        purchaseOrderId: orderId,
        stockItemId: it.stockItemId,
        itemName: it.itemName,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        sourcePurchaseRequestId: it.sourcePurchaseRequestId,
      }));

      let purchaseOrders: PurchaseOrder[];
      if (existing) {
        purchaseOrders = s.purchaseOrders.map((po) => (po.id === existing.id ? { ...po, items: [...po.items, ...newItems] } : po));
      } else {
        const order: PurchaseOrder = {
          id: orderId,
          supplierId: input.supplierId,
          orderDate: input.orderDate,
          status: 'draft',
          note: '',
          createdBy: input.actorId,
          createdAt: new Date().toISOString(),
          sentAt: null,
          receivedAt: null,
          receivedBy: null,
          items: newItems,
        };
        purchaseOrders = [order, ...s.purchaseOrders];
      }

      // รายการเสนอซื้อต้นทางที่ถูกรวมเข้าใบสั่งซื้อแล้ว ตั้งสถานะเป็น "ordered" ทันที
      const sourceIds = new Set(input.items.map((it) => it.sourcePurchaseRequestId).filter((id): id is string => !!id));
      const purchaseRequests = s.purchaseRequests.map((pr) => (sourceIds.has(pr.id) ? { ...pr, status: 'ordered' as const } : pr));

      this.log(
        'po_create',
        input.actorId,
        `ใบสั่งซื้อ · ${supplier?.name ?? input.supplierId} · ${input.orderDate}`,
        existing
          ? `รวมรายการเพิ่มเข้าใบสั่งซื้อเดิม ${input.items.length} รายการ`
          : `สร้างใบสั่งซื้อใหม่ ${input.items.length} รายการ`
      );

      return { ...s, purchaseOrders, purchaseRequests };
    });
  }

  /** received จะเพิ่มจำนวนกลับเข้าสต๊อกอัตโนมัติ + อัปเดตรายการเสนอซื้อต้นทางเป็น received
   *  cancelled จะคืนสถานะรายการเสนอซื้อต้นทางกลับเป็น approved เพื่อให้สร้างใบสั่งซื้อใหม่ได้อีกครั้ง */
  updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus, actorId: string) {
    this.update((s) => {
      const order = s.purchaseOrders.find((po) => po.id === id);
      if (!order) return s;

      const now = new Date().toISOString();
      let stockItems = s.stockItems;
      let purchaseRequests = s.purchaseRequests;

      if (status === 'received') {
        stockItems = s.stockItems.map((it) => {
          const orderedItem = order.items.find((oi) => oi.stockItemId === it.id);
          if (!orderedItem) return it;
          return { ...it, quantity: it.quantity + orderedItem.quantity, status: 'normal' as const, updatedAt: now, updatedBy: actorId };
        });
        const sourceIds = new Set(order.items.map((oi) => oi.sourcePurchaseRequestId).filter((sid): sid is string => !!sid));
        purchaseRequests = s.purchaseRequests.map((pr) =>
          sourceIds.has(pr.id) ? { ...pr, status: 'received' as const, receivedAt: now } : pr
        );
      } else if (status === 'cancelled') {
        const sourceIds = new Set(order.items.map((oi) => oi.sourcePurchaseRequestId).filter((sid): sid is string => !!sid));
        purchaseRequests = s.purchaseRequests.map((pr) => (sourceIds.has(pr.id) ? { ...pr, status: 'approved' as const } : pr));
      }

      const purchaseOrders = s.purchaseOrders.map((po) =>
        po.id === id
          ? {
              ...po,
              status,
              sentAt: status === 'sent' ? now : po.sentAt,
              receivedAt: status === 'received' ? now : po.receivedAt,
              receivedBy: status === 'received' ? actorId : po.receivedBy,
            }
          : po
      );

      const supplier = s.suppliers.find((x) => x.id === order.supplierId);
      const statusLabel: Record<PurchaseOrderStatus, string> = {
        draft: 'ร่าง',
        sent: 'ส่งให้ผู้ขายแล้ว',
        confirmed: 'ผู้ขายยืนยันแล้ว',
        received: 'รับสินค้าแล้ว',
        cancelled: 'ยกเลิก',
      };
      this.log(
        'po_status_change',
        actorId,
        `ใบสั่งซื้อ · ${supplier?.name ?? order.supplierId}`,
        `เปลี่ยนสถานะเป็น "${statusLabel[status]}"`
      );

      return { ...s, purchaseOrders, stockItems, purchaseRequests };
    });
  }

  /** แก้ไขราคาต่อหน่วยของรายการสินค้าในใบสั่งซื้อ — ใช้ได้เฉพาะใบสั่งซื้อที่ยังเป็นสถานะ "ร่าง" เท่านั้น (ก่อนส่งให้ผู้ขาย) */
  updatePurchaseOrderItemPrice(purchaseOrderId: string, itemId: string, unitPrice: number, actorId: string) {
    this.update((s) => {
      const order = s.purchaseOrders.find((po) => po.id === purchaseOrderId);
      if (!order || order.status !== 'draft') return s;
      const item = order.items.find((it) => it.id === itemId);
      if (!item) return s;

      const purchaseOrders = s.purchaseOrders.map((po) =>
        po.id === purchaseOrderId
          ? { ...po, items: po.items.map((it) => (it.id === itemId ? { ...it, unitPrice } : it)) }
          : po
      );

      const supplier = s.suppliers.find((x) => x.id === order.supplierId);
      this.log(
        'po_price_update',
        actorId,
        `ใบสั่งซื้อ · ${supplier?.name ?? order.supplierId}`,
        `แก้ไขราคา "${item.itemName}" เป็น ${unitPrice.toLocaleString()} บาท/${item.unit}`
      );

      return { ...s, purchaseOrders };
    });
  }

  // ================= รายงานเงินสดปิดร้าน (owner/manager เท่านั้น) — เฟส 3 =================
  /** บันทึกรายงานเงินสดของวันที่ระบุ */
  submitCashReport(input: { date: string; closingAmount: number; note: string; actorId: string }) {
    this.update((s) => {
      const report: CashReport = {
        id: nextId('cash'),
        date: input.date,
        closingAmount: input.closingAmount,
        note: input.note,
        submittedBy: input.actorId,
        submittedAt: new Date().toISOString(),
      };
      this.log('cash_report_submit', input.actorId, `รายงานเงินสด · ${input.date}`, `บันทึกยอดปิดร้าน ${input.closingAmount.toLocaleString()} บาท`);
      return { ...s, cashReports: [report, ...s.cashReports] };
    });
  }

  /** แก้ไขยอดเงิน/หมายเหตุของรายงานเงินสดที่บันทึกไว้แล้ว — บันทึกการเปลี่ยนแปลงลง history_logs เสมอ เพื่อรักษาความโปร่งใส (ไม่ลบข้อมูลเดิมทิ้ง) */
  updateCashReport(id: string, patch: { closingAmount?: number; note?: string }, actorId: string) {
    this.update((s) => {
      const report = s.cashReports.find((r) => r.id === id);
      if (!report) return s;
      const nextAmount = patch.closingAmount ?? report.closingAmount;
      const nextNote = patch.note ?? report.note;
      if (nextAmount === report.closingAmount && nextNote === report.note) return s;

      const changes: string[] = [];
      if (nextAmount !== report.closingAmount) {
        changes.push(`ยอดเงิน ${report.closingAmount.toLocaleString()} -> ${nextAmount.toLocaleString()} บาท`);
      }
      if (nextNote !== report.note) {
        changes.push('แก้ไขหมายเหตุ');
      }
      this.log('cash_report_edit', actorId, `รายงานเงินสด · ${report.date}`, changes.join(', '));

      return {
        ...s,
        cashReports: s.cashReports.map((r) => (r.id === id ? { ...r, closingAmount: nextAmount, note: nextNote } : r)),
      };
    });
  }

  // ================= วันหยุดร้าน (owner/manager เท่านั้น) — เฟส 4 =================
  addStoreHoliday(input: { date: string; label: string; actorId: string }) {
    this.update((s) => {
      if (s.storeHolidays.some((h) => h.date === input.date)) return s; // กันวันซ้ำ
      const holiday: StoreHoliday = {
        id: nextId('holiday'),
        date: input.date,
        label: input.label,
        createdBy: input.actorId,
        createdAt: new Date().toISOString(),
      };
      this.log('settings_change', input.actorId, `วันหยุดร้าน · ${input.date}`, `เพิ่มวันหยุดร้าน${input.label ? `: ${input.label}` : ''}`);
      return { ...s, storeHolidays: [...s.storeHolidays, holiday].sort((a, b) => a.date.localeCompare(b.date)) };
    });
  }

  removeStoreHoliday(id: string, actorId: string) {
    this.update((s) => {
      const holiday = s.storeHolidays.find((h) => h.id === id);
      if (!holiday) return s;
      this.log('settings_change', actorId, `วันหยุดร้าน · ${holiday.date}`, `ลบวันหยุดร้าน${holiday.label ? `: ${holiday.label}` : ''}`);
      return { ...s, storeHolidays: s.storeHolidays.filter((h) => h.id !== id) };
    });
  }

  // ================= แผนก/สถานี (Stations) — owner เท่านั้น =================
  createStation(input: { name: string; hasProduction: boolean; actorId: string }) {
    this.update((s) => {
      const nextOrder = s.stations.length > 0 ? Math.max(...s.stations.map((st) => st.order)) + 1 : 0;
      const station: Station = {
        id: nextId('station'),
        name: input.name,
        active: true,
        order: nextOrder,
        hasProduction: input.hasProduction,
      };
      this.log('settings_change', input.actorId, station.name, `เพิ่มแผนกใหม่: ${station.name}`);
      return { ...s, stations: [...s.stations, station] };
    });
  }

  updateStation(id: string, patch: { name?: string; hasProduction?: boolean }, actorId: string) {
    this.update((s) => {
      const station = s.stations.find((st) => st.id === id);
      if (!station) return s;
      this.log('settings_change', actorId, patch.name ?? station.name, `แก้ไขแผนก "${station.name}"`);
      return { ...s, stations: s.stations.map((st) => (st.id === id ? { ...st, ...patch } : st)) };
    });
  }

  /** ลบแผนก — soft-delete (active=false) เพื่อไม่กระทบประวัติเช็กลิสต์/ล็อตการผลิตเก่าที่เคยอ้างอิงแผนกนี้ */
  deleteStation(id: string, actorId: string) {
    this.update((s) => {
      const station = s.stations.find((st) => st.id === id);
      if (!station) return s;
      this.log('settings_change', actorId, station.name, `ลบแผนก: ${station.name}`);
      return { ...s, stations: s.stations.map((st) => (st.id === id ? { ...st, active: false } : st)) };
    });
  }

  // ================= จัดการรายการเช็กลิสต์ =================
  createChecklistTemplateItem(input: {
    stationId: string;
    label: string;
    actorId: string;
    frequency?: ChecklistItemFrequency;
    weeklyDays?: number[] | null;
    monthlyDay?: number | null;
  }) {
    this.update((s) => {
      const stationItems = s.checklistTemplate.filter((t) => t.stationId === input.stationId);
      const nextOrder = stationItems.length > 0 ? Math.max(...stationItems.map((t) => t.order)) + 1 : 0;
      const item: ChecklistTemplateItem = {
        id: nextId('tmpl'),
        stationId: input.stationId,
        label: input.label,
        order: nextOrder,
        active: true,
        frequency: input.frequency ?? 'daily',
        weeklyDays: input.weeklyDays ?? null,
        monthlyDay: input.monthlyDay ?? null,
      };
      const station = s.stations.find((st) => st.id === input.stationId);
      this.log(
        'settings_change',
        input.actorId,
        `${station?.name ?? input.stationId} · เช็กลิสต์`,
        `เพิ่มรายการเช็กลิสต์ใหม่: ${input.label}`
      );
      return { ...s, checklistTemplate: [...s.checklistTemplate, item] };
    });
  }

  updateChecklistTemplateItem(
    id: string,
    patch: { label?: string; frequency?: ChecklistItemFrequency; weeklyDays?: number[] | null; monthlyDay?: number | null },
    actorId: string
  ) {
    this.update((s) => {
      const templates = s.checklistTemplate.map((t) => (t.id === id ? { ...t, ...patch } : t));
      const t = s.checklistTemplate.find((x) => x.id === id);
      if (t) {
        this.log('settings_change', actorId, patch.label ?? t.label, `แก้ไขรายการเช็กลิสต์: ${patch.label ?? ''}`);
      }
      return { ...s, checklistTemplate: templates };
    });
  }

  deleteChecklistTemplateItem(id: string, actorId: string) {
    this.update((s) => {
      const t = s.checklistTemplate.find((x) => x.id === id);
      if (t) {
        this.log('settings_change', actorId, t.label, `ลบรายการเช็กลิสต์: ${t.label}`);
      }
      // soft-delete (active=false) เพื่อไม่กระทบประวัติเช็กลิสต์เก่าที่เคยอ้างอิงรายการนี้ — ตรงกับพฤติกรรมฝั่ง Supabase จริง
      return { ...s, checklistTemplate: s.checklistTemplate.map((x) => (x.id === id ? { ...x, active: false } : x)) };
    });
  }

  sendOrderReminder(input: { stationId: string; message: string; actorId: string }) {
    this.update((s) => {
      const station = s.stations.find((st) => st.id === input.stationId);
      if (!station) return s;
      const reminder: OrderReminder = {
        id: nextId('remind'),
        stationId: input.stationId,
        message: input.message.trim(),
        createdBy: input.actorId,
        createdAt: new Date().toISOString(),
        acknowledgedBy: null,
        acknowledgedAt: null,
        willOrder: null,
        responseNote: '',
      };
      this.log('order_reminder_send', input.actorId, station.name, `ส่งแจ้งเตือนให้ ${station.name} ตรวจสอบ/สั่งสินค้า${input.message ? `: ${input.message}` : ''}`);
      return { ...s, orderReminders: [reminder, ...s.orderReminders] };
    });
  }

  acknowledgeOrderReminder(id: string, input: { willOrder: boolean; note: string }, actorId: string) {
    this.update((s) => {
      const reminder = s.orderReminders.find((r) => r.id === id);
      if (!reminder) return s;
      const station = s.stations.find((st) => st.id === reminder.stationId);
      this.log(
        'order_reminder_ack',
        actorId,
        station?.name ?? reminder.stationId,
        `ยืนยันรับทราบแจ้งเตือนสั่งสินค้าของ ${station?.name ?? ''}: ${input.willOrder ? 'จะสั่งสินค้า' : 'ไม่มีของต้องสั่ง'}${input.note ? ` — ${input.note}` : ''}`
      );
      return {
        ...s,
        orderReminders: s.orderReminders.map((r) =>
          r.id === id
            ? { ...r, acknowledgedBy: actorId, acknowledgedAt: new Date().toISOString(), willOrder: input.willOrder, responseNote: input.note.trim() }
            : r
        ),
      };
    });
  }

  deleteOrderReminder(id: string, actorId: string) {
    this.update((s) => {
      const reminder = s.orderReminders.find((r) => r.id === id);
      if (!reminder) return s;
      const station = s.stations.find((st) => st.id === reminder.stationId);
      this.log(
        'settings_change',
        actorId,
        station?.name ?? reminder.stationId,
        `ลบการ์ดแจ้งเตือนให้สั่งสินค้าของ ${station?.name ?? ''}`,
      );
      return {
        ...s,
        orderReminders: s.orderReminders.filter((r) => r.id !== id),
      };
    });
  }

  // ================= ติ๊กเลือกสินค้าแบบเรียลไทม์ที่หน้า "สั่งสินค้า" (ก่อนบันทึกสั่งซื้อจริง) =================
  // หมายเหตุ: mock store จำลองแค่ผู้ใช้คนเดียวต่อเบราว์เซอร์ จึงไม่มีการ sync ข้ามอุปกรณ์จริง
  // แต่ยังคง state ไว้เหมือนโครงสร้างจริง เพื่อให้ UI หน้า "สั่งสินค้า" ทำงานได้เหมือนกันทั้งสองโหมด
  setOrderDraftPick(stockItemId: string, quantity: number, employeeId: string) {
    this.update((s) => {
      const existing = s.orderDraftPicks.find((p) => p.stockItemId === stockItemId && p.employeeId === employeeId);
      const pick: OrderDraftPick = {
        id: existing?.id ?? nextId('draftpick'),
        employeeId,
        stockItemId,
        quantity,
        updatedAt: new Date().toISOString(),
      };
      return {
        ...s,
        orderDraftPicks: existing
          ? s.orderDraftPicks.map((p) => (p.id === existing.id ? pick : p))
          : [pick, ...s.orderDraftPicks],
      };
    });
  }

  clearOrderDraftPick(stockItemId: string, employeeId: string) {
    this.update((s) => ({
      ...s,
      orderDraftPicks: s.orderDraftPicks.filter((p) => !(p.stockItemId === stockItemId && p.employeeId === employeeId)),
    }));
  }
}

/**
 * เลือกว่าจะใช้ store ตัวไหน:
 *  - NEXT_PUBLIC_DATA_MODE=supabase (และตั้งค่า Supabase env ครบ) -> LiveStore (ฐานข้อมูลจริง)
 *  - ค่าอื่น ๆ / ยังไม่ตั้งค่า -> Store (ข้อมูลจำลอง, ค่าเริ่มต้น)
 * ทั้งสองมี public API เหมือนกันทุกตัว หน้าจอเรียกผ่าน `store.xxx()` แบบเดียวกันได้เลย
 * ไม่ต้องรู้ว่ากำลังรันโหมดไหนอยู่
 */
export const store: AppStore = getDataMode() === 'supabase' ? new LiveStore() : new Store();

export function recomputedStockItems(items: StockItem[], now: Date): StockItem[] {
  return items.map((it) => ({ ...it, status: computeStockStatus(it, now) }));
}

export function recomputedProductLots(lots: ProductLot[], now: Date): ProductLot[] {
  return lots.map((l) => ({ ...l, status: computeProductLotStatus(l, now) }));
}
