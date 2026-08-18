import type { PurchaseOrder, Supplier, Employee } from './types';
import { formatThaiDate, formatThaiDateTime, getEmployeeName } from './derive';

/**
 * สร้างรูปภาพใบสั่งซื้อ (PNG) จากข้อมูลใบสั่งซื้อ เพื่อให้พนักงานกดดาวน์โหลด
 * แล้วส่งต่อให้ผู้ขายอ่านง่าย ๆ ผ่าน LINE/แอปแชทได้ทันที
 * วาดด้วย Canvas 2D ล้วน ๆ ไม่พึ่ง library ภายนอก (เลี่ยงปัญหาติดตั้ง dependency)
 */

const BRAND = '#EA580C';
const BRAND_DARK = '#C2410C';
const TEXT_DARK = '#111827';
const TEXT_GRAY = '#6B7280';
const TEXT_LIGHT_GRAY = '#9CA3AF';
const BORDER = '#E5E7EB';
const ROW_ALT = '#FFF7ED';
const HEADER_BG = '#FFF1E6';
const TOTAL_BG = '#FFF7ED';

const FONT_FAMILY = "'Noto Sans Thai', system-ui, sans-serif";

const STATUS_LABEL: Record<string, string> = {
  draft: 'ฉบับร่าง',
  sent: 'ส่งให้ผู้ขายแล้ว',
  confirmed: 'ผู้ขายยืนยันแล้ว',
  received: 'รับสินค้าแล้ว',
  cancelled: 'ยกเลิกแล้ว',
};

/** ตัดข้อความยาวขึ้นบรรทัดใหม่แบบตัดทีละตัวอักษร (รองรับข้อความไทยที่ไม่มีช่องว่างคั่นคำ) */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [''];
  const lines: string[] = [];
  let current = '';
  for (const ch of text) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

async function ensureFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.all([
      document.fonts.load(`800 30px ${FONT_FAMILY}`),
      document.fonts.load(`700 17px ${FONT_FAMILY}`),
      document.fonts.load(`600 15px ${FONT_FAMILY}`),
      document.fonts.load(`400 14px ${FONT_FAMILY}`),
    ]);
    await document.fonts.ready;
  } catch {
    // โหลดฟอนต์ไม่สำเร็จก็ไม่บล็อกการสร้างภาพ — จะ fallback เป็นฟอนต์ระบบแทน
  }
}

async function renderPurchaseOrderImageBlob(
  po: PurchaseOrder,
  supplier: Supplier | undefined,
  employees: Employee[]
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  await ensureFontsLoaded();

  const W = 800;
  const marginX = 40;
  const contentW = W - marginX * 2;
  const dpr = Math.max(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);

  // canvas ชั่วคราวไว้วัดความกว้างข้อความก่อนคำนวณความสูงจริงของภาพ
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) return null;

  const headerH = 118;
  const supplierY = headerH + 22;
  const hasContactLine = Boolean(supplier?.contactPerson || supplier?.phone);
  const supplierH = 20 + (hasContactLine ? 24 : 0) + (supplier?.address ? 22 : 0);
  const tableY = supplierY + supplierH + 20;
  const tableHeaderH = 40;

  const col = {
    nameX: marginX,
    nameW: 430,
    qtyRight: marginX + 560,
    subtotalRight: W - marginX,
  };

  mctx.font = `600 16px ${FONT_FAMILY}`;
  const itemRows = po.items.map((it) => {
    const lines = wrapText(mctx, it.itemName, col.nameW);
    const rowH = Math.max(46, lines.length * 23 + 18);
    return { it, lines, rowH };
  });
  const itemsTotalH = itemRows.reduce((sum, r) => sum + r.rowH, 0);

  const totalRowH = 56;
  mctx.font = `400 14px ${FONT_FAMILY}`;
  const noteLines = po.note ? wrapText(mctx, `หมายเหตุ: ${po.note}`, contentW) : [];
  const noteH = noteLines.length > 0 ? noteLines.length * 20 + 24 : 0;
  const footerH = 44;
  const bottomMargin = 28;

  const H = tableY + tableHeaderH + itemsTotalH + totalRowH + noteH + footerH + bottomMargin;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);

  // พื้นหลังขาว
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // แถบหัวสีแบรนด์
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `800 30px ${FONT_FAMILY}`;
  ctx.fillText('ร้านโรว์เฮ้าส์ · Rowhou8e', marginX, 48);
  ctx.font = `600 17px ${FONT_FAMILY}`;
  ctx.fillText('ใบสั่งซื้อ (Purchase Order)', marginX, 76);
  ctx.font = `500 15px ${FONT_FAMILY}`;
  ctx.fillText(`วันที่สั่ง: ${formatThaiDate(po.orderDate)}`, marginX, 100);

  ctx.textAlign = 'right';
  ctx.font = `700 15px ${FONT_FAMILY}`;
  ctx.fillText(STATUS_LABEL[po.status] ?? po.status, W - marginX, 100);
  ctx.textAlign = 'left';

  // กล่องข้อมูลผู้ขาย
  ctx.fillStyle = TEXT_DARK;
  ctx.font = `700 19px ${FONT_FAMILY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(supplier?.name ?? 'ไม่ระบุผู้ขาย', marginX, supplierY + 18);
  let sy = supplierY + 18;
  if (hasContactLine) {
    sy += 24;
    ctx.fillStyle = TEXT_GRAY;
    ctx.font = `400 14px ${FONT_FAMILY}`;
    const parts = [supplier?.contactPerson, supplier?.phone].filter(Boolean);
    ctx.fillText(parts.join(' · '), marginX, sy);
  }
  if (supplier?.address) {
    sy += 22;
    ctx.fillStyle = TEXT_GRAY;
    ctx.font = `400 13px ${FONT_FAMILY}`;
    ctx.fillText(supplier.address, marginX, sy);
  }

  // เส้นคั่น
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(marginX, supplierY + supplierH + 4);
  ctx.lineTo(W - marginX, supplierY + supplierH + 4);
  ctx.stroke();

  // หัวตาราง
  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(marginX, tableY, contentW, tableHeaderH);
  ctx.fillStyle = BRAND_DARK;
  ctx.font = `700 15px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`รายการสินค้า (${po.items.length} รายการ)`, col.nameX + 10, tableY + tableHeaderH / 2);
  ctx.textAlign = 'right';
  ctx.fillText('จำนวน', col.qtyRight, tableY + tableHeaderH / 2);
  ctx.fillText('รวม (บาท)', col.subtotalRight - 10, tableY + tableHeaderH / 2);
  ctx.textAlign = 'left';

  // แถวรายการสินค้า
  let rowY = tableY + tableHeaderH;
  itemRows.forEach(({ it, lines, rowH }, idx) => {
    if (idx % 2 === 1) {
      ctx.fillStyle = ROW_ALT;
      ctx.fillRect(marginX, rowY, contentW, rowH);
    }
    const centerY = rowY + rowH / 2;
    const lineH = 21;
    const startY = centerY - ((lines.length - 1) * lineH) / 2;

    ctx.fillStyle = TEXT_DARK;
    ctx.font = `600 16px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      ctx.fillText(line, col.nameX + 10, startY + i * lineH);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = TEXT_GRAY;
    ctx.font = `400 15px ${FONT_FAMILY}`;
    ctx.fillText(`${it.quantity.toLocaleString()} ${it.unit}`, col.qtyRight, centerY);
    ctx.fillStyle = TEXT_DARK;
    ctx.font = `700 16px ${FONT_FAMILY}`;
    ctx.fillText((it.quantity * it.unitPrice).toLocaleString(), col.subtotalRight - 10, centerY);
    ctx.textAlign = 'left';

    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginX, rowY + rowH);
    ctx.lineTo(W - marginX, rowY + rowH);
    ctx.stroke();

    rowY += rowH;
  });

  // แถวยอดรวม
  const total = po.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  ctx.fillStyle = TOTAL_BG;
  ctx.fillRect(marginX, rowY, contentW, totalRowH);
  ctx.fillStyle = BRAND_DARK;
  ctx.font = `700 17px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('ยอดรวมทั้งหมด', col.nameX + 10, rowY + totalRowH / 2);
  ctx.textAlign = 'right';
  ctx.font = `800 20px ${FONT_FAMILY}`;
  ctx.fillText(`${total.toLocaleString()} บาท`, col.subtotalRight - 10, rowY + totalRowH / 2);
  ctx.textAlign = 'left';
  rowY += totalRowH;

  // หมายเหตุ
  if (noteLines.length > 0) {
    rowY += 18;
    ctx.fillStyle = TEXT_GRAY;
    ctx.font = `400 14px ${FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';
    noteLines.forEach((line, i) => {
      ctx.fillText(line, marginX, rowY + i * 20);
    });
    rowY += noteLines.length * 20 + 6;
  }

  // เส้นคั่นท้าย + footer
  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(marginX, rowY + 14);
  ctx.lineTo(W - marginX, rowY + 14);
  ctx.stroke();

  ctx.fillStyle = TEXT_LIGHT_GRAY;
  ctx.font = `400 12px ${FONT_FAMILY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(
    `สร้างโดย ${getEmployeeName(employees, po.createdBy)} · สร้างภาพเมื่อ ${formatThaiDateTime(new Date().toISOString())} · ระบบ Rowhou8e OPS`,
    marginX,
    rowY + 38
  );

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  return blob;
}

function purchaseOrderImageFilename(po: PurchaseOrder, supplier: Supplier | undefined): string {
  const safeSupplierName = (supplier?.name ?? 'ผู้ขาย').replace(/[\\/:*?"<>|]/g, '');
  const filename = `ใบสั่งซื้อ-${safeSupplierName}-${po.orderDate}.png`;
  return filename;
}

function triggerPurchaseOrderImageDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadPurchaseOrderImage(
  po: PurchaseOrder,
  supplier: Supplier | undefined,
  employees: Employee[]
): Promise<void> {
  const blob = await renderPurchaseOrderImageBlob(po, supplier, employees);
  if (!blob) return;
  triggerPurchaseOrderImageDownload(blob, purchaseOrderImageFilename(po, supplier));
}

/** แชร์รูปภาพใบสั่งซื้อผ่านเมนูแชร์ของอุปกรณ์ (เช่น LINE); ถ้าอุปกรณ์ไม่รองรับการแชร์ไฟล์ จะดาวน์โหลดรูปภาพแทน */
export async function sharePurchaseOrderImage(
  po: PurchaseOrder,
  supplier: Supplier | undefined,
  employees: Employee[]
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderPurchaseOrderImageBlob(po, supplier, employees);
  if (!blob) return 'downloaded';
  const filename = purchaseOrderImageFilename(po, supplier);

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      const canShare = !navigator.canShare || navigator.canShare({ files: [file] });
      if (canShare) {
        await navigator.share({
          files: [file],
          title: filename,
          text: supplier?.name ? `ใบสั่งซื้อ - ${supplier.name}` : 'ใบสั่งซื้อ',
        });
        return 'shared';
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    }
  }

  triggerPurchaseOrderImageDownload(blob, filename);
  return 'downloaded';
}
