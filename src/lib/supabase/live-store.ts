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
import type { AppSettings, AppState, ChecklistEntryItem, ChecklistItemFrequency, ProductLotStatus, PurchaseOrder, PurchaseOrderStatus, PurchaseRequestStatus, Role, SpecialDayType, Weekday, WorkCalendarReasonType, WorkCalendarStatus } from '../types';

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
  'employee_weekly_pattern', 'work_calendar_entries', 'work_calendar_history', 'special_days',
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
  employee_weekly_pattern: 'weeklyPatterns',
  work_calendar_entries: 'workCalendarEntries',
  work_calendar_history: 'workCalendarHistory',
  special_days: 'specialDays',
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
    weeklyPatterns: [],
    workCalendarEntries: [],
    workCalendarHistory: [],
    specialDays: [],
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

  /** กันเคส race condition: refetch ของ resource เดียวกันถูกเรียกซ้อนกันได้สองทาง — (1) explicit refetch
   *  ที่เรียกทันทีหลัง mutation ของตัวเองสำเร็จ กับ (2) scoped refetch ที่มาจาก scheduleRefetch/realtime event
   *  (ดู postgres_changes ด้านล่าง) ถ้าคำขอที่เริ่มก่อนแต่ตอบช้ากว่าดันตอบกลับมาทีหลังคำขอที่เริ่มทีหลังแต่ตอบไวกว่า
   *  จะทับ state ที่ใหม่กว่าด้วยข้อมูลเก่า (เช่น ใบสั่งซื้อที่เพิ่ง insert รายการเสร็จ โดน refetch ที่เริ่มคุยกับ DB
   *  ก่อนรายการจะถูก insert ทับกลับไปเป็น 0 รายการ) — refetchSeq[key] เก็บเลขคำขอล่าสุดของแต่ละ resource
   *  ไว้เทียบตอนคำตอบกลับมา ถ้าไม่ใช่คำขอล่าสุดแล้วจะทิ้งผลลัพธ์นั้น ไม่เอาไป commit ทับ state */
  private refetchSeq: Record<string, number> = {};

  /** ดึงข้อมูลด้วย fetcher แล้ว commit เข้า state เฉพาะตอนที่ยังเป็นคำขอล่าสุดของ resource นี้เท่านั้น (ดูคอมเมนต์ refetchSeq) */
  private async commitLatest<T>(key: string, fetcher: () => Promise<T>, apply: (data: T) => AppState) {
    const seq = (this.refetchSeq[key] ?? 0) + 1;
    this.refetchSeq[key] = seq;
    const data = await fetcher();
    if (this.refetchSeq[key] !== seq) return; // มีคำขอใหม่กว่าเริ่มไปแล้วระหว่างรอ — ทิ้งผลลัพธ์เก่าทิ้งไป
    this.state = apply(data);
    this.notify();
  }

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
        weeklyPatterns,
        workCalendarEntries,
        workCalendarHistory,
        specialDays,
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
        q.fetchWeeklyPatterns().catch((e) => { console.error("[LiveStore] fetchWeeklyPatterns failed (ตารางยังไม่มีใน DB หรือยังไม่ได้ migrate)", e); return []; }),
        q.fetchWorkCalendarEntries().catch((e) => { console.error("[LiveStore] fetchWorkCalendarEntries failed", e); return []; }),
        q.fetchWorkCalendarHistory().catch((e) => { console.error("[LiveStore] fetchWorkCalendarHistory failed", e); return []; }),
        q.fetchSpecialDays().catch((e) => { console.error("[LiveStore] fetchSpecialDays failed", e); return []; }),
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
        weeklyPatterns,
        workCalendarEntries,
        workCalendarHistory,
        specialDays,
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
    await this.commitLatest('products', () => q.fetchProducts(), (products) => ({ ...this.state, products }));
  }

  private async refetchPurchaseRequests() {
    await this.commitLatest('purchaseRequests', () => q.fetchPurchaseRequests(), (purchaseRequests) => ({ ...this.state, purchaseRequests }));
  }

  private async refetchPurchaseOrdersAndRequests() {
    await this.commitLatest(
      'purchaseOrdersAndRequests',
      () => Promise.all([q.fetchPurchaseOrders(), q.fetchPurchaseRequests()]),
      ([purchaseOrders, purchaseRequests]) => ({ ...this.state, purchaseOrders, purchaseRequests }),
    );
  }

  private async refetchOrderReminders() {
    await this.commitLatest('orderReminders', () => q.fetchOrderReminders(), (orderReminders) => ({ ...this.state, orderReminders }));
  }

  /** รีเฟรชเฉพาะจุด (เพิ่มเติมจาก 4 ตัวด้านบน) — ครอบคลุมตารางที่เหลือทั้งหมด เพื่อให้ mutation ทุกตัว
   *  และ realtime event ทุกตาราง อัปเดตเฉพาะส่วนของ state ที่เกี่ยวข้องจริง แทนการโหลดทั้งหมดใหม่ */
  private async refetchStations() {
    await this.commitLatest('stations', () => q.fetchStations(), (stations) => ({ ...this.state, stations }));
  }

  private async refetchEmployees() {
    await this.commitLatest('employees', () => q.fetchEmployees(), (employees) => ({ ...this.state, employees }));
  }

  private async refetchStockItems() {
    await this.commitLatest('stockItems', () => q.fetchStockItems(), (stockItems) => ({ ...this.state, stockItems }));
  }

  private async refetchStockCategories() {
    await this.commitLatest('stockCategories', () => q.fetchStockCategories(), (stockCategories) => ({ ...this.state, stockCategories }));
  }

  private async refetchChecklistTemplate() {
    await this.commitLatest('checklistTemplate', () => q.fetchChecklistTemplateItems(), (checklistTemplate) => ({ ...this.state, checklistTemplate }));
  }

  private async refetchChecklistRuns() {
    await this.commitLatest('checklistRuns', () => q.fetchAllChecklistRuns(), (checklistRuns) => ({ ...this.state, checklistRuns }));
  }

  private async refetchProductLots() {
    await this.commitLatest('productLots', () => q.fetchProductLots(), (productLots) => ({ ...this.state, productLots }));
  }

  private async refetchSuppliers() {
    await this.commitLatest('suppliers', () => q.fetchSuppliers(), (suppliers) => ({ ...this.state, suppliers }));
  }

  private async refetchSupplierItemPrices() {
    await this.commitLatest('supplierItemPrices', () => q.fetchSupplierItemPrices(), (supplierItemPrices) => ({ ...this.state, supplierItemPrices }));
  }

  private async refetchCashReports() {
    await this.commitLatest('cashReports', () => q.fetchCashReports(), (cashReports) => ({ ...this.state, cashReports }));
  }

  private async refetchStoreHolidays() {
    await this.commitLatest('storeHolidays', () => q.fetchStoreHolidays(), (storeHolidays) => ({ ...this.state, storeHolidays }));
  }

  private async refetchOrderDraftPicks() {
    await this.commitLatest('orderDraftPicks', () => q.fetchOrderDraftPicks(), (orderDraftPicks) => ({ ...this.state, orderDraftPicks }));
  }

  private async refetchWeeklyPatterns() {
    await this.commitLatest('weeklyPatterns', () => q.fetchWeeklyPatterns(), (weeklyPatterns) => ({ ...this.state, weeklyPatterns }));
  }

  private async refetchWorkCalendarEntries() {
    await this.commitLatest('workCalendarEntries', () => q.fetchWorkCalendarEntries(), (workCalendarEntries) => ({ ...this.state, workCalendarEntries }));
  }

  private async refetchWorkCalendarHistory() {
    await this.commitLatest('workCalendarHistory', () => q.fetchWorkCalendarHistory(), (workCalendarHistory) => ({ ...this.state, workCalendarHistory }));
  }

  private async refetchSpecialDays() {
    await this.commitLatest('specialDays', () => q.fetchSpecialDays(), (specialDays) => ({ ...this.state, specialDays }));
  }

  private async refetchSettings() {
    await this.commitLatest('settings', () => q.fetchSettings(), (settings) => ({ ...this.state, settings }));
  }

  private async refetchHistoryLogs() {
    await this.commitLatest('historyLogs', () => q.fetchHistoryLogs(), (historyLogs) => ({ ...this.state, historyLogs }));
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
      case 'weeklyPatterns': return this.refetchWeeklyPatterns();
      case 'workCalendarEntries': return this.refetchWorkCalendarEntries();
      case 'workCalendarHistory': return this.refetchWorkCalendarHistory();
      case 'specialDays': return this.refetchSpecialDays();
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

  /** เจ้าของร้านดูอีเมลที่พนักงานแต่ละคนใช้ล็อกอิน — ผ่าน API route ฝั่งเซิร์ฟเวอร์ (ดู queries.ts) */
  async fetchEmployeeEmails() {
    return q.fetchEmployeeEmails();
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
  async createSupplier(input: {
    name: string;
    contactPerson: string;
    phone: string;
    address: string;
    note: string;
    color?: string | null;
    actorId: string;
  }) {
    await q.createSupplier(input);
    await this.refetchSuppliers();
  }

  async updateSupplier(
    id: string,
    patch: { name?: string; contactPerson?: string; phone?: string; address?: string; note?: string; color?: string | null },
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
    const orderId = await q.createOrMergePurchaseOrder(input);

    // อัปเดต state ทันทีด้วยข้อมูลที่รู้แน่ชัดอยู่แล้วว่าถูกต้อง (มาจาก input ที่เพิ่งส่งไปบันทึกสำเร็จเอง)
    // ไม่ต้องรอ refetch จาก DB เลย — กันไม่ให้พนักงานเห็นหน้าใบสั่งซื้อ "0 รายการ" แวบหนึ่งก่อนข้อมูลจริงมาถึง
    const optimisticOrder = this.buildOptimisticPurchaseOrder(orderId, input);
    this.state = { ...this.state, purchaseOrders: this.upsertPurchaseOrder(this.state.purchaseOrders, optimisticOrder) };
    this.notify();

    await this.refetchPurchaseOrdersAndRequests();

    // กันอีกชั้น: เผื่อ refetch ข้างบนไปชนกับ response อื่นที่เริ่มคุยกับ DB ไปก่อนหน้านี้แล้ว (เช่น scoped
    // refetch ที่ตั้งเวลาไว้จาก realtime event ก่อนหน้า) แล้วตอบกลับมาทีหลัง ทับ state ด้วยรายการที่น้อยกว่า
    // ที่เรารู้แน่ชัดว่าบันทึกไปแล้วจริง — ถ้าหลัง refetch ออเดอร์นี้มีรายการน้อยกว่าที่ควรจะเป็น ให้ทับด้วย
    // optimistic data อีกรอบ เพื่อให้ผลลัพธ์สุดท้ายของฟังก์ชันนี้ถูกต้องเสมอไม่ว่า refetch จะพลาดหรือไม่
    const afterRefetch = this.state.purchaseOrders.find((p) => p.id === orderId);
    if (!afterRefetch || afterRefetch.items.length < optimisticOrder.items.length) {
      this.state = { ...this.state, purchaseOrders: this.upsertPurchaseOrder(this.state.purchaseOrders, optimisticOrder) };
      this.notify();
    }

    return orderId;
  }

  /** สร้าง PurchaseOrder (ชั่วคราว) จาก input ที่เพิ่งบันทึกสำเร็จ — ใช้เป็น "ความจริงที่รู้แน่ชัด" กันการ
   *  แสดงรายการเป็น 0 ระหว่างรอ/กรณี refetch คืนข้อมูลเก่ามาทับ (ดูคอมเมนต์ใน createOrMergePurchaseOrder) */
  private buildOptimisticPurchaseOrder(
    orderId: string,
    input: {
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
    }
  ): PurchaseOrder {
    const existing = this.state.purchaseOrders.find((p) => p.id === orderId);
    const newItems = input.items.map((it, idx) => ({
      id: `optimistic-${orderId}-${idx}`,
      purchaseOrderId: orderId,
      stockItemId: it.stockItemId,
      itemName: it.itemName,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      sourcePurchaseRequestId: it.sourcePurchaseRequestId,
    }));
    if (existing) {
      return { ...existing, items: [...existing.items, ...newItems] };
    }
    return {
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
  }

  private upsertPurchaseOrder(orders: PurchaseOrder[], order: PurchaseOrder): PurchaseOrder[] {
    const exists = orders.some((o) => o.id === order.id);
    return exists ? orders.map((o) => (o.id === order.id ? order : o)) : [order, ...orders];
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

  // ================= ปฏิทินการทำงาน (Work Schedule Calendar) — เฟส 5 =================
  async setWeeklyPattern(employeeId: string, days: { weekday: Weekday; isDayOff: boolean }[], actorId: string) {
    await q.setWeeklyPattern(employeeId, days, actorId);
    await this.refetchWeeklyPatterns();
  }

  async setCalendarDay(input: {
    employeeId: string;
    date: string;
    status: WorkCalendarStatus;
    reasonType: WorkCalendarReasonType | null;
    note: string;
    actorId: string;
  }) {
    await q.setCalendarDay(input);
    await Promise.all([this.refetchWorkCalendarEntries(), this.refetchWorkCalendarHistory()]);
  }

  async clearCalendarDay(employeeId: string, date: string, actorId: string) {
    await q.clearCalendarDay(employeeId, date, actorId);
    await Promise.all([this.refetchWorkCalendarEntries(), this.refetchWorkCalendarHistory()]);
  }

  async createCalendarSwap(input: {
    employeeAId: string;
    dateA: string;
    statusA: WorkCalendarStatus;
    employeeBId: string;
    dateB: string;
    statusB: WorkCalendarStatus;
    note: string;
    actorId: string;
  }) {
    await q.createCalendarSwap(input);
    await Promise.all([this.refetchWorkCalendarEntries(), this.refetchWorkCalendarHistory()]);
  }

  async removeCalendarSwap(swapPairId: string, actorId: string) {
    await q.removeCalendarSwap(swapPairId, actorId);
    await Promise.all([this.refetchWorkCalendarEntries(), this.refetchWorkCalendarHistory()]);
  }

  async addSpecialDay(input: { date: string; dayType: SpecialDayType; label: string; actorId: string }) {
    await q.addSpecialDay(input);
    await this.refetchSpecialDays();
  }

  async removeSpecialDay(id: string, actorId: string) {
    await q.removeSpecialDay(id, actorId);
    await this.refetchSpecialDays();
  }

  async bulkAddSpecialDays(days: { date: string; dayType: SpecialDayType; label: string }[], actorId: string) {
    await q.bulkAddSpecialDays(days, actorId);
    await this.refetchSpecialDays();
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
