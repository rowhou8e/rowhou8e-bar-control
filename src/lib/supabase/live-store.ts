'use client';

/**
 * ============================================================================
 *  LIVE STORE — ต่อกับฐานข้อมูล Supabase จริง (ใช้เมื่อ NEXT_PUBLIC_DATA_MODE=supabase)
 * ============================================================================
 * มี public API (subscribe/getSnapshot/hydrate/login/logout/submitChecklist ฯลฯ)
 * ตรงกับ mock store ใน src/lib/store.ts ทุกตัว เพื่อให้หน้าจอ (page.tsx) ทุกหน้า
 * ใช้ผ่าน useAppState()/useCurrentEmployee() ได้เหมือนกันทุกประการ ไม่ต้องแก้โค้ด
 * แยกตามโหมด — ตัวไฟล์นี้เป็นตัวเดียวที่รู้ว่ากำลังคุยกับฐานข้อมูลจริงอยู่
 *
 * การล็อกอิน: ใช้ Supabase Auth จริง (อีเมล + รหัสผ่าน) แทนระบบ PIN ของ mock store
 * — ต้องสร้างผู้ใช้ใน Supabase Auth และผูก employees.auth_user_id ไว้ก่อน (ดู README หัวข้อ 8)
 * ============================================================================
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './client';
import * as q from './queries';
import { detectDeviceLabel } from '../device';
import type { AppSettings, AppState, ChecklistEntryItem, ChecklistItemFrequency, ProductLotStatus, PurchaseOrderStatus, PurchaseRequestStatus, Role } from '../types';

/** ตารางที่เปิด Postgres Changes ไว้ (ดู schema.sql ส่วน "9) REALTIME") — subscribe เพื่อให้ทุกหน้าจอ
 *  ที่เปิดค้างไว้อัปเดตสดทันทีเมื่อมีคนอื่นบันทึกข้อมูล โดยไม่ต้องรีเฟรชเอง — เฟส 4
 *  cash_reports แยกออกมาต่างหาก (ดู setupRealtime) — subscribe เฉพาะ owner/manager เท่านั้น
 *  เพื่อไม่ให้ยอดเงินสดหลุดไปถึง client ของพนักงานทั่วไปผ่าน realtime broadcast */
const REALTIME_TABLES = [
  'stations', 'employees', 'stock_categories', 'stock_items',
  'checklist_template_items', 'checklist_runs', 'checklist_entry_items',
  'products', 'product_lots', 'purchase_requests', 'suppliers',
  'supplier_item_prices', 'purchase_orders', 'purchase_order_items',
  'store_holidays', 'order_reminders', 'order_draft_picks', 'history_logs', 'app_settings',
];

/** ตาราง -> ชื่อ resource ที่ต้องรีเฟรช ใช้ทั้งตอน realtime event จากคนอื่น (setupRealtime/scheduleRefetch)
 *  หลายตารางอาจแตะ resource เดียวกัน (เช่น checklist_runs + checklist_entry_items -> checklistRuns) */
const TABLE_RESOURCE: Record<string, string> = {
  stations: 'stations',
  employees: 'employees',
  stock_categories: 'stockCategories',
  stock_items: 'stockItems',
  checklist_template_items: 'checklistTemplate',
  checklist_runs: 'checklistRuns',
  checklist_entry_items: 'checklistRuns',
  products: 'products',
  product_lots: 'productLots',
  purchase_requests: 'purchaseRequests',
  suppliers: 'suppliers',
  supplier_item_prices: 'supplierItemPrices',
  purchase_orders: 'purchaseOrdersAndRequests',
  purchase_order_items: 'purchaseOrdersAndRequests',
  store_holidays: 'storeHolidays',
  order_reminders: 'orderReminders',
  order_draft_picks: 'orderDraftPicks',
  history_logs: 'historyLogs',
  app_settings: 'settings',
  cash_reports: 'cashReports',
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DEFAULT_SETTINGS: AppSettings = {
  checklistStartTime: '07:00',
  checklistDueTime: '10:00',
  milkShelfLifeDays: 3,
  notifyLeadHoursBeforeExpiry: 4,
  lowStockNotifyEnabled: true,
  closingTime: '20:00',
  closingSummaryEnabled: true,
};

function emptyState(initializing: boolean): AppState {
  return {
    employees: [],
    stations: [],
    stockItems: [],
    stockCategories: [],
    checklistRuns: [],
    checklistTemplate: [],
    products: [],
    productLots: [],
    purchaseRequests: [],
    suppliers: [],
    supplierItemPrices: [],
    purchaseOrders: [],
    cashReports: [],
    storeHolidays: [],
    orderReminders: [],
    orderDraftPicks: [],
    historyLogs: [],
    settings: DEFAULT_SETTINGS,
    session: null,
    initializing,
  };
}

export class LiveStore {
  private state: AppState = emptyState(true);
  private listeners = new Set<() => void>();
  private started = false;
  private realtimeChannel: RealtimeChannel | null = null;
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;
  private initRetryAttempt = 0;
  private initRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private dataRetryAttempt = 0;
  private dataRetryTimer: ReturnType<typeof setTimeout> | null = null;

  /** เริ่มตรวจสอบ session ครั้งแรก — เรียกครั้งเดียวจาก useEffect ใน use-store.ts */
  hydrate() {
    if (this.started) return;
    this.started = true;
    this.registerAuthListener();
    this.attemptInit();
  }

  private registerAuthListener() {
    const sb = getSupabaseClient();
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        this.teardownRealtime();
        if (this.dataRetryTimer) {
          clearTimeout(this.dataRetryTimer);
          this.dataRetryTimer = null;
        }
        this.dataRetryAttempt = 0;
        this.state = emptyState(false);
        this.notify();
      }
    });
  }

  /** ลองตรวจสอบ/โหลด session — ถ้าล้มเหลว (เช่น เน็ตหลุดชั่วคราว) จะลองใหม่อัตโนมัติแทนที่จะเด้งผู้ใช้ไปหน้า login ทันที */
  private attemptInit() {
    this.establishSession().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[LiveStore] establishSession failed (จะลองเชื่อมต่อใหม่)', err);
      if (this.initRetryTimer) clearTimeout(this.initRetryTimer);
      const delay = Math.min(2000 * 2 ** this.initRetryAttempt, 20000);
      this.initRetryAttempt++;
      this.initRetryTimer = setTimeout(() => {
        this.initRetryTimer = null;
        this.attemptInit();
      }, delay);
    });
  }

  private async establishSession() {
    const sb = getSupabaseClient();
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      this.state = emptyState(false);
      this.notify();
      return;
    }
    await this.loadAllData(data.session.user.id);
  }

  private async loadAllData(authUserId: string) {
    const hadSessionAlready = this.state.session !== null;
    try {
      const employee = await q.fetchEmployeeByAuthUserId(authUserId);
      if (!employee) {
        // มี session ของ Supabase Auth แต่ยังไม่มีพนักงานคนไหนผูก auth_user_id นี้ไว้
        this.state = emptyState(false);
        this.notify();
        return;
      }
      const [
        stations,
        employees,
        stockItems,
        stockCategories,
        checklistTemplate,
        checklistRuns,
        products,
        productLots,
        purchaseRequests,
        suppliers,
        supplierItemPrices,
        purchaseOrders,
        cashReports,
        storeHolidays,
        orderReminders,
        orderDraftPicks,
        settings,
        historyLogs,
      ] = await Promise.all([
        q.fetchStations(),
        q.fetchEmployees(),
        q.fetchStockItems(),
        q.fetchStockCategories(),
        q.fetchChecklistTemplateItems(),
        q.fetchAllChecklistRuns(),
        q.fetchProducts(),
        q.fetchProductLots(),
        q.fetchPurchaseRequests(),
        q.fetchSuppliers(),
        q.fetchSupplierItemPrices(),
        q.fetchPurchaseOrders(),
        q.fetchCashReports(),
        q.fetchStoreHolidays(),
        q.fetchOrderReminders(),
        q.fetchOrderDraftPicks(),
        q.fetchSettings(),
        q.fetchHistoryLogs(),
      ]);
      this.dataRetryAttempt = 0;
      this.state = {
        employees,
        stations,
        stockItems,
        stockCategories,
        checklistRuns,
        checklistTemplate,
        products,
        productLots,
        purchaseRequests,
        suppliers,
        supplierItemPrices,
        purchaseOrders,
        cashReports,
        storeHolidays,
        orderReminders,
        orderDraftPicks,
        historyLogs,
        settings,
        session: { employeeId: employee.id, loggedInAt: new Date().toISOString() },
        initializing: false,
      };
      this.notify();
      this.setupRealtime(employee.role);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[LiveStore] loadAllData failed (จะลองใหม่ ไม่ล็อกเอาต์ผู้ใช้)', err);
      if (!hadSessionAlready) {
        // โหลดข้อมูลครั้งแรกไม่สำเร็จ (เช่น เน็ตหลุดชั่วคราว) — คงหน้าจอ "กำลังโหลด" ไว้แล้วลองใหม่
        // แทนที่จะเด้งผู้ใช้ไปหน้า login ทั้งที่ session ของ Supabase ยังใช้ได้อยู่จริง
        this.state = { ...this.state, initializing: true };
        this.notify();
      }
      // ถ้ามี session อยู่แล้ว (กำลัง refresh ข้อมูลพื้นหลัง) จะไม่แตะ state เลย ผู้ใช้ไม่เห็นความผิดปกติใดๆ
      this.scheduleDataRetry(authUserId);
    }
  }

  private scheduleDataRetry(authUserId: string) {
    if (this.dataRetryTimer) clearTimeout(this.dataRetryTimer);
    const delay = Math.min(3000 * 2 ** this.dataRetryAttempt, 20000);
    this.dataRetryAttempt++;
    this.dataRetryTimer = setTimeout(() => {
      this.dataRetryTimer = null;
      this.loadAllData(authUserId);
    }, delay);
  }

  private async refetchAll() {
    const sb = getSupabaseClient();
    const { data } = await sb.auth.getSession();
    if (!data.session) return;
    await this.loadAllData(data.session.user.id);
  }

  /** รีเฟรชเฉพาะข้อมูลที่กระทบจริง แทนการโหลดทั้งหมดใหม่ (refetchAll) — ใช้กับ mutation ที่ผู้ใช้กดบ่อยๆ เพื่อให้ตอบสนองไว */
  private async refetchProducts() {
    const products = await q.fetchProducts();
    this.state = { ...this.state, products };
    this.notify();
  }

  private async refetchPurchaseRequests() {
    const purchaseRequests = await q.fetchPurchaseRequests();
    this.state = { ...this.state, purchaseRequests };
    this.notify();
  }

  private async refetchPurchaseOrdersAndRequests() {
    const [purchaseOrders, purchaseRequests] = await Promise.all([q.fetchPurchaseOrders(), q.fetchPurchaseRequests()]);
    this.state = { ...this.state, purchaseOrders, purchaseRequests };
    this.notify();
  }

  private async refetchOrderReminders() {
    const orderReminders = await q.fetchOrderReminders();
    this.state = { ...this.state, orderReminders };
    this.notify();
  }

  /** รีเฟรชเฉพาะจุด (เพิ่มเติมจาก 4 ตัวด้านบน) — ครอบคลุมตารางที่เหลือทั้งหมด เพื่อให้ mutation ทุกตัว
   *  และ realtime event ทุกตาราง อัปเดตเฉพาะส่วนของ state ที่เกี่ยวข้องจริง แทนการโหลดทั้งหมดใหม่ */
  private async refetchStations() {
    const stations = await q.fetchStations();
    this.state = { ...this.state, stations };
    this.notify();
  }

  private async refetchEmployees() {
    const employees = await q.fetchEmployees();
    this.state = { ...this.state, employees };
    this.notify();
  }

  private async refetchStockItems() {
    const stockItems = await q.fetchStockItems();
    this.state = { ...this.state, stockItems };
    this.notify();
  }

  private async refetchStockCategories() {
    const stockCategories = await q.fetchStockCategories();
    this.state = { ...this.state, stockCategories };
    this.notify();
  }

  private async refetchChecklistTemplate() {
    const checklistTemplate = await q.fetchChecklistTemplateItems();
    this.state = { ...this.state, checklistTemplate };
    this.notify();
  }

  private async refetchChecklistRuns() {
    const checklistRuns = await q.fetchAllChecklistRuns();
    this.state = { ...this.state, checklistRuns };
    this.notify();
  }

  private async refetchProductLots() {
    const productLots = await q.fetchProductLots();
    this.state = { ...this.state, productLots };
    this.notify();
  }

  private async refetchSuppliers() {
    const suppliers = await q.fetchSuppliers();
    this.state = { ...this.state, suppliers };
    this.notify();
  }

  private async refetchSupplierItemPrices() {
    const supplierItemPrices = await q.fetchSupplierItemPrices();
    this.state = { ...this.state, supplierItemPrices };
    this.notify();
  }

  private async refetchCashReports() {
    const cashReports = await q.fetchCashReports();
    this.state = { ...this.state, cashReports };
    this.notify();
  }

  private async refetchStoreHolidays() {
    const storeHolidays = await q.fetchStoreHolidays();
    this.state = { ...this.state, storeHolidays };
    this.notify();
  }

  private async refetchOrderDraftPicks() {
    const orderDraftPicks = await q.fetchOrderDraftPicks();
    this.state = { ...this.state, orderDraftPicks };
    this.notify();
  }

  private async refetchSettings() {
    const settings = await q.fetchSettings();
    this.state = { ...this.state, settings };
    this.notify();
  }

  private async refetchHistoryLogs() {
    const historyLogs = await q.fetchHistoryLogs();
    this.state = { ...this.state, historyLogs };
    this.notify();
  }

  /** ตาราง -> ฟังก์ชันรีเฟรชเฉพาะจุดที่ตรงกัน ใช้ทั้งตอน mutation ของตัวเองและตอนรับ realtime event จากคนอื่น */
  private async refetchResource(key: string) {
    switch (key) {
      case 'stations': return this.refetchStations();
      case 'employees': return this.refetchEmployees();
      case 'stockItems': return this.refetchStockItems();
      case 'stockCategories': return this.refetchStockCategories();
      case 'checklistTemplate': return this.refetchChecklistTemplate();
      case 'checklistRuns': return this.refetchChecklistRuns();
      case 'products': return this.refetchProducts();
      case 'productLots': return this.refetchProductLots();
      case 'purchaseRequests': return this.refetchPurchaseRequests();
      case 'suppliers': return this.refetchSuppliers();
      case 'supplierItemPrices': return this.refetchSupplierItemPrices();
      case 'purchaseOrdersAndRequests': return this.refetchPurchaseOrdersAndRequests();
      case 'storeHolidays': return this.refetchStoreHolidays();
      case 'orderReminders': return this.refetchOrderReminders();
      case 'orderDraftPicks': return this.refetchOrderDraftPicks();
      case 'historyLogs': return this.refetchHistoryLogs();
      case 'settings': return this.refetchSettings();
      case 'cashReports': return this.refetchCashReports();
      default: return;
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AppState => this.state;

  getServerSnapshot = (): AppState => emptyState(true);

  private notify() {
    this.listeners.forEach((l) => l());
  }

  /** debounce refetch — เวลามีหลาย postgres_changes events รัวกัน (เช่น สร้างใบสั่งซื้อ+รายการในนั้นพร้อมกัน)
   *  ไม่อยาก refetch ซ้ำหลายรอบติดกัน — และรีเฟรชเฉพาะ resource ของตารางที่เปลี่ยนจริง ไม่ใช่โหลดทั้งหมดใหม่
   *  (ถ้าหลายตารางเปลี่ยนพร้อมกันในช่วง debounce เดียว จะรวมกันแล้วรีเฟรชแต่ละ resource แค่ครั้งเดียว) */
  private pendingRefetchTables = new Set<string>();

  private scheduleRefetch(table: string) {
    this.pendingRefetchTables.add(table);
    if (this.refetchTimer) clearTimeout(this.refetchTimer);
    this.refetchTimer = setTimeout(() => {
      this.refetchTimer = null;
      const tables = Array.from(this.pendingRefetchTables);
      this.pendingRefetchTables.clear();
      const resourceKeys = new Set(tables.map((t) => TABLE_RESOURCE[t]).filter((k): k is string => Boolean(k)));
      Promise.all(Array.from(resourceKeys).map((key) => this.refetchResource(key))).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[LiveStore] scoped refetch จาก realtime event ล้มเหลว (จะลองใหม่ตอน event ถัดไป)', err);
      });
    }, 400);
  }

  /** subscribe ฟัง Postgres Changes ของตารางหลักทั้งหมด — เมื่อพนักงานคนอื่นบันทึกข้อมูล
   *  หน้าจอของทุกคนที่เปิดค้างไว้จะอัปเดตสดโดยอัตโนมัติ ไม่ต้องรีเฟรชเอง — เฟส 4
   *  cash_reports subscribe เฉพาะ owner/manager เท่านั้น (เห็น/บันทึกได้เฉพาะสองสิทธิ์นี้อยู่แล้ว) */
  private setupRealtime(role: Role) {
    const sb = getSupabaseClient();
    if (this.realtimeChannel) {
      sb.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    const tables = role === 'owner' || role === 'manager' ? [...REALTIME_TABLES, 'cash_reports'] : REALTIME_TABLES;
    let channel = sb.channel('app-changes');
    for (const table of tables) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => this.scheduleRefetch(table));
    }
    channel.subscribe();
    this.realtimeChannel = channel;
  }

  private teardownRealtime() {
    if (this.refetchTimer) {
      clearTimeout(this.refetchTimer);
      this.refetchTimer = null;
    }
    if (this.realtimeChannel) {
      const sb = getSupabaseClient();
      sb.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  // ================= AUTH =================
  async login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const sb = getSupabaseClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return { ok: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }
    // บันทึกอุปกรณ์/เวลาล็อกอินล่าสุด — เก็บแค่ครั้งล่าสุดครั้งเดียว (ไม่ใช่ประวัติ) เฟส 4
    try {
      await q.recordLogin(detectDeviceLabel());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[LiveStore] recordLogin failed (ไม่กระทบการล็อกอิน)', err);
    }
    await this.loadAllData(data.session.user.id);
    if (!this.state.session) {
      return { ok: false, error: 'ล็อกอินสำเร็จ แต่ไม่พบข้อมูลพนักงานที่ผูกกับบัญชีนี้ — ติดต่อเจ้าของร้านให้ผูกบัญชีให้' };
    }
    return { ok: true };
  }

  async logout() {
    const sb = getSupabaseClient();
    this.teardownRealtime();
    if (this.dataRetryTimer) {
      clearTimeout(this.dataRetryTimer);
      this.dataRetryTimer = null;
    }
    this.dataRetryAttempt = 0;
    await sb.auth.signOut();
    this.state = emptyState(false);
    this.notify();
  }

  // ================= CHECKLIST =================
  async submitChecklist(
    stationId: string,
    dateStr: string,
    items: ChecklistEntryItem[],
    employeeId: string,
    backdatedReason: string | null
  ) {
    await q.submitChecklist(stationId, dateStr || todayStr(), items, employeeId, backdatedReason);
    await this.refetchChecklistRuns();
  }

  // ================= สินค้าที่ผลิต (Products) =================
  async createProduct(input: { stationId: string; name: string; unit: string; shelfLifeDays: number; actorId: string }) {
    await q.createProduct(input);
    await this.refetchProducts();
  }

  async updateProduct(id: string, patch: { name?: string; unit?: string; shelfLifeDays?: number }, actorId: string) {
    await q.updateProduct(id, patch, actorId);
    await this.refetchProducts();
  }

  async deleteProduct(id: string, actorId: string) {
    await q.deleteProduct(id, actorId);
    await this.refetchProducts();
  }

  // ================= ล็อตการผลิต (Product Lots) =================
  async createProductLot(input: {
    productId: string;
    producedDate: string;
    producedTime: string;
    quantity: number;
    unit: string;
    producedBy: string;
    note: string;
    photoUrl: string | null;
  }) {
    await q.createProductLot(input);
    await this.refetchProductLots();
  }

  async setProductLotStatus(id: string, status: ProductLotStatus, employeeId: string) {
    await q.setProductLotStatus(id, status, employeeId);
    await this.refetchProductLots();
  }

  // ================= STOCK =================
  async adjustStock(id: string, quantity: number, note: string, employeeId: string) {
    await q.adjustStockQuantity(id, quantity, note, employeeId);
    await this.refetchStockItems();
  }

  async markStockUnusable(id: string, note: string, employeeId: string) {
    await q.markStockUnusable(id, note, employeeId);
    await this.refetchStockItems();
  }

  // ================= PURCHASE REQUESTS =================
  async createPurchaseRequest(input: {
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
    await q.createPurchaseRequest(input);
    await this.refetchPurchaseRequests();
  }

  async updatePurchaseRequestStatus(id: string, status: PurchaseRequestStatus, employeeId: string) {
    await q.updatePurchaseRequestStatus(id, status, employeeId);
    // status 'received' อาจเพิ่มจำนวนกลับเข้าสต๊อกด้วย (ดู queries.ts) — รีเฟรชทั้งสองจุด
    await Promise.all([this.refetchPurchaseRequests(), this.refetchStockItems()]);
  }

  // ================= SETTINGS =================
  async updateSettings(patch: Partial<AppSettings>, employeeId: string) {
    await q.updateSettings(patch, employeeId);
    await this.refetchSettings();
  }

  /** เพิ่มพนักงานใหม่ — สร้างบัญชี Supabase Auth (email/password) ผ่าน API route ฝั่งเซิร์ฟเวอร์ แล้วผูกกับแถวพนักงานใหม่ */
  async createEmployee(input: {
    name: string;
    nickname: string;
    role: Role;
    stationId: string | null;
    stationIds: string[];
    pinCode: string;
    email: string;
    password: string;
    actorId: string;
  }) {
    await q.createEmployee(input);
    await this.refetchEmployees();
  }

  async updateEmployee(
    id: string,
    patch: { role?: Role; active?: boolean; stationId?: string | null; stationIds?: string[]; name?: string; nickname?: string },
    actorId: string
  ) {
    await q.updateEmployee(id, patch, actorId);
    await this.refetchEmployees();
  }

  /** เจ้าของร้านตั้งรหัสผ่านใหม่ให้พนักงานคนอื่น — ผ่าน API route ฝั่งเซิร์ฟเวอร์ (ดู queries.ts) */
  async resetEmployeePassword(employeeId: string, newPassword: string, actorId: string) {
    await q.resetEmployeePassword(employeeId, newPassword, actorId);
  }

  // ================= จัดการรายการวัตถุดิบ =================
  async createStockItem(input: {
    name: string;
    categoryId: string;
    unit: string;
    minQuantity: number;
    parQuantity: number;
    quantity: number;
    supplierId: string | null;
    actorId: string;
  }) {
    await q.createStockItem(input);
    await this.refetchStockItems();
  }

  async updateStockItemDetails(
    id: string,
    patch: { name?: string; categoryId?: string; unit?: string; minQuantity?: number; parQuantity?: number; supplierId?: string | null },
    actorId: string
  ) {
    await q.updateStockItemDetails(id, patch, actorId);
    await this.refetchStockItems();
  }

  async deleteStockItem(id: string, actorId: string) {
    await q.deleteStockItem(id, actorId);
    await this.refetchStockItems();
  }

  async updateStockCategoryName(id: string, name: string, actorId: string) {
    await q.updateStockCategoryName(id, name, actorId);
    await this.refetchStockCategories();
  }

  async createStockCategory(input: { name: string; actorId: string }) {
    await q.createStockCategory(input);
    await this.refetchStockCategories();
  }

  async deleteStockCategory(id: string, actorId: string) {
    await q.deleteStockCategory(id, actorId);
    await this.refetchStockCategories();
  }

  // ================= ผู้ขาย/ซัพพลายเออร์ (Suppliers) =================
  async createSupplier(input: { name: string; contactPerson: string; phone: string; address: string; note: string; actorId: string }) {
    await q.createSupplier(input);
    await this.refetchSuppliers();
  }

  async updateSupplier(
    id: string,
    patch: { name?: string; contactPerson?: string; phone?: string; address?: string; note?: string },
    actorId: string
  ) {
    await q.updateSupplier(id, patch, actorId);
    await this.refetchSuppliers();
  }

  async deleteSupplier(id: string, actorId: string) {
    await q.deleteSupplier(id, actorId);
    await this.refetchSuppliers();
  }

  async addSupplierItemPrice(input: { supplierId: string; stockItemId: string; unit: string; price: number; note: string; actorId: string }) {
    await q.addSupplierItemPrice(input);
    await this.refetchSupplierItemPrices();
  }

  // ================= ใบสั่งซื้อ (Purchase Orders) =================
  async createOrMergePurchaseOrder(input: {
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
    await q.createOrMergePurchaseOrder(input);
    await this.refetchPurchaseOrdersAndRequests();
  }

  async updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus, actorId: string) {
    await q.updatePurchaseOrderStatus(id, status, actorId);
    // status 'received' อาจเพิ่มจำนวนกลับเข้าสต๊อกด้วย (ดู queries.ts) — รีเฟรชทั้งสองจุด
    await Promise.all([this.refetchPurchaseOrdersAndRequests(), this.refetchStockItems()]);
  }

  async updatePurchaseOrderItemPrice(purchaseOrderId: string, itemId: string, unitPrice: number, actorId: string) {
    await q.updatePurchaseOrderItemPrice(purchaseOrderId, itemId, unitPrice, actorId);
    await this.refetchPurchaseOrdersAndRequests();
  }

  async addPurchaseOrderItem(input: {
    purchaseOrderId: string;
    stockItemId: string | null;
    itemName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    actorId: string;
  }) {
    await q.addPurchaseOrderItem(input);
    await this.refetchPurchaseOrdersAndRequests();
  }

  async removePurchaseOrderItem(purchaseOrderId: string, itemId: string, actorId: string) {
    await q.removePurchaseOrderItem(purchaseOrderId, itemId, actorId);
    await this.refetchPurchaseOrdersAndRequests();
  }

  // ================= รายงานเงินสดปิดร้าน (owner/manager เท่านั้น) — เฟส 3 =================
  async submitCashReport(input: { date: string; closingAmount: number; note: string; actorId: string }) {
    await q.submitCashReport(input);
    await this.refetchCashReports();
  }

  async updateCashReport(id: string, patch: { closingAmount?: number; note?: string }, actorId: string) {
    await q.updateCashReport(id, patch, actorId);
    await this.refetchCashReports();
  }

  async sendOrderReminder(input: { stationId: string; message: string; actorId: string }) {
    await q.sendOrderReminder(input);
    await this.refetchOrderReminders();
  }

  async acknowledgeOrderReminder(id: string, input: { willOrder: boolean; note: string }, actorId: string) {
    await q.acknowledgeOrderReminder(id, input, actorId);
    await this.refetchOrderReminders();
  }

  async deleteOrderReminder(id: string, actorId: string) {
    await q.deleteOrderReminder(id, actorId);
    await this.refetchOrderReminders();
  }

  // ================= ติ๊กเลือกสินค้าแบบเรียลไทม์ที่หน้า "สั่งสินค้า" (ก่อนบันทึกสั่งซื้อจริง) =================
  async setOrderDraftPick(stockItemId: string, quantity: number, employeeId: string) {
    await q.setOrderDraftPick(stockItemId, quantity, employeeId);
    await this.refetchOrderDraftPicks();
  }

  async clearOrderDraftPick(stockItemId: string, employeeId: string) {
    await q.clearOrderDraftPick(stockItemId, employeeId);
    await this.refetchOrderDraftPicks();
  }

  // ================= วันหยุดร้าน (owner/manager เท่านั้น) — เฟส 4 =================
  async addStoreHoliday(input: { date: string; label: string; actorId: string }) {
    await q.addStoreHoliday(input);
    await this.refetchStoreHolidays();
  }

  async removeStoreHoliday(id: string, actorId: string) {
    await q.removeStoreHoliday(id, actorId);
    await this.refetchStoreHolidays();
  }

  // ================= แผนก/สถานี (Stations) — owner เท่านั้น =================
  async createStation(input: { name: string; hasProduction: boolean; actorId: string }) {
    await q.createStation(input);
    await this.refetchStations();
  }

  async updateStation(id: string, patch: { name?: string; hasProduction?: boolean }, actorId: string) {
    await q.updateStation(id, patch, actorId);
    await this.refetchStations();
  }

  async deleteStation(id: string, actorId: string) {
    await q.deleteStation(id, actorId);
    await this.refetchStations();
  }

  // ================= จัดการรายการเช็กลิสต์ =================
  async createChecklistTemplateItem(input: {
    stationId: string;
    label: string;
    actorId: string;
    frequency?: ChecklistItemFrequency;
    weeklyDays?: number[] | null;
    monthlyDay?: number | null;
  }) {
    await q.createChecklistTemplateItem(input);
    await this.refetchChecklistTemplate();
  }

  async updateChecklistTemplateItem(
    id: string,
    patch: { label?: string; frequency?: ChecklistItemFrequency; weeklyDays?: number[] | null; monthlyDay?: number | null },
    actorId: string
  ) {
    await q.updateChecklistTemplateItem(id, patch, actorId);
    await this.refetchChecklistTemplate();
  }

  async deleteChecklistTemplateItem(id: string, actorId: string) {
    await q.deleteChecklistTemplateItem(id, actorId);
    await this.refetchChecklistTemplate();
  }
}
