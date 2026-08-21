/**
 * ฟังก์ชัน "คำนวณสถานะ" ล้วน ๆ (pure functions) — ไม่มี side effect
 * ใช้ร่วมกันทั้งฝั่ง mock store และในอนาคตฝั่ง Supabase (เช่น database function / edge function)
 * เพื่อให้ตรรกะการคำนวณสถานะ "ตรงกันเสมอ" ไม่ว่าจะรันที่ client หรือ server
 */
import type {
  AppNotification,
  AppSettings,
  CashReport,
  ChecklistRun,
  ChecklistTemplateItem,
  Employee,
  ItemStatus,
  NotificationSeverity,
  Product,
  ProductLot,
  ProductLotStatus,
  PurchaseOrder,
  PurchaseRequest,
  Station,
  StockItem,
  StoreHoliday,
  SupplierItemPrice,
} from './types';

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export function formatThaiDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export function formatThaiDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${formatThaiDate(iso)} เวลา ${time} น.`;
}

export function formatThaiTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`;
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** แปลง key เดือน "YYYY-MM" เป็นข้อความไทย เช่น "สิงหาคม 2569" */
export function formatThaiMonthYear(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

/** จัดกลุ่มรายงานเงินสดตามเดือน (เรียงเดือนล่าสุดก่อน, ในแต่ละเดือนเรียงวันที่ล่าสุดก่อน) พร้อมยอดรวมต่อเดือน — ใช้ทำสรุปรายเดือนหน้ารายงานเงินสด */
export function groupCashReportsByMonth(reports: CashReport[]): { key: string; items: CashReport[]; total: number }[] {
  const map = new Map<string, CashReport[]>();
  for (const r of reports) {
    const key = r.date.slice(0, 7); // YYYY-MM
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      key,
      items: items.slice().sort((a, b) => b.date.localeCompare(a.date)),
      total: items.reduce((sum, r) => sum + r.closingAmount, 0),
    }));
}

export function isPastTimeToday(hhmm: string, now: Date): boolean {
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return now.getTime() > target.getTime();
}

export function daysUntil(dateStr: string | null, now: Date): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T23:59:59`);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function hoursUntil(iso: string, now: Date): number {
  const target = new Date(iso);
  return (target.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/** คำนวณสถานะวัตถุดิบ/สต๊อกจากจำนวนคงเหลือและวันหมดอายุ
 *  หมายเหตุ: ถ้าสถานะปัจจุบันถูกตั้งเป็น "unusable" ด้วยมือ (เช่น จากเช็กลิสต์) จะคงสถานะนั้นไว้
 *  จนกว่าพนักงานจะอัปเดตจำนวน/สถานะใหม่ด้วยตนเอง
 */
export function computeStockStatus(item: StockItem, now: Date): ItemStatus {
  if (item.status === 'unusable') return 'unusable';
  if (item.quantity <= 0) return 'out';
  const days = daysUntil(item.expiryDate, now);
  if (days !== null) {
    if (days < 0) return 'expired';
    if (days <= 2) return 'near_expiry';
  }
  if (item.quantity < item.minQuantity) return 'low';
  return 'normal';
}

/** คำนวณสถานะออร์เดอร์เพิ่มจากเวลาปัจจุบันเทียบกับเวลาหมดอายุ (แทนนมต้มเดิม — ใช้ได้ทุกแผนกที่มีการผลิต)
 *  สถานะ used_up / discarded เป็นสถานะปลายทาง (terminal) ที่ตั้งโดยพนักงาน จะไม่ถูกคำนวณทับ
 *  เกณฑ์วันตามสเปก Rowhou8e OPS §9: เหลือ ≤2 วัน = near_expiry (สี), เหลือ ≤1 วัน = เตือนแรงขึ้น (ดู productLotExpiryUrgency)
 */
export function computeProductLotStatus(lot: ProductLot, now: Date): ProductLotStatus {
  if (lot.status === 'used_up' || lot.status === 'discarded') return lot.status;
  const daysLeft = hoursUntil(lot.expiresAt, now) / 24;
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 2) return 'near_expiry';
  return 'active';
}

export type ExpiryUrgency = 'ok' | 'yellow' | 'orange' | 'red';

/** ระดับสีเตือนตามจำนวนวันที่เหลือ (สเปก §9): ≤2 วัน = เหลือง, ≤1 วัน = ส้ม, หมดอายุแล้ว = แดง
 *  แยกจาก ProductLotStatus เพราะสถานะเก็บลง DB มีแค่ near_expiry ระดับเดียว แต่ UI ต้องไล่สีละเอียดกว่า
 */
export function productLotExpiryUrgency(lot: ProductLot, now: Date): ExpiryUrgency {
  if (lot.status === 'used_up' || lot.status === 'discarded') return 'ok';
  const daysLeft = hoursUntil(lot.expiresAt, now) / 24;
  if (daysLeft < 0) return 'red';
  if (daysLeft <= 1) return 'orange';
  if (daysLeft <= 2) return 'yellow';
  return 'ok';
}

export function statusMeta(status: ItemStatus | ProductLotStatus) {
  const map: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'idle' }> = {
    normal: { label: 'ปกติ', tone: 'ok' },
    active: { label: 'ใช้งานอยู่', tone: 'ok' },
    low: { label: 'ใกล้หมด', tone: 'warn' },
    near_expiry: { label: 'ใกล้หมดอายุ', tone: 'warn' },
    out: { label: 'หมด', tone: 'danger' },
    expired: { label: 'หมดอายุ', tone: 'danger' },
    unusable: { label: 'ใช้ไม่ได้', tone: 'danger' },
    used_up: { label: 'ใช้หมดแล้ว', tone: 'idle' },
    discarded: { label: 'ทิ้งแล้ว', tone: 'idle' },
  };
  return map[status] ?? { label: status, tone: 'idle' as const };
}

export function severityMeta(severity: NotificationSeverity) {
  const map: Record<NotificationSeverity, { label: string; tone: 'ok' | 'warn' | 'danger' | 'idle' }> = {
    info: { label: 'ข้อมูลทั่วไป', tone: 'idle' },
    review: { label: 'ควรตรวจสอบ', tone: 'warn' },
    urgent: { label: 'เร่งด่วน', tone: 'danger' },
    blocked: { label: 'ห้ามใช้สินค้า', tone: 'danger' },
  };
  return map[severity];
}

/** ตรวจว่าวันที่ระบุเป็น "วันหยุดร้าน" หรือไม่ (ดู StoreHoliday) — วันหยุดร้านข้ามการบังคับทำเช็กลิสต์/สรุปปิดร้าน */
export function isStoreHoliday(storeHolidays: StoreHoliday[], dateStr: string): boolean {
  return storeHolidays.some((h) => h.date === dateStr);
}

export function isChecklistOverdue(
  settings: AppSettings,
  todayRun: ChecklistRun | undefined,
  now: Date,
  storeHolidays: StoreHoliday[] = []
): boolean {
  if (todayRun?.submittedAt) return false;
  if (isStoreHoliday(storeHolidays, toDateStr(now))) return false;
  const [h, m] = settings.checklistDueTime.split(':').map(Number);
  const due = new Date(now);
  due.setHours(h, m, 0, 0);
  return now.getTime() > due.getTime();
}

/** คืนค่าว่ารายการเช็กลิสต์นี้ควรทำ "วันนี้" หรือไม่ ตามความถี่ที่ตั้งไว้ (ทุกวัน/รายสัปดาห์/รายเดือน) */
export function isChecklistItemScheduledToday(item: ChecklistTemplateItem, now: Date): boolean {
  const frequency = item.frequency ?? 'daily';
  if (frequency === 'weekly') {
    return (item.weeklyDays ?? []).includes(now.getDay());
  }
  if (frequency === 'monthly') {
    return item.monthlyDay != null && now.getDate() === item.monthlyDay;
  }
  return true;
}

/** สร้างรายการแจ้งเตือนแบบ "คำนวณสด" จากสถานะปัจจุบันของระบบทั้งหมด
 *  ทำให้ Notification Center ไม่มีวันข้อมูลไม่ตรงกับ Dashboard/สต๊อก/นมต้ม
 *  เช็กลิสต์แยกแจ้งเตือนเป็นรายบาร์ (แต่ละบาร์ทำเช็กลิสต์ของตัวเอง)
 */
export function generateLiveNotifications(input: {
  now: Date;
  settings: AppSettings;
  stations: Station[];
  checklistRuns: ChecklistRun[];
  stockItems: StockItem[];
  products: Product[];
  productLots: ProductLot[];
  purchaseRequests: PurchaseRequest[];
  purchaseOrders?: PurchaseOrder[];
  storeHolidays?: StoreHoliday[];
}): AppNotification[] {
  const {
    now,
    settings,
    stations,
    checklistRuns,
    stockItems,
    products,
    productLots,
    purchaseRequests,
    purchaseOrders = [],
    storeHolidays = [],
  } = input;
  const out: AppNotification[] = [];
  const todayStr = toDateStr(now);
  const todayIsHoliday = isStoreHoliday(storeHolidays, todayStr);

  // วันหยุดร้าน — ข้ามการแจ้งเตือน "ยังไม่ได้ทำเช็กลิสต์" ทั้งหมดของวันนี้
  if (!todayIsHoliday) {
    for (const station of stations.filter((s) => s.active)) {
      const todayRun = checklistRuns.find((r) => r.stationId === station.id && r.date === todayStr);
      if (todayRun?.submittedAt) continue;
      const overdue = isChecklistOverdue(settings, todayRun, now, storeHolidays);
      out.push({
        id: `live-checklist-missing-${station.id}`,
        type: 'checklist_missing',
        severity: overdue ? 'urgent' : 'info',
        title: overdue ? `เลยเวลาแล้ว! ${station.name} ยังไม่ได้ทำเช็กลิสต์` : `${station.name} ยังไม่ได้ทำเช็กลิสต์วันนี้`,
        message: overdue
          ? `เลยเวลา ${settings.checklistDueTime} น. แล้ว แต่ ${station.name} ยังไม่มีพนักงานทำเช็กลิสต์ของวันนี้`
          : `กรุณาทำเช็กลิสต์ของ ${station.name} ก่อนเวลา ${settings.checklistDueTime} น.`,
        relatedId: station.id,
        createdAt: now.toISOString(),
        readBy: [],
      });
    }
  }

  // แจ้งเตือนผู้จัดการทันทีเมื่อพบสถานะเสี่ยงในเช็กลิสต์ของวันนี้ (expired/unusable/production_failed — สเปก §7)
  for (const run of checklistRuns.filter((r) => r.date === todayStr && r.submittedAt)) {
    const station = stations.find((s) => s.id === run.stationId);
    for (const item of run.items) {
      if (item.status === 'expired' || item.status === 'unusable') {
        out.push({
          id: `live-checklist-risky-${run.id}-${item.templateItemId}`,
          type: 'item_unusable',
          severity: 'blocked',
          title: `พบรายการเสี่ยงในเช็กลิสต์: ${item.label}`,
          message: `${station?.name ?? run.stationId} รายงาน "${item.label}" เป็น "${item.status === 'expired' ? 'หมดอายุ' : 'ใช้ไม่ได้'}"${item.quantity !== null ? ` จำนวน ${item.quantity}` : ''}${item.note ? ` — ${item.note}` : ''}`,
          relatedId: run.id,
          createdAt: run.submittedAt ?? now.toISOString(),
          readBy: [],
        });
      } else if (item.status === 'production_failed') {
        out.push({
          id: `live-checklist-risky-${run.id}-${item.templateItemId}`,
          type: 'production_failed',
          severity: 'urgent',
          title: `ผลิตไม่ผ่าน: ${item.label}`,
          message: `${station?.name ?? run.stationId} รายงาน "${item.label}" ผลิตไม่ผ่าน${item.quantity !== null ? ` จำนวน ${item.quantity}` : ''}${item.note ? ` — ${item.note}` : ''}`,
          relatedId: run.id,
          createdAt: run.submittedAt ?? now.toISOString(),
          readBy: [],
        });
      }
    }
  }

  // หมายเหตุ: เดิมมีสรุปช่วงปิดร้าน + แจ้งเตือนวัตถุดิบใกล้หมด/หมด/หมดอายุ คำนวณจาก computeStockStatus(stockItems)
  // เอาออกแล้วตามคำขอ "ไม่ต้องสต๊อกสินค้าแล้ว" — เปลี่ยนมาใช้หน้า "สั่งสินค้า" (/order) แทน ไม่มีการนับจำนวนคงเหลืออีกต่อไป

  for (const lot of productLots) {
    const status = computeProductLotStatus(lot, now);
    const productName = products.find((p) => p.id === lot.productId)?.name ?? 'สินค้า';
    if (status === 'expired') {
      out.push({
        id: `live-lot-expired-${lot.id}`,
        type: 'lot_expired',
        severity: 'blocked',
        title: `${productName}หมดอายุ: ล็อต ${lot.lotNumber}`,
        message: `ล็อต ${lot.lotNumber} (${productName}) หมดอายุแล้ว ห้ามใช้ กรุณาทิ้งและบันทึกสถานะ`,
        relatedId: lot.id,
        createdAt: lot.expiresAt,
        readBy: [],
      });
    } else if (status === 'near_expiry') {
      const urgency = productLotExpiryUrgency(lot, now);
      out.push({
        id: `live-lot-nearexp-${lot.id}`,
        type: 'lot_near_expiry',
        severity: urgency === 'orange' ? 'urgent' : 'review',
        title: `${productName}ใกล้หมดอายุ: ล็อต ${lot.lotNumber}`,
        message:
          urgency === 'orange'
            ? `ล็อต ${lot.lotNumber} (${productName}) จะหมดอายุภายใน 1 วัน`
            : `ล็อต ${lot.lotNumber} (${productName}) จะหมดอายุภายใน 2 วัน`,
        relatedId: lot.id,
        createdAt: now.toISOString(),
        readBy: [],
      });
    }
  }

  // หมายเหตุ: เดิมมีแจ้งเตือน "รออนุมัติ" จากรายการเสนอซื้อ (purchase_pending) — เอาออกแล้ว เพราะหน้า "สั่งสินค้า"
  // ใหม่สั่งซื้อได้ตรงทันทีไม่ต้องผ่านขั้นตอนขออนุมัติอีกต่อไป (คงพารามิเตอร์ purchaseRequests ไว้เผื่อใช้อ่านประวัติเดิม)

  // ใบสั่งซื้อที่ส่ง/ยืนยันแล้วแต่ยังไม่ได้รับสินค้า — แจ้งเตือนระดับใบสั่งซื้อ (แทนที่แจ้งเตือนรายรายการเสนอซื้อเดิม)
  for (const po of purchaseOrders) {
    if (po.status === 'sent' || po.status === 'confirmed') {
      const itemCount = po.items.length;
      out.push({
        id: `live-po-notreceived-${po.id}`,
        type: 'purchase_not_received',
        severity: 'info',
        title: `สั่งซื้อแล้ว รอรับสินค้า (${itemCount} รายการ)`,
        message: `ใบสั่งซื้อวันที่ ${po.orderDate} (${itemCount} รายการ) สั่งซื้อแล้วแต่ยังไม่ได้รับสินค้า`,
        relatedId: po.id,
        createdAt: po.sentAt ?? po.createdAt,
        readBy: [],
      });
    }
  }

  return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * หาแผนก (stationId) ที่เกี่ยวข้องกับการแจ้งเตือนแบบคำนวณสด (live notification) หนึ่งรายการ
 * ใช้กรองหน้าศูนย์แจ้งเตือน/badge ให้พนักงานทั่วไปเห็นเฉพาะแผนกของตัวเอง (owner/manager เห็นทุกแผนกอยู่แล้ว ไม่ต้องกรอง)
 * คืนค่า null ถ้าแจ้งเตือนนั้นไม่ได้ผูกกับแผนกใดแผนกหนึ่งโดยเฉพาะ (เช่น แจ้งเตือนใบสั่งซื้อ) — กรณีนี้ให้เห็นเฉพาะ owner/manager เท่านั้น
 */
export function liveNotificationStationId(
  n: AppNotification,
  ctx: { checklistRuns: ChecklistRun[]; productLots: ProductLot[]; products: Product[] }
): string | null {
  switch (n.type) {
    case 'checklist_missing':
      return n.relatedId; // relatedId = station.id โดยตรง (ดู generateLiveNotifications)
    case 'item_unusable':
    case 'production_failed': {
      const run = ctx.checklistRuns.find((r) => r.id === n.relatedId);
      return run?.stationId ?? null;
    }
    case 'lot_near_expiry':
    case 'lot_expired': {
      const lot = ctx.productLots.find((l) => l.id === n.relatedId);
      if (!lot) return null;
      const product = ctx.products.find((p) => p.id === lot.productId);
      return product?.stationId ?? null;
    }
    default:
      return null;
  }
}

/** หาราคาล่าสุดของวัตถุดิบหนึ่งชิ้นจากผู้ขายแต่ละราย (ประวัติราคาเป็น append-only — เอาแถวล่าสุดต่อผู้ขายมาแสดง) */
export function latestSupplierPricesForItem(prices: SupplierItemPrice[], stockItemId: string): SupplierItemPrice[] {
  const bySupplier = new Map<string, SupplierItemPrice>();
  for (const p of prices.filter((p) => p.stockItemId === stockItemId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
    bySupplier.set(p.supplierId, p); // แถวหลังสุดทับแถวก่อนหน้าเสมอ เพราะเรียงจากเก่าไปใหม่
  }
  return Array.from(bySupplier.values());
}

/** หาผู้ขาย+ราคาที่ "เคยซื้อล่าสุด" ของวัตถุดิบชิ้นนี้ (ข้ามผู้ขายทั้งหมด เอาแค่แถวล่าสุดแถวเดียว)
 *  ใช้ตอนสร้างใบสั่งซื้อ เพื่อแยกผู้ขายให้อัตโนมัติจากรายการเสนอซื้อ โดยไม่ต้องให้พนักงานเลือกเอง —
 *  คืนค่า null ถ้าวัตถุดิบชิ้นนี้ไม่เคยมีประวัติซื้อจากผู้ขายไหนมาก่อนเลย (ต้องให้พนักงานเลือกผู้ขายเอง) */
export function mostRecentSupplierPrice(prices: SupplierItemPrice[], stockItemId: string): SupplierItemPrice | null {
  const forItem = prices.filter((p) => p.stockItemId === stockItemId);
  if (forItem.length === 0) return null;
  return forItem.reduce((latest, p) => (new Date(p.createdAt).getTime() > new Date(latest.createdAt).getTime() ? p : latest));
}

export function getEmployeeName(employees: Employee[], id: string | null): string {
  if (!id) return '-';
  if (id === 'system') return 'ระบบ (อัตโนมัติ)';
  return employees.find((e) => e.id === id)?.name ?? id;
}

export function roleLabel(role: string): string {
  return { owner: 'เจ้าของร้าน', manager: 'ผู้จัดการ', staff: 'พนักงาน' }[role] ?? role;
}
