/**
 * Rowhou8e OPS — Type definitions
 * ไฟล์นี้เป็น "single source of truth" ของโครงสร้างข้อมูลทั้งระบบ
 * โครงสร้างตรงกับตารางใน src/lib/supabase/schema.sql แบบ 1:1
 * เพื่อให้สลับจาก mock data ไป Supabase ได้โดยไม่ต้องแก้ type
 *
 * หมายเหตุ: ในโค้ดยังใช้ชื่อภายในว่า "station"/"stationId" (ของเดิม) แทนคำว่า "แผนก"/"department"
 * ตามสเปก Rowhou8e OPS เพื่อลดความเสี่ยงจากการเปลี่ยนชื่อไฟล์/ตัวแปรจำนวนมากโดยไม่จำเป็น —
 * ในหน้าจอ (UI) จะแสดงเป็น "แผนก" ให้ตรงสเปกเสมอ
 */

export type Role = 'owner' | 'manager' | 'staff';

/** แผนกแต่ละแผนกในร้าน (ครัวขนม/ครัวผลิตขนมปัง/ครัวบาร์น้ำ/ครัวจิปาถะ) — แต่ละแผนกมีเช็กลิสต์ของตัวเอง แยกกันเช็กและแยกกันดูสถานะ */
export interface Station {
  id: string;
  name: string;
  active: boolean;
  order: number;
  /** false = แผนกไม่มีระบบผลิต ใช้เฉพาะสต๊อก/การสั่งซื้อ (เช่น ครัวจิปาถะ) */
  hasProduction: boolean;
}

export interface Employee {
  id: string;
  name: string;
  nickname: string;
  role: Role;
  avatarColor: string; // ใช้แสดงตัวอักษรย่อสีพื้นหลัง (ไม่มีระบบรูปโปรไฟล์ในเวอร์ชันนี้)
  pinCode: string; // PIN 4 หลักสำหรับยืนยันตัวตนแบบง่าย (prototype only — production ควรใช้ Supabase Auth)
  stationId: string | null; // แผนกที่ประจำ — null สำหรับ Owner/Manager หรือพนักงานที่ไม่ได้ผูกกับแผนกเดียว
  active: boolean;
  createdAt: string;
  /** อุปกรณ์/เวลาล็อกอินล่าสุด — เก็บแค่ครั้งล่าสุดครั้งเดียวต่อพนักงาน (ไม่ใช่ประวัติ) — เฟส 4 */
  lastLoginAt: string | null;
  lastLoginDevice: string | null;
}

export type ItemStatus =
  | 'normal' // ปกติ
  | 'low' // ใกล้หมด
  | 'out' // หมด
  | 'near_expiry' // ใกล้หมดอายุ
  | 'expired' // หมดอายุ
  | 'unusable'; // ใช้ไม่ได้

export interface StockCategory {
  id: string;
  name: string;
}

export interface StockItem {
  id: string;
  name: string;
  categoryId: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  parQuantity: number; // จำนวนที่ควรมี
  expiryDate: string | null;
  status: ItemStatus;
  note: string;
  updatedAt: string;
  updatedBy: string; // employeeId
  /** false = "ลบ" ออกจากรายการวัตถุดิบ (soft-delete) — เก็บแถวไว้เพราะ purchase_requests อ้างอิงอยู่ */
  active: boolean;
  /** ผู้ขายที่เจ้าของ/ผู้จัดการกำหนดไว้ล่วงหน้า (ตั้งค่าที่หน้า "ตั้งค่าระบบ") — null = ยังไม่ระบุ
   *  พนักงานเลือกผู้ขายเองตอนสั่งสินค้าไม่ได้อีกต่อไป หน้า "สั่งสินค้า" (/order) ใช้ค่านี้โดยตรง
   *  และซ่อนรายการที่ยังไม่ระบุผู้ขายออกจากรายการที่สั่งได้ */
  supplierId: string | null;
}

/**
 * สถานะเมื่อตรวจเช็กลิสต์ — ครบ 9 สถานะตามสเปก Rowhou8e OPS §7
 * เมื่อเลือก expired / unusable / production_failed หน้าจอจะบังคับถ่ายรูป + ระบุเหตุผล + ระบุจำนวน
 */
export type ChecklistItemStatus =
  | 'normal' // ปกติ
  | 'near_expiry' // ใกล้หมดอายุ
  | 'used_up' // ใช้หมดแล้ว
  | 'unusable' // ใช้ไม่ได้
  | 'expired' // หมดอายุ
  | 'banned' // ห้ามใช้
  | 'discarded' // ทิ้งแล้ว
  | 'refilled' // ผลิตใหม่แล้ว
  | 'production_failed'; // ผลิตไม่ผ่าน

/** สถานะกลุ่มนี้ต้องบังคับถ่ายรูป + ระบุเหตุผล + ระบุจำนวน + แจ้งผู้จัดการ (สเปก §7) */
export const RISKY_CHECKLIST_STATUSES: ChecklistItemStatus[] = ['expired', 'unusable', 'production_failed'];

export type ChecklistItemFrequency = 'daily' | 'weekly' | 'monthly';

export interface ChecklistTemplateItem {
  id: string;
  stationId: string; // แต่ละแผนกมีรายการเช็กลิสต์เป็นของตัวเอง
  label: string;
  order: number;
  active: boolean;
  /** ความถี่ในการทำ: daily = ทุกวัน (ค่าเริ่มต้น), weekly = เลือกวันในสัปดาห์, monthly = เลือกวันที่ของเดือน */
  frequency?: ChecklistItemFrequency;
  /** ใช้เมื่อ frequency = 'weekly' — เลข 0-6 (0=อาทิตย์ ... 6=เสาร์) */
  weeklyDays?: number[] | null;
  /** ใช้เมื่อ frequency = 'monthly' — วันที่ 1-31 ของเดือน */
  monthlyDay?: number | null;
}

export interface ChecklistEntryItem {
  templateItemId: string;
  label: string;
  status: ChecklistItemStatus;
  note: string;
  photoUrl: string | null;
  /** จำนวน — บังคับกรอกเมื่อสถานะอยู่ในกลุ่มเสี่ยง (ดู RISKY_CHECKLIST_STATUSES) ไม่บังคับกรณีอื่น */
  quantity: number | null;
}

export interface ChecklistRun {
  id: string;
  stationId: string; // เช็กลิสต์แยกต่อแผนก — หนึ่งแผนกทำได้หนึ่งครั้งต่อวัน (unique ที่ date+stationId)
  date: string; // YYYY-MM-DD
  submittedAt: string | null; // ISO datetime, null = ยังไม่ส่ง
  submittedBy: string | null; // employeeId
  items: ChecklistEntryItem[];
  isComplete: boolean;
  /** true = ทำย้อนหลัง (date ไม่ใช่วันนี้ ณ ตอนบันทึก) — เฉพาะ Manager/Owner ทำได้ Staff ห้ามทำย้อนหลัง */
  backdated: boolean;
  /** เหตุผลที่ทำย้อนหลัง — บังคับกรอกเมื่อ backdated = true */
  backdatedReason: string | null;
}

/** สินค้าที่แผนกผลิตได้ (เฉพาะแผนกที่ hasProduction = true) — เช่น ขนมปังเนย, นมต้ม, ซอสสตรอว์เบอร์รี */
export interface Product {
  id: string;
  stationId: string; // แผนกที่ผลิตสินค้านี้
  name: string;
  unit: string;
  shelfLifeDays: number; // ใช้คำนวณวันหมดอายุของล็อตที่ผลิตใหม่โดยอัตโนมัติ
  active: boolean;
}

export type ProductLotStatus =
  | 'active' // ใช้งานอยู่
  | 'near_expiry' // ใกล้หมดอายุ (เหลือ ≤2 วัน = เหลือง, ≤1 วัน = ส้ม — คำนวณที่ derive.ts)
  | 'expired' // หมดอายุ (แดง)
  | 'used_up' // ใช้หมดแล้ว
  | 'discarded'; // ทิ้งแล้ว

/** ล็อตการผลิตสินค้า — สินค้าชนิดเดียวกันมีได้หลายล็อต ใช้หลัก FIFO/FEFO (ล็อตเก่า/ใกล้หมดอายุก่อน) */
export interface ProductLot {
  id: string;
  productId: string;
  lotNumber: string;
  producedDate: string; // YYYY-MM-DD
  producedTime: string; // HH:mm
  quantity: number;
  unit: string;
  producedBy: string; // employeeId
  shelfLifeDays: number; // ดึงจาก product ตอนสร้าง เผื่อภายหลังเปลี่ยนอายุสินค้าจะไม่กระทบล็อตเก่า
  expiresAt: string; // ISO datetime คำนวณอัตโนมัติ
  note: string;
  photoUrl: string | null;
  status: ProductLotStatus;
  usedUpAt: string | null;
  createdAt: string;
}

export type PurchaseRequestStatus =
  | 'pending' // รออนุมัติ
  | 'approved' // อนุมัติแล้ว
  | 'ordered' // สั่งซื้อแล้ว
  | 'received' // รับสินค้าแล้ว
  | 'cancelled'; // ยกเลิก

export interface PurchaseRequest {
  id: string;
  stockItemId: string | null; // อ้างอิงสต๊อกถ้ามี (auto-generated) หรือ null ถ้าพนักงานเพิ่มเอง
  itemName: string;
  currentQuantity: number;
  requestedQuantity: number;
  unit: string;
  reason: string;
  neededBy: string; // YYYY-MM-DD
  requestedBy: string; // employeeId
  photoUrl: string | null;
  status: PurchaseRequestStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  autoGenerated: boolean;
  createdAt: string;
}

/** ผู้ขาย/ซัพพลายเออร์ — เฟส 2 */
export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  address: string;
  note: string;
  active: boolean;
}

/**
 * ประวัติราคาต่อวัตถุดิบต่อผู้ขาย — append-only (ห้ามแก้ไข/ลบ) เพิ่มแถวใหม่เสมอเมื่อราคาเปลี่ยน
 * วัตถุดิบชนิดเดียวกันซื้อได้จากหลายผู้ขาย และหน่วยที่ผู้ขายแต่ละรายขายอาจต่างจาก unit หลักของวัตถุดิบ (เช่น ลัง/ขวด)
 */
export interface SupplierItemPrice {
  id: string;
  supplierId: string;
  stockItemId: string;
  unit: string;
  price: number;
  note: string;
  createdBy: string; // employeeId
  createdAt: string;
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  stockItemId: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  /** รายการเสนอซื้อ (purchase_request) ต้นทางที่ถูกรวมเข้าใบสั่งซื้อนี้ — ใช้ตามรอยและอัปเดตสถานะย้อนกลับ */
  sourcePurchaseRequestId: string | null;
}

/**
 * ใบสั่งซื้อจริงที่ส่งให้ผู้ขาย — แยกจาก PurchaseRequest (รายการ "เสนอซื้อ" ของพนักงาน/ระบบอัตโนมัติ)
 * สร้างจากการรวม (auto-merge) รายการเสนอซื้อที่อนุมัติแล้วของผู้ขายเดียวกัน+วันเดียวกันเป็นใบเดียว
 */
export interface PurchaseOrder {
  id: string;
  supplierId: string;
  orderDate: string; // YYYY-MM-DD
  status: PurchaseOrderStatus;
  note: string;
  createdBy: string; // employeeId
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null; // employeeId
  items: PurchaseOrderItem[];
}

export type NotificationSeverity = 'info' | 'review' | 'urgent' | 'blocked';

export type NotificationType =
  | 'checklist_missing'
  | 'item_unusable'
  | 'lot_near_expiry'
  | 'lot_expired'
  | 'production_failed'
  | 'stock_low'
  | 'stock_out'
  | 'purchase_pending'
  | 'purchase_not_received'
  | 'checklist_incomplete'
  | 'closing_summary'; // สรุปช่วงปิดร้าน — ของที่เหลือน้อยรวมทุกแผนก ต้องเตรียมของสำหรับวันพรุ่งนี้

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  relatedId: string | null;
  createdAt: string;
  readBy: string[]; // employeeId[]
}

export type HistoryActionType =
  | 'checklist_submit'
  | 'production_log' // บันทึกการผลิตสินค้า/ล็อตใหม่
  | 'lot_status_change'
  | 'stock_adjust'
  | 'waste_report'
  | 'purchase_create'
  | 'purchase_approve'
  | 'purchase_receive'
  | 'settings_change'
  | 'supplier_change' // เพิ่ม/แก้ไขผู้ขาย หรือเพิ่มราคาใหม่
  | 'po_create' // สร้าง/รวมใบสั่งซื้อ
  | 'po_status_change' // เปลี่ยนสถานะใบสั่งซื้อ (ส่งแล้ว/ยืนยันแล้ว/รับแล้ว/ยกเลิก)
  | 'po_price_update' // แก้ไขราคาต่อหน่วยของรายการในใบสั่งซื้อ (ระหว่างสถานะร่าง)
  | 'cash_report_submit' // บันทึกรายงานเงินสดปิดร้าน — เฟส 3
  | 'cash_report_edit' // แก้ไขรายงานเงินสดปิดร้านที่บันทึกไว้แล้ว
  | 'order_reminder_send' // เจ้าของ/ผู้จัดการส่งแจ้งเตือนให้แผนกสั่งสินค้า — เฟส 5
  | 'order_reminder_ack'; // พนักงานในแผนกกดยืนยันรับทราบแจ้งเตือนสั่งสินค้า

export interface HistoryLog {
  id: string;
  actionType: HistoryActionType;
  actorId: string; // employeeId
  targetLabel: string; // ชื่อรายการที่เกี่ยวข้อง เช่น "นมต้ม ล็อต #M-0231"
  detail: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AppSettings {
  checklistStartTime: string; // HH:mm
  checklistDueTime: string; // HH:mm
  milkShelfLifeDays: number;
  notifyLeadHoursBeforeExpiry: number; // แจ้งเตือนล่วงหน้ากี่ชั่วโมงก่อนหมดอายุ
  lowStockNotifyEnabled: boolean;
  closingTime: string; // HH:mm — เวลาปิดร้าน ใช้สรุปของที่ต้องเตรียมสำหรับวันพรุ่งนี้
  closingSummaryEnabled: boolean;
}

export interface CurrentUserSession {
  employeeId: string;
  loggedInAt: string;
}

/** วันหยุดร้าน — วันที่ระบุจะข้ามการแจ้งเตือน "ยังไม่ได้ทำเช็กลิสต์"/"เลยเวลา" และสรุปปิดร้าน — เฟส 4 */
export interface StoreHoliday {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  createdBy: string; // employeeId
  createdAt: string;
}

/**
 * รายงานเงินสดปิดร้านประจำวัน — บันทึกแบบง่าย (ยอดเงินสดรวมตอนปิดร้าน + หมายเหตุ)
 * เจ้าของร้าน/ผู้จัดการเท่านั้นที่บันทึก/แก้ไขได้ — แก้ไขได้ (ไม่ลบได้) โดยการแก้ไขทุกครั้งจะถูกบันทึกลงประวัติ history_logs เสมอ
 * เพื่อรักษาความโปร่งใส (ไม่มีการเปลี่ยนแปลงยอดเงินแบบไม่มีร่องรอย)
 */
export interface CashReport {
  id: string;
  date: string; // YYYY-MM-DD — วันที่ของรายงาน (ปกติคือวันนี้ตอนบันทึก)
  closingAmount: number; // ยอดเงินสดรวมตอนปิดร้าน
  note: string;
  submittedBy: string; // employeeId
  submittedAt: string;
}

/**
 * รายการที่พนักงานกำลังติ๊กเลือกอยู่ที่หน้า "สั่งสินค้า" (ยังไม่ได้กดบันทึกสั่งซื้อจริง)
 * ใช้แสดงแบบเรียลไทม์ให้พนักงานคนอื่นที่เปิดหน้านี้พร้อมกันเห็นว่าใครติ๊กอะไรไว้บ้าง เพื่อประสานงานกันก่อนสรุปส่ง
 * 1 แถวต่อ (พนักงาน, วัตถุดิบ) — ยกเลิกติ๊ก/บันทึกสั่งซื้อสำเร็จแล้ว = ลบแถวออก ไม่ใช่ประวัติถาวร
 */
export interface OrderDraftPick {
  id: string;
  employeeId: string;
  stockItemId: string;
  quantity: number;
  updatedAt: string;
}

export interface OrderReminder {
  id: string;
  stationId: string;
  message: string;
  createdBy: string;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  willOrder: boolean | null;
  responseNote: string;
}

/**
 * รูปแบบ state กลางของทั้งแอป — ใช้ร่วมกันทั้ง mock store (src/lib/store.ts)
 * และ live store ที่ต่อฐานข้อมูลจริง (src/lib/supabase/live-store.ts)
 * เพื่อให้หน้าจอ (page.tsx) ทุกหน้าอ่านข้อมูลผ่าน useAppState() แบบเดียวกัน
 * ไม่ว่าจะรันด้วยข้อมูลจำลองหรือฐานข้อมูลจริง
 */
export interface AppState {
  employees: Employee[];
  stations: Station[];
  stockItems: StockItem[];
  stockCategories: StockCategory[];
  checklistRuns: ChecklistRun[];
  checklistTemplate: ChecklistTemplateItem[];
  products: Product[];
  productLots: ProductLot[];
  purchaseRequests: PurchaseRequest[];
  suppliers: Supplier[];
  supplierItemPrices: SupplierItemPrice[];
  purchaseOrders: PurchaseOrder[];
  cashReports: CashReport[];
  storeHolidays: StoreHoliday[];
  orderReminders: OrderReminder[];
  orderDraftPicks: OrderDraftPick[];
  historyLogs: HistoryLog[];
  settings: AppSettings;
  session: CurrentUserSession | null;
  /** true ระหว่างที่ยังตรวจสอบสถานะล็อกอิน/โหลดข้อมูลเริ่มต้น — ใช้กันไม่ให้เด้งไปหน้า login ก่อนเวลา */
  initializing: boolean;
}

/**
 * สัญญากลางที่ store ทั้งสองแบบ (mock store ใน src/lib/store.ts และ live store
 * ที่ต่อ Supabase จริงใน src/lib/supabase/live-store.ts) ต้องมีเหมือนกันทุกตัว
 * เพื่อให้สลับ implementation กันได้โดยไม่ต้องแก้โค้ดหน้าจอเลย — mock คืนค่าแบบ
 * synchronous ส่วน live คืนค่าเป็น Promise ได้ (ผู้เรียกที่ต้องการผลลัพธ์ใช้ await
 * ได้เสมอ เพราะ await ค่าที่ไม่ใช่ Promise ก็ปลอดภัย)
 */
export interface AppStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppState;
  getServerSnapshot(): AppState;
  hydrate(): void;

  login(a: string, b: string): { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>;
  logout(): void | Promise<void>;

  /**
   * ส่งเช็กลิสต์ — dateStr ปกติคือวันนี้ ถ้าต่างจากวันนี้ถือว่า "ทำย้อนหลัง" (เฉพาะ manager/owner ทำได้
   * — หน้าจอกันไว้แล้ว และฝั่ง Supabase RLS ก็บังคับซ้ำอีกชั้น) backdatedReason บังคับกรอกเมื่อทำย้อนหลัง
   */
  submitChecklist(
    stationId: string,
    dateStr: string,
    items: ChecklistEntryItem[],
    employeeId: string,
    backdatedReason: string | null
  ): void | Promise<void>;

  createProductLot(input: {
    productId: string;
    producedDate: string;
    producedTime: string;
    quantity: number;
    unit: string;
    producedBy: string;
    note: string;
    photoUrl: string | null;
  }): void | Promise<void>;
  setProductLotStatus(id: string, status: ProductLotStatus, employeeId: string): void | Promise<void>;

  adjustStock(id: string, quantity: number, note: string, employeeId: string): void | Promise<void>;
  markStockUnusable(id: string, note: string, employeeId: string): void | Promise<void>;

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
  }): void | Promise<void>;
  updatePurchaseRequestStatus(id: string, status: PurchaseRequestStatus, employeeId: string): void | Promise<void>;

  updateSettings(patch: Partial<AppSettings>, employeeId: string): void | Promise<void>;
  /**
   * เพิ่มพนักงานใหม่ — เจ้าของร้านเท่านั้น (จำกัดสิทธิ์ที่หน้าจอ + RLS ฝั่ง employees_insert_owner_only)
   * โหมด mock: ใช้ pinCode สำหรับล็อกอิน (email/password จะถูกละเว้น)
   * โหมด Supabase: สร้างบัญชี Supabase Auth ใหม่ด้วย email/password ที่เจ้าของกำหนด แล้วผูกกับแถวพนักงานใหม่
   * (pinCode จะถูกละเว้น) — ทำผ่าน API route ฝั่งเซิร์ฟเวอร์เพราะต้องใช้ service role key สร้างบัญชี Auth
   */
  createEmployee(input: {
    name: string;
    nickname: string;
    role: Role;
    stationId: string | null;
    pinCode: string;
    email: string;
    password: string;
    actorId: string;
  }): void | Promise<void>;
  updateEmployee(
    id: string,
    /** pinCode ใช้ได้เฉพาะโหมด mock เท่านั้น (โหมด Supabase ใช้อีเมล/รหัสผ่านผ่าน Supabase Auth แทน — ค่านี้จะถูกละเว้น)
     *  name/nickname เปลี่ยนได้เฉพาะเจ้าของร้านเท่านั้น (จำกัดสิทธิ์ที่หน้าจอ + RLS ฝั่ง employees_update_owner_only) */
    patch: { role?: Role; active?: boolean; stationId?: string | null; pinCode?: string; name?: string; nickname?: string },
    actorId: string
  ): void | Promise<void>;
  /**
   * เจ้าของร้านตั้งรหัสผ่านใหม่ให้พนักงานคนอื่น — ใช้ได้จริงเฉพาะโหมด Supabase เท่านั้น
   * (โหมด mock ใช้ปุ่ม "รีเซ็ต PIN" ผ่าน updateEmployee แทน) ทำผ่าน API route ฝั่งเซิร์ฟเวอร์
   * เพราะต้องใช้ service role key แก้ไขบัญชี Supabase Auth ของคนอื่น
   */
  resetEmployeePassword(employeeId: string, newPassword: string, actorId: string): void | Promise<void>;

  // ================= วันหยุดร้าน (owner/manager เท่านั้น) — เฟส 4 =================
  addStoreHoliday(input: { date: string; label: string; actorId: string }): void | Promise<void>;
  removeStoreHoliday(id: string, actorId: string): void | Promise<void>;

  // ================= จัดการรายการวัตถุดิบ (owner/manager เท่านั้น — ดูการจำกัดสิทธิ์ที่หน้าจอ + RLS) =================
  createStockItem(input: {
    name: string;
    categoryId: string;
    unit: string;
    minQuantity: number;
    parQuantity: number;
    quantity: number;
    supplierId: string | null;
    actorId: string;
  }): void | Promise<void>;
  updateStockItemDetails(
    id: string,
    patch: { name?: string; categoryId?: string; unit?: string; minQuantity?: number; parQuantity?: number; supplierId?: string | null },
    actorId: string
  ): void | Promise<void>;
  deleteStockItem(id: string, actorId: string): void | Promise<void>;
  /** เปลี่ยนชื่อหมวดหมู่วัตถุดิบ (เช่น "ของสด" -> ชื่ออื่น) — owner/manager เท่านั้น (จำกัดสิทธิ์ที่หน้าจอ + RLS "stock_categories_write_owner_manager") */
  updateStockCategoryName(id: string, name: string, actorId: string): void | Promise<void>;
  createStockCategory(input: { name: string; actorId: string }): void | Promise<void>;
  deleteStockCategory(id: string, actorId: string): void | Promise<void>;

  // ================= แผนก/สถานี (Stations) — owner เท่านั้นที่เพิ่ม/แก้ไข/ลบได้ (จำกัดสิทธิ์ที่หน้าจอ + RLS "stations_write_owner_only") =================
  createStation(input: { name: string; hasProduction: boolean; actorId: string }): void | Promise<void>;
  updateStation(id: string, patch: { name?: string; hasProduction?: boolean }, actorId: string): void | Promise<void>;
  /** ลบแผนก — soft-delete (active=false) เพื่อไม่กระทบประวัติเช็กลิสต์/ล็อตการผลิตเก่าที่เคยอ้างอิงแผนกนี้ */
  deleteStation(id: string, actorId: string): void | Promise<void>;

  // ================= จัดการรายการเช็กลิสต์ (owner/manager เท่านั้น — ดูการจำกัดสิทธิ์ที่หน้าจอ + RLS) =================
  createChecklistTemplateItem(input: {
    stationId: string;
    label: string;
    actorId: string;
    frequency?: ChecklistItemFrequency;
    weeklyDays?: number[] | null;
    monthlyDay?: number | null;
  }): void | Promise<void>;
  updateChecklistTemplateItem(
    id: string,
    patch: { label?: string; frequency?: ChecklistItemFrequency; weeklyDays?: number[] | null; monthlyDay?: number | null },
    actorId: string
  ): void | Promise<void>;
  deleteChecklistTemplateItem(id: string, actorId: string): void | Promise<void>;

  // ================= จัดการสินค้าที่ผลิต (owner/manager เท่านั้น) =================
  createProduct(input: { stationId: string; name: string; unit: string; shelfLifeDays: number; actorId: string }): void | Promise<void>;
  updateProduct(
    id: string,
    patch: { name?: string; unit?: string; shelfLifeDays?: number },
    actorId: string
  ): void | Promise<void>;
  deleteProduct(id: string, actorId: string): void | Promise<void>;

  // ================= ผู้ขาย/ซัพพลายเออร์ (owner/manager เท่านั้น) — เฟส 2 =================
  createSupplier(input: {
    name: string;
    contactPerson: string;
    phone: string;
    address: string;
    note: string;
    actorId: string;
  }): void | Promise<void>;
  updateSupplier(
    id: string,
    patch: { name?: string; contactPerson?: string; phone?: string; address?: string; note?: string },
    actorId: string
  ): void | Promise<void>;
  deleteSupplier(id: string, actorId: string): void | Promise<void>;
  /** เพิ่มราคาใหม่ (ประวัติราคา — append-only ห้ามแก้ไข/ลบ) */
  addSupplierItemPrice(input: {
    supplierId: string;
    stockItemId: string;
    unit: string;
    price: number;
    note: string;
    actorId: string;
  }): void | Promise<void>;

  // ================= ใบสั่งซื้อ (owner/manager เท่านั้น) — เฟส 2 =================
  /**
   * สร้าง/รวม (auto-merge) ใบสั่งซื้อจากรายการเสนอซื้อที่อนุมัติแล้ว — ถ้ามีใบร่าง (draft) ของผู้ขายเดียวกัน
   * ในวันเดียวกันอยู่แล้ว จะรวมรายการเข้าใบเดิมแทนการสร้างใบใหม่ รายการเสนอซื้อต้นทางจะถูกตั้งสถานะเป็น "ordered" ทันที
   */
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
  }): void | Promise<void>;
  /**
   * เปลี่ยนสถานะใบสั่งซื้อ — เมื่อเปลี่ยนเป็น "received" ระบบจะเพิ่มจำนวนกลับเข้าสต๊อกอัตโนมัติ
   * และตั้งสถานะรายการเสนอซื้อต้นทางทั้งหมดในใบนี้เป็น "received" ด้วย
   */
  updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus, actorId: string): void | Promise<void>;
  updatePurchaseOrderItemPrice(purchaseOrderId: string, itemId: string, unitPrice: number, actorId: string): void | Promise<void>;

  // ================= รายงานเงินสดปิดร้าน (owner/manager เท่านั้น) — เฟส 3 =================
  /** บันทึกรายงานเงินสดของวันที่ระบุ */
  submitCashReport(input: { date: string; closingAmount: number; note: string; actorId: string }): void | Promise<void>;
  /** แก้ไขยอดเงิน/หมายเหตุของรายงานเงินสดที่บันทึกไว้แล้ว — owner/manager เท่านั้น (การแก้ไขจะถูกบันทึกลงประวัติ history_logs เสมอ ไม่ลบข้อมูลเดิมทิ้ง) */
  updateCashReport(id: string, patch: { closingAmount?: number; note?: string }, actorId: string): void | Promise<void>;

  sendOrderReminder(input: { stationId: string; message: string; actorId: string }): void | Promise<void>;
  acknowledgeOrderReminder(
    id: string,
    input: { willOrder: boolean; note: string },
    actorId: string
  ): void | Promise<void>;
  deleteOrderReminder(id: string, actorId: string): void | Promise<void>;

  // ================= ติ๊กเลือกสินค้าแบบเรียลไทม์ที่หน้า "สั่งสินค้า" (ก่อนบันทึกสั่งซื้อจริง) =================
  /** ติ๊กเลือก/แก้จำนวนสินค้า — upsert แถวเดียวต่อ (พนักงาน, วัตถุดิบ) ให้คนอื่นเห็นแบบเรียลไทม์ */
  setOrderDraftPick(stockItemId: string, quantity: number, employeeId: string): void | Promise<void>;
  /** ยกเลิกติ๊ก — ลบแถวออกทันที */
  clearOrderDraftPick(stockItemId: string, employeeId: string): void | Promise<void>;
}
