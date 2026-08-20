/**
 * ============================================================================
 *  SUPABASE QUERIES — ชั้นคุยกับฐานข้อมูลจริงผ่าน supabase-js
 * ============================================================================
 * ไฟล์นี้แปลงข้อมูลจาก DB (snake_case ตาม schema.sql) ให้เป็น type ฝั่งแอป
 * (camelCase ตาม src/lib/types.ts) ทุกจุด เพื่อให้ import type เดียวกันใช้ได้
 * ทั้งโหมด mock และโหมด supabase โดยไม่ต้องแก้โค้ดหน้าจอ
 *
 * ไฟล์นี้ถูกเรียกใช้งานจริงผ่าน src/lib/supabase/live-store.ts
 * (ดู README หัวข้อ 8 สำหรับภาพรวมสถาปัตยกรรม)
 * ============================================================================
 */
import { getSupabaseClient } from './client';
import type {
  AppSettings,
  CashReport,
  ChecklistEntryItem,
  ChecklistItemFrequency,
  ChecklistRun,
  ChecklistTemplateItem,
  Employee,
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
  Station,
  StockCategory,
  StockItem,
  StoreHoliday,
  Supplier,
  SupplierItemPrice,
} from '../types';

// ================= STATIONS (แผนก) =================
export async function fetchStations(): Promise<Station[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('stations').select('*').eq('active', true).order('sort_order');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    active: r.active,
    order: r.sort_order,
    hasProduction: r.has_production,
  }));
}

/** เพิ่มแผนกใหม่ — ต้องมีสิทธิ์ owner เท่านั้น (RLS "stations_write_owner_only") */
export async function createStation(input: { name: string; hasProduction: boolean; actorId: string }) {
  const sb = getSupabaseClient();
  const { data: existing } = await sb.from('stations').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const nextOrder = existing && existing.length > 0 ? Number(existing[0].sort_order) + 1 : 0;

  const { data, error } = await sb
    .from('stations')
    .insert({ name: input.name, sort_order: nextOrder, has_production: input.hasProduction, active: true })
    .select()
    .single();
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: input.actorId,
    target_label: input.name,
    detail: `เพิ่มแผนกใหม่: ${input.name}`,
  });

  return data;
}

/** แก้ไขชื่อ/ประเภทแผนก — ต้องมีสิทธิ์ owner เท่านั้น (RLS "stations_write_owner_only") */
export async function updateStation(id: string, patch: { name?: string; hasProduction?: boolean }, actorId: string) {
  const sb = getSupabaseClient();
  const { data: before } = await sb.from('stations').select('name').eq('id', id).single();

  const updatePayload: Record<string, unknown> = {};
  if (patch.name !== undefined) updatePayload.name = patch.name;
  if (patch.hasProduction !== undefined) updatePayload.has_production = patch.hasProduction;

  const { error } = await sb.from('stations').update(updatePayload).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: patch.name ?? before?.name ?? id,
    detail: `แก้ไขแผนก "${before?.name ?? id}"`,
  });
}

/** ลบแผนก — soft-delete (active=false) เพื่อไม่กระทบประวัติเช็กลิสต์/ล็อตการผลิตเก่าที่เคยอ้างอิงแผนกนี้ — ต้องมีสิทธิ์ owner เท่านั้น */
export async function deleteStation(id: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: before } = await sb.from('stations').select('name').eq('id', id).single();

  const { error } = await sb.from('stations').update({ active: false }).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: before?.name ?? id,
    detail: `ลบแผนก: ${before?.name ?? id}`,
  });
}

// ================= EMPLOYEES =================
export async function fetchEmployees(): Promise<Employee[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('employees').select('*').eq('active', true).order('name');
  if (error) throw error;
  const empIds = (data ?? []).map((r: any) => r.id);
  const stationIdsMap = new Map<string, string[]>();
  if (empIds.length > 0) {
    const { data: esRows, error: esError } = await sb.from('employee_stations').select('employee_id, station_id').in('employee_id', empIds);
    if (esError) throw esError;
    for (const row of esRows ?? []) {
      const arr = stationIdsMap.get(row.employee_id) ?? [];
      arr.push(row.station_id);
      stationIdsMap.set(row.employee_id, arr);
    }
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    nickname: r.nickname,
    role: r.role,
    avatarColor: r.avatar_color,
    pinCode: '', // โหมด Supabase ใช้ Supabase Auth ล็อกอินจริง ไม่ใช้ PIN
    stationId: r.station_id,
    stationIds: stationIdsMap.get(r.id) ?? [],
    active: r.active,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at ?? null,
    lastLoginDevice: r.last_login_device ?? null,
  }));
}

/** หา employee ที่ผูกกับ auth user id ปัจจุบัน (ใช้ตอนล็อกอินสำเร็จ) */
export async function fetchEmployeeByAuthUserId(authUserId: string): Promise<Employee | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('employees').select('*').eq('auth_user_id', authUserId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: esRows, error: esError } = await sb.from('employee_stations').select('station_id').eq('employee_id', data.id);
  if (esError) throw esError;
  return {
    id: data.id,
    name: data.name,
    nickname: data.nickname,
    role: data.role,
    avatarColor: data.avatar_color,
    pinCode: '',
    stationId: data.station_id,
    stationIds: (esRows ?? []).map((row: any) => row.station_id),
    active: data.active,
    createdAt: data.created_at,
    lastLoginAt: data.last_login_at ?? null,
    lastLoginDevice: data.last_login_device ?? null,
  };
}

/** บันทึกอุปกรณ์/เวลาล็อกอินล่าสุดของผู้ใช้ปัจจุบัน (เก็บแค่ครั้งล่าสุด ไม่ใช่ประวัติ) — เรียกทันทีหลังล็อกอินสำเร็จ */
export async function recordLogin(device: string | null) {
  const sb = getSupabaseClient();
  const { error } = await sb.rpc('record_login', { device: device ?? 'ไม่ทราบอุปกรณ์' });
  if (error) throw error;
}

// ================= STOCK CATEGORIES =================
export async function fetchStockCategories(): Promise<StockCategory[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('stock_categories').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, name: r.name }));
}

/** เปลี่ยนชื่อหมวดหมู่วัตถุดิบ — จำกัดสิทธิ์ owner/manager ผ่าน RLS (stock_categories_write_owner_manager); ชื่อซ้ำจะชนกับ unique constraint ของตาราง */
export async function updateStockCategoryName(id: string, name: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: before } = await sb.from('stock_categories').select('name').eq('id', id).single();
  const { error } = await sb.from('stock_categories').update({ name }).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: name,
    detail: `เปลี่ยนชื่อหมวดหมู่วัตถุดิบ: ${before?.name ?? id} -> ${name}`,
  });
}

export async function createStockCategory(input: { name: string; actorId: string }) {
  const sb = getSupabaseClient();
  const { error } = await sb.from('stock_categories').insert({ name: input.name });
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: input.actorId,
    target_label: input.name,
    detail: `เพิ่มหมวดหมู่วัตถุดิบใหม่: ${input.name}`,
  });
}

export async function deleteStockCategory(id: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: before } = await sb.from('stock_categories').select('name').eq('id', id).single();
  const { error } = await sb.from('stock_categories').delete().eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: before?.name ?? id,
    detail: `ลบหมวดหมู่วัตถุดิบ: ${before?.name ?? id}`,
  });
}

// ================= STOCK ITEMS =================
export async function fetchStockItems(): Promise<StockItem[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('stock_items').select('*').eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    categoryId: r.category_id,
    quantity: Number(r.quantity),
    unit: r.unit,
    minQuantity: Number(r.min_quantity),
    parQuantity: Number(r.par_quantity),
    expiryDate: r.expiry_date,
    status: r.status,
    note: r.note ?? '',
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
    active: r.active,
    supplierId: r.supplier_id,
  }));
}

export async function adjustStockQuantity(id: string, quantity: number, note: string, updatedBy: string) {
  const sb = getSupabaseClient();
  const { error: updateError } = await sb
    .from('stock_items')
    .update({ quantity, note, updated_by: updatedBy })
    .eq('id', id);
  if (updateError) throw updateError;

  const { data: item } = await sb.from('stock_items').select('name, unit').eq('id', id).single();
  await sb.from('history_logs').insert({
    action_type: 'stock_adjust',
    actor_id: updatedBy,
    target_label: item?.name ?? id,
    detail: `ปรับจำนวนคงเหลือเป็น ${quantity} ${item?.unit ?? ''}${note ? ` (${note})` : ''}`,
  });
}

export async function markStockUnusable(id: string, note: string, actorId: string) {
  const sb = getSupabaseClient();
  const { error } = await sb.from('stock_items').update({ status: 'unusable', note, updated_by: actorId }).eq('id', id);
  if (error) throw error;
  const { data: item } = await sb.from('stock_items').select('name').eq('id', id).single();
  await sb.from('history_logs').insert({
    action_type: 'waste_report',
    actor_id: actorId,
    target_label: item?.name ?? id,
    detail: `แจ้งของเสีย/ใช้ไม่ได้: ${note || 'ไม่ระบุเหตุผล'}`,
  });
}

/** เพิ่มวัตถุดิบใหม่เข้ารายการสต๊อก — จำกัดสิทธิ์ owner/manager ผ่าน RLS (stock_items_insert_owner_manager) */
export async function createStockItem(input: {
  name: string;
  categoryId: string;
  unit: string;
  minQuantity: number;
  parQuantity: number;
  quantity: number;
  supplierId: string | null;
  actorId: string;
}): Promise<StockItem> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('stock_items')
    .insert({
      name: input.name,
      category_id: input.categoryId,
      unit: input.unit,
      min_quantity: input.minQuantity,
      par_quantity: input.parQuantity,
      quantity: input.quantity,
      supplier_id: input.supplierId,
      status: 'normal',
      updated_by: input.actorId,
      active: true,
    })
    .select()
    .single();
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: input.actorId,
    target_label: input.name,
    detail: `เพิ่มวัตถุดิบใหม่ในสต๊อก: ${input.name} (${input.unit})`,
  });

  return {
    id: data.id,
    name: data.name,
    categoryId: data.category_id,
    quantity: Number(data.quantity),
    unit: data.unit,
    minQuantity: Number(data.min_quantity),
    parQuantity: Number(data.par_quantity),
    expiryDate: data.expiry_date,
    status: data.status,
    note: data.note ?? '',
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
    active: data.active,
    supplierId: data.supplier_id,
  };
}

/** แก้ไขข้อมูลวัตถุดิบ (ชื่อ/หมวดหมู่/หน่วย/จำนวนขั้นต่ำ/จำนวนที่ควรมี) — แยกจาก adjustStockQuantity ซึ่งใช้ปรับ "จำนวนคงเหลือ" เท่านั้น */
export async function updateStockItemDetails(
  id: string,
  patch: { name?: string; categoryId?: string; unit?: string; minQuantity?: number; parQuantity?: number; supplierId?: string | null },
  actorId: string
) {
  const sb = getSupabaseClient();
  const dbPatch: Record<string, unknown> = { updated_by: actorId };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId;
  if (patch.unit !== undefined) dbPatch.unit = patch.unit;
  if (patch.minQuantity !== undefined) dbPatch.min_quantity = patch.minQuantity;
  if (patch.parQuantity !== undefined) dbPatch.par_quantity = patch.parQuantity;
  if (patch.supplierId !== undefined) dbPatch.supplier_id = patch.supplierId;

  const { data: before } = await sb.from('stock_items').select('name').eq('id', id).single();
  const { error } = await sb.from('stock_items').update(dbPatch).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: patch.name ?? before?.name ?? id,
    detail: `แก้ไขข้อมูลวัตถุดิบ: ${Object.keys(patch).join(', ')}`,
  });
}

/** ลบวัตถุดิบออกจากรายการ — ใช้ soft-delete (active=false) เพื่อไม่ให้ชน foreign key จาก purchase_requests เดิม */
export async function deleteStockItem(id: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: item } = await sb.from('stock_items').select('name').eq('id', id).single();
  const { error } = await sb.from('stock_items').update({ active: false, updated_by: actorId }).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: item?.name ?? id,
    detail: `ลบวัตถุดิบออกจากสต๊อก: ${item?.name ?? id}`,
  });
}

// ================= CHECKLIST TEMPLATE (แยกต่อบาร์) =================
export async function fetchChecklistTemplateItems(): Promise<ChecklistTemplateItem[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('checklist_template_items')
    .select('*')
    .eq('active', true)
    .order('station_id')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    stationId: r.station_id,
    label: r.label,
    order: r.sort_order,
    active: r.active,
    frequency: r.frequency ?? 'daily',
    weeklyDays: r.weekly_days ?? null,
    monthlyDay: r.monthly_day ?? null,
  }));
}

/** เพิ่มรายการเช็กลิสต์ใหม่ให้บาร์ที่เลือก — เรียงต่อท้ายรายการเดิมอัตโนมัติ — จำกัดสิทธิ์ owner/manager ผ่าน RLS */
export async function createChecklistTemplateItem(input: {
  stationId: string;
  label: string;
  actorId: string;
  frequency?: ChecklistItemFrequency;
  weeklyDays?: number[] | null;
  monthlyDay?: number | null;
}): Promise<ChecklistTemplateItem> {
  const sb = getSupabaseClient();
  const { data: existing } = await sb
    .from('checklist_template_items')
    .select('sort_order')
    .eq('station_id', input.stationId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = existing && existing.length > 0 ? Number(existing[0].sort_order) + 1 : 0;

  const { data, error } = await sb
    .from('checklist_template_items')
    .insert({
      station_id: input.stationId,
      label: input.label,
      sort_order: nextOrder,
      active: true,
      frequency: input.frequency ?? 'daily',
      weekly_days: input.weeklyDays ?? null,
      monthly_day: input.monthlyDay ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const { data: station } = await sb.from('stations').select('name').eq('id', input.stationId).single();
  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: input.actorId,
    target_label: `${station?.name ?? input.stationId} · เช็กลิสต์`,
    detail: `เพิ่มรายการเช็กลิสต์ใหม่: ${input.label}`,
  });

  return {
    id: data.id,
    stationId: data.station_id,
    label: data.label,
    order: data.sort_order,
    active: data.active,
    frequency: data.frequency ?? 'daily',
    weeklyDays: data.weekly_days ?? null,
    monthlyDay: data.monthly_day ?? null,
  };
}

/** แก้ไขข้อความรายการเช็กลิสต์ */
export async function updateChecklistTemplateItem(
  id: string,
  patch: { label?: string; frequency?: ChecklistItemFrequency; weeklyDays?: number[] | null; monthlyDay?: number | null },
  actorId: string
) {
  const sb = getSupabaseClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.label !== undefined) dbPatch.label = patch.label;
  if (patch.frequency !== undefined) dbPatch.frequency = patch.frequency;
  if (patch.weeklyDays !== undefined) dbPatch.weekly_days = patch.weeklyDays;
  if (patch.monthlyDay !== undefined) dbPatch.monthly_day = patch.monthlyDay;

  const { error } = await sb.from('checklist_template_items').update(dbPatch).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: patch.label ?? id,
    detail: `แก้ไขรายการเช็กลิสต์: ${patch.label ?? ''}`,
  });
}

/** ลบรายการเช็กลิสต์ — ใช้ soft-delete (active=false) เพื่อไม่กระทบประวัติเช็กลิสต์เก่าที่เคยอ้างอิง template_item_id นี้ */
export async function deleteChecklistTemplateItem(id: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: item } = await sb.from('checklist_template_items').select('label').eq('id', id).single();
  const { error } = await sb.from('checklist_template_items').update({ active: false }).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: item?.label ?? id,
    detail: `ลบรายการเช็กลิสต์: ${item?.label ?? id}`,
  });
}

// ================= CHECKLIST RUNS (แยกต่อแผนก — station_id + run_date คือ unique key) =================
function mapChecklistEntryItem(r: any): ChecklistEntryItem {
  return {
    templateItemId: r.template_item_id,
    label: r.label,
    status: r.status,
    note: r.note ?? '',
    photoUrl: r.photo_url,
    quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
  };
}

/** โหลดเช็กลิสต์ทั้งหมด (ทุกแผนก ทุกวัน) พร้อมรายการย่อย — ใช้ตอนโหลดข้อมูลครั้งแรกของแอป */
export async function fetchAllChecklistRuns(): Promise<ChecklistRun[]> {
  const sb = getSupabaseClient();
  const { data: runs, error } = await sb.from('checklist_runs').select('*').order('run_date', { ascending: false });
  if (error) throw error;
  if (!runs || runs.length === 0) return [];

  const runIds = runs.map((r: any) => r.id);
  const { data: items, error: itemsError } = await sb
    .from('checklist_entry_items')
    .select('*')
    .in('run_id', runIds);
  if (itemsError) throw itemsError;

  const itemsByRun = new Map<string, ChecklistEntryItem[]>();
  for (const it of items ?? []) {
    const list = itemsByRun.get(it.run_id) ?? [];
    list.push(mapChecklistEntryItem(it));
    itemsByRun.set(it.run_id, list);
  }

  return runs.map((r: any) => ({
    id: r.id,
    stationId: r.station_id,
    date: r.run_date,
    submittedAt: r.submitted_at,
    submittedBy: r.submitted_by,
    items: itemsByRun.get(r.id) ?? [],
    isComplete: r.is_complete,
    backdated: r.backdated ?? false,
    backdatedReason: r.backdated_reason ?? null,
  }));
}

/**
 * ส่งเช็กลิสต์ — dateStr ต่างจากวันนี้ = ทำย้อนหลัง (เฉพาะ manager/owner ทำได้ ทั้งที่หน้าจอกันไว้และ RLS
 * บังคับซ้ำอีกชั้นผ่าน policy checklist_runs_insert_staff_today_manager_any) backdatedReason บังคับกรอกเมื่อทำย้อนหลัง
 */
export async function submitChecklist(
  stationId: string,
  dateStr: string,
  items: ChecklistEntryItem[],
  employeeId: string,
  backdatedReason: string | null
) {
  const sb = getSupabaseClient();
  const todayStr = new Date().toISOString().slice(0, 10);
  const backdated = dateStr !== todayStr;

  const { data: run, error: runError } = await sb
    .from('checklist_runs')
    .upsert(
      {
        station_id: stationId,
        run_date: dateStr,
        submitted_at: new Date().toISOString(),
        submitted_by: employeeId,
        is_complete: true,
        backdated,
        backdated_reason: backdated ? backdatedReason : null,
      },
      { onConflict: 'run_date,station_id' }
    )
    .select()
    .single();
  if (runError) throw runError;

  // ลบรายการย่อยเดิม (ถ้ามีจากการ upsert ซ้ำ) แล้วค่อยเพิ่มใหม่ทั้งหมด
  await sb.from('checklist_entry_items').delete().eq('run_id', run.id);

  const rows = items.map((it) => ({
    run_id: run.id,
    template_item_id: it.templateItemId,
    label: it.label,
    status: it.status,
    note: it.note,
    photo_url: it.photoUrl,
    quantity: it.quantity,
  }));
  const { error: itemsError } = await sb.from('checklist_entry_items').insert(rows);
  if (itemsError) throw itemsError;

  const { data: station } = await sb.from('stations').select('name').eq('id', stationId).single();
  const problemCount = items.filter((i) => i.status !== 'normal').length;
  const backdatedNote = backdated ? ` (ทำย้อนหลัง: ${backdatedReason ?? ''})` : '';
  await sb.from('history_logs').insert({
    action_type: 'checklist_submit',
    actor_id: employeeId,
    target_label: `${station?.name ?? stationId} · เช็กลิสต์วันที่ ${dateStr}`,
    detail:
      (problemCount > 0
        ? `ทำเช็กลิสต์ครบ ${items.length} ข้อ พบ ${problemCount} รายการที่ต้องติดตาม`
        : `ทำเช็กลิสต์ครบ ${items.length} ข้อ ทุกรายการปกติ`) + backdatedNote,
  });

  return run;
}

// ================= PRODUCTS (สินค้าที่แผนกผลิต) =================
export async function fetchProducts(): Promise<Product[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('products').select('*').eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    stationId: r.station_id,
    name: r.name,
    unit: r.unit,
    shelfLifeDays: r.shelf_life_days,
    active: r.active,
  }));
}

/** เพิ่มสินค้าที่แผนกผลิตได้ — จำกัดสิทธิ์ owner/manager ผ่าน RLS (products_write_owner_manager) */
export async function createProduct(input: { stationId: string; name: string; unit: string; shelfLifeDays: number; actorId: string }) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('products')
    .insert({ station_id: input.stationId, name: input.name, unit: input.unit, shelf_life_days: input.shelfLifeDays, active: true })
    .select()
    .single();
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: input.actorId,
    target_label: input.name,
    detail: `เพิ่มสินค้าที่ผลิตใหม่: ${input.name} (${input.unit}, เก็บได้ ${input.shelfLifeDays} วัน)`,
  });

  return data;
}

export async function updateProduct(id: string, patch: { name?: string; unit?: string; shelfLifeDays?: number }, actorId: string) {
  const sb = getSupabaseClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.unit !== undefined) dbPatch.unit = patch.unit;
  if (patch.shelfLifeDays !== undefined) dbPatch.shelf_life_days = patch.shelfLifeDays;

  const { data: before } = await sb.from('products').select('name').eq('id', id).single();
  const { error } = await sb.from('products').update(dbPatch).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: patch.name ?? before?.name ?? id,
    detail: `แก้ไขข้อมูลสินค้าที่ผลิต: ${Object.keys(patch).join(', ')}`,
  });
}

/** ลบสินค้าที่ผลิต — ใช้ soft-delete (active=false) เพื่อไม่กระทบล็อตเก่าที่เคยผลิตไปแล้ว */
export async function deleteProduct(id: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: item } = await sb.from('products').select('name').eq('id', id).single();
  const { error } = await sb.from('products').update({ active: false }).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: item?.name ?? id,
    detail: `ลบสินค้าที่ผลิตออกจากรายการ: ${item?.name ?? id}`,
  });
}

// ================= PRODUCT LOTS (ล็อตการผลิต — แทน milk_batches เดิม ใช้ได้ทุกแผนกที่มีการผลิต) =================
export async function fetchProductLots(): Promise<ProductLot[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('product_lots').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    productId: r.product_id,
    lotNumber: r.lot_number,
    producedDate: r.produced_date,
    producedTime: r.produced_time,
    quantity: Number(r.quantity),
    unit: r.unit,
    producedBy: r.produced_by,
    shelfLifeDays: r.shelf_life_days,
    expiresAt: r.expires_at,
    note: r.note ?? '',
    photoUrl: r.photo_url,
    status: r.status,
    usedUpAt: r.used_up_at,
    createdAt: r.created_at,
  }));
}

export async function createProductLot(input: {
  productId: string;
  producedDate: string;
  producedTime: string;
  quantity: number;
  unit: string;
  producedBy: string;
  note: string;
  photoUrl: string | null;
}) {
  const sb = getSupabaseClient();
  const { data: product } = await sb.from('products').select('name, shelf_life_days').eq('id', input.productId).single();
  const shelfLifeDays = product?.shelf_life_days ?? 3;
  const producedAt = new Date(`${input.producedDate}T${input.producedTime}:00`);
  const expiresAt = new Date(producedAt.getTime() + shelfLifeDays * 24 * 60 * 60 * 1000);

  // ตัวอย่างการสร้างเลขล็อตอัตโนมัติแบบ sequential — production แนะนำใช้ Postgres sequence หรือ function
  const { count } = await sb.from('product_lots').select('*', { count: 'exact', head: true });
  const prefix = (product?.name ?? 'L').trim().charAt(0).toUpperCase() || 'L';
  const lotNumber = `${prefix}-${String(1000 + (count ?? 0) + 1)}`;

  const { data, error } = await sb
    .from('product_lots')
    .insert({
      product_id: input.productId,
      lot_number: lotNumber,
      produced_date: input.producedDate,
      produced_time: input.producedTime,
      quantity: input.quantity,
      unit: input.unit,
      produced_by: input.producedBy,
      shelf_life_days: shelfLifeDays,
      expires_at: expiresAt.toISOString(),
      note: input.note,
      photo_url: input.photoUrl,
      status: 'active',
    })
    .select()
    .single();
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'production_log',
    actor_id: input.producedBy,
    target_label: `${product?.name ?? 'สินค้า'} ล็อต ${lotNumber}`,
    detail: `ผลิต ${input.quantity} ${input.unit} เก็บได้ ${shelfLifeDays} วัน`,
  });

  return data;
}

export async function setProductLotStatus(id: string, status: ProductLotStatus, actorId: string) {
  const sb = getSupabaseClient();
  const patch: Record<string, unknown> = { status };
  if (status === 'used_up') patch.used_up_at = new Date().toISOString();
  const { error } = await sb.from('product_lots').update(patch).eq('id', id);
  if (error) throw error;
  const { data: lot } = await sb.from('product_lots').select('lot_number').eq('id', id).single();
  await sb.from('history_logs').insert({
    action_type: 'lot_status_change',
    actor_id: actorId,
    target_label: `ล็อต ${lot?.lot_number ?? id}`,
    detail: `เปลี่ยนสถานะเป็น "${status}"`,
  });
}

// ================= PURCHASE REQUESTS =================
export async function fetchPurchaseRequests(): Promise<PurchaseRequest[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('purchase_requests').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    stockItemId: r.stock_item_id,
    itemName: r.item_name,
    currentQuantity: Number(r.current_quantity),
    requestedQuantity: Number(r.requested_quantity),
    unit: r.unit,
    reason: r.reason ?? '',
    neededBy: r.needed_by,
    requestedBy: r.requested_by,
    photoUrl: r.photo_url,
    status: r.status,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    receivedAt: r.received_at,
    autoGenerated: r.auto_generated,
    createdAt: r.created_at,
  }));
}

export async function createPurchaseRequest(input: {
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
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('purchase_requests')
    .insert({
      stock_item_id: input.stockItemId,
      item_name: input.itemName,
      current_quantity: input.currentQuantity,
      requested_quantity: input.requestedQuantity,
      unit: input.unit,
      reason: input.reason,
      needed_by: input.neededBy,
      requested_by: input.requestedBy,
      photo_url: input.photoUrl,
      status: 'pending',
      auto_generated: false,
    })
    .select()
    .single();
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'purchase_create',
    actor_id: input.requestedBy,
    target_label: input.itemName,
    detail: `สร้างรายการเสนอซื้อ ${input.requestedQuantity} ${input.unit}`,
  });

  return data;
}

export async function updatePurchaseRequestStatus(id: string, status: PurchaseRequestStatus, actorId: string) {
  const sb = getSupabaseClient();
  const patch: Record<string, unknown> = { status };
  if (status === 'approved') {
    patch.approved_by = actorId;
    patch.approved_at = new Date().toISOString();
  }
  if (status === 'received') patch.received_at = new Date().toISOString();

  const { data: pr, error } = await sb.from('purchase_requests').update(patch).eq('id', id).select().single();
  if (error) throw error;

  if (status === 'received' && pr?.stock_item_id) {
    // เพิ่มจำนวนกลับเข้าสต๊อก — ใน production แนะนำทำเป็น Postgres function เพื่อความ atomic
    const { data: item } = await sb.from('stock_items').select('quantity').eq('id', pr.stock_item_id).single();
    if (item) {
      await sb
        .from('stock_items')
        .update({ quantity: Number(item.quantity) + Number(pr.requested_quantity), status: 'normal', updated_by: actorId })
        .eq('id', pr.stock_item_id);
    }
  }

  const detailMap: Record<string, string> = {
    approved: 'อนุมัติรายการเสนอซื้อ',
    ordered: 'เปลี่ยนสถานะเป็นสั่งซื้อแล้ว',
    received: `รับสินค้าเข้าสต๊อกเรียบร้อย ${pr?.requested_quantity ?? ''} ${pr?.unit ?? ''}`,
    cancelled: 'ยกเลิกรายการเสนอซื้อ',
  };
  const actionType = status === 'approved' ? 'purchase_approve' : status === 'received' ? 'purchase_receive' : 'purchase_create';
  await sb.from('history_logs').insert({
    action_type: actionType,
    actor_id: actorId,
    target_label: pr?.item_name ?? id,
    detail: detailMap[status] ?? `เปลี่ยนสถานะเป็น ${status}`,
  });

  return pr;
}

// ================= SUPPLIERS =================
export async function fetchSuppliers(): Promise<Supplier[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('suppliers').select('*').eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    contactPerson: r.contact_person ?? '',
    phone: r.phone ?? '',
    address: r.address ?? '',
    note: r.note ?? '',
    active: r.active,
  }));
}

export async function createSupplier(input: { name: string; contactPerson: string; phone: string; address: string; note: string; actorId: string }) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('suppliers')
    .insert({
      name: input.name,
      contact_person: input.contactPerson,
      phone: input.phone,
      address: input.address,
      note: input.note,
      active: true,
    })
    .select()
    .single();
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'supplier_change',
    actor_id: input.actorId,
    target_label: input.name,
    detail: `เพิ่มผู้ขายใหม่: ${input.name}`,
  });

  return data;
}

export async function updateSupplier(
  id: string,
  patch: { name?: string; contactPerson?: string; phone?: string; address?: string; note?: string },
  actorId: string
) {
  const sb = getSupabaseClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.contactPerson !== undefined) dbPatch.contact_person = patch.contactPerson;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone;
  if (patch.address !== undefined) dbPatch.address = patch.address;
  if (patch.note !== undefined) dbPatch.note = patch.note;

  const { data: before } = await sb.from('suppliers').select('name').eq('id', id).single();
  const { error } = await sb.from('suppliers').update(dbPatch).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'supplier_change',
    actor_id: actorId,
    target_label: patch.name ?? before?.name ?? id,
    detail: `แก้ไขข้อมูลผู้ขาย: ${Object.keys(patch).join(', ')}`,
  });
}

/** ลบผู้ขาย — ใช้ soft-delete (active=false) เพื่อไม่กระทบประวัติราคา/ใบสั่งซื้อเก่าที่อ้างอิงอยู่ */
export async function deleteSupplier(id: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: item } = await sb.from('suppliers').select('name').eq('id', id).single();
  const { error } = await sb.from('suppliers').update({ active: false }).eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'supplier_change',
    actor_id: actorId,
    target_label: item?.name ?? id,
    detail: `ลบผู้ขายออกจากรายการ: ${item?.name ?? id}`,
  });
}

// ================= SUPPLIER ITEM PRICES (ประวัติราคา — append-only) =================
export async function fetchSupplierItemPrices(): Promise<SupplierItemPrice[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('supplier_item_prices').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    supplierId: r.supplier_id,
    stockItemId: r.stock_item_id,
    unit: r.unit,
    price: Number(r.price),
    note: r.note ?? '',
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

/** เพิ่มราคาใหม่ (ประวัติราคา — ไม่มี UPDATE/DELETE policy จึงต้องเพิ่มแถวใหม่เสมอเมื่อราคาเปลี่ยน) */
export async function addSupplierItemPrice(input: {
  supplierId: string;
  stockItemId: string;
  unit: string;
  price: number;
  note: string;
  actorId: string;
}) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('supplier_item_prices')
    .insert({
      supplier_id: input.supplierId,
      stock_item_id: input.stockItemId,
      unit: input.unit,
      price: input.price,
      note: input.note,
      created_by: input.actorId,
    })
    .select()
    .single();
  if (error) throw error;

  const [{ data: supplier }, { data: item }] = await Promise.all([
    sb.from('suppliers').select('name').eq('id', input.supplierId).single(),
    sb.from('stock_items').select('name').eq('id', input.stockItemId).single(),
  ]);
  await sb.from('history_logs').insert({
    action_type: 'supplier_change',
    actor_id: input.actorId,
    target_label: `${supplier?.name ?? input.supplierId} · ${item?.name ?? input.stockItemId}`,
    detail: `เพิ่มราคาใหม่: ${input.price} บาท/${input.unit}`,
  });

  return data;
}

// ================= PURCHASE ORDERS (แยกจาก purchase_requests — auto-merge ตามผู้ขาย+วันที่) =================
export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const sb = getSupabaseClient();
  const { data: orders, error } = await sb.from('purchase_orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((o: any) => o.id);
  const { data: items, error: itemsError } = await sb.from('purchase_order_items').select('*').in('purchase_order_id', orderIds);
  if (itemsError) throw itemsError;

  const itemsByOrder = new Map<string, PurchaseOrder['items']>();
  for (const it of items ?? []) {
    const list = itemsByOrder.get(it.purchase_order_id) ?? [];
    list.push({
      id: it.id,
      purchaseOrderId: it.purchase_order_id,
      stockItemId: it.stock_item_id,
      itemName: it.item_name,
      quantity: Number(it.quantity),
      unit: it.unit,
      unitPrice: Number(it.unit_price),
      sourcePurchaseRequestId: it.source_purchase_request_id,
    });
    itemsByOrder.set(it.purchase_order_id, list);
  }

  return orders.map((o: any) => ({
    id: o.id,
    supplierId: o.supplier_id,
    orderDate: o.order_date,
    status: o.status,
    note: o.note ?? '',
    createdBy: o.created_by,
    createdAt: o.created_at,
    sentAt: o.sent_at,
    receivedAt: o.received_at,
    receivedBy: o.received_by,
    items: itemsByOrder.get(o.id) ?? [],
  }));
}

/** สร้าง/รวม (auto-merge) ใบสั่งซื้อ — ถ้ามีใบร่าง (draft) ของผู้ขายเดียวกันในวันเดียวกันอยู่แล้ว จะรวมรายการเข้าใบเดิม */
export async function createOrMergePurchaseOrder(input: {
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
  const sb = getSupabaseClient();

  const { data: existing } = await sb
    .from('purchase_orders')
    .select('id')
    .eq('supplier_id', input.supplierId)
    .eq('order_date', input.orderDate)
    .eq('status', 'draft')
    .maybeSingle();

  let orderId: string;
  if (existing) {
    orderId = existing.id;
  } else {
    const { data: order, error } = await sb
      .from('purchase_orders')
      .insert({ supplier_id: input.supplierId, order_date: input.orderDate, status: 'draft', created_by: input.actorId })
      .select()
      .single();
    if (error) throw error;
    orderId = order.id;
  }

  const rows = input.items.map((it) => ({
    purchase_order_id: orderId,
    stock_item_id: it.stockItemId,
    item_name: it.itemName,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unitPrice,
    source_purchase_request_id: it.sourcePurchaseRequestId,
  }));
  const { error: itemsError } = await sb.from('purchase_order_items').insert(rows);
  if (itemsError) throw itemsError;

  // รายการเสนอซื้อต้นทางที่ถูกรวมเข้าใบสั่งซื้อแล้ว ตั้งสถานะเป็น "ordered" ทันที
  const sourceIds = input.items.map((it) => it.sourcePurchaseRequestId).filter((id): id is string => !!id);
  if (sourceIds.length > 0) {
    await sb.from('purchase_requests').update({ status: 'ordered' }).in('id', sourceIds);
  }

  const { data: supplier } = await sb.from('suppliers').select('name').eq('id', input.supplierId).single();
  await sb.from('history_logs').insert({
    action_type: 'po_create',
    actor_id: input.actorId,
    target_label: `ใบสั่งซื้อ · ${supplier?.name ?? input.supplierId} · ${input.orderDate}`,
    detail: existing
      ? `รวมรายการเพิ่มเข้าใบสั่งซื้อเดิม ${input.items.length} รายการ`
      : `สร้างใบสั่งซื้อใหม่ ${input.items.length} รายการ`,
  });

  return orderId;
}

/** เปลี่ยนสถานะใบสั่งซื้อ — received จะเพิ่มจำนวนกลับเข้าสต๊อกอัตโนมัติ + อัปเดตรายการเสนอซื้อต้นทางเป็น received
 *  cancelled จะคืนสถานะรายการเสนอซื้อต้นทางกลับเป็น approved เพื่อให้สร้างใบสั่งซื้อใหม่ได้อีกครั้ง */
export async function updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus, actorId: string) {
  const sb = getSupabaseClient();
  const patch: Record<string, unknown> = { status };
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  if (status === 'received') {
    patch.received_at = new Date().toISOString();
    patch.received_by = actorId;
  }
  const { data: order, error } = await sb.from('purchase_orders').update(patch).eq('id', id).select().single();
  if (error) throw error;

  const { data: items } = await sb.from('purchase_order_items').select('*').eq('purchase_order_id', id);

  if (status === 'received' && items) {
    for (const it of items) {
      if (it.stock_item_id) {
        const { data: stockItem } = await sb.from('stock_items').select('quantity').eq('id', it.stock_item_id).single();
        if (stockItem) {
          await sb
            .from('stock_items')
            .update({ quantity: Number(stockItem.quantity) + Number(it.quantity), status: 'normal', updated_by: actorId })
            .eq('id', it.stock_item_id);
        }
      }
    }
    const sourceIds = items.map((it: any) => it.source_purchase_request_id).filter((sid: string | null): sid is string => !!sid);
    if (sourceIds.length > 0) {
      await sb.from('purchase_requests').update({ status: 'received', received_at: new Date().toISOString() }).in('id', sourceIds);
    }
  }

  if (status === 'cancelled') {
    const sourceIds = (items ?? []).map((it: any) => it.source_purchase_request_id).filter((sid: string | null): sid is string => !!sid);
    if (sourceIds.length > 0) {
      await sb.from('purchase_requests').update({ status: 'approved' }).in('id', sourceIds);
    }
  }

  const { data: supplier } = await sb.from('suppliers').select('name').eq('id', order.supplier_id).single();
  const statusLabel: Record<string, string> = {
    draft: 'ร่าง',
    sent: 'ส่งให้ผู้ขายแล้ว',
    confirmed: 'ผู้ขายยืนยันแล้ว',
    received: 'รับสินค้าแล้ว',
    cancelled: 'ยกเลิก',
  };
  await sb.from('history_logs').insert({
    action_type: 'po_status_change',
    actor_id: actorId,
    target_label: `ใบสั่งซื้อ · ${supplier?.name ?? order.supplier_id}`,
    detail: `เปลี่ยนสถานะเป็น "${statusLabel[status] ?? status}"`,
  });

  return order;
}

export async function updatePurchaseOrderItemPrice(purchaseOrderId: string, itemId: string, unitPrice: number, actorId: string) {
  const sb = getSupabaseClient();

  const { data: order, error: orderError } = await sb
    .from('purchase_orders')
    .select('id, status, supplier_id')
    .eq('id', purchaseOrderId)
    .single();
  if (orderError) throw orderError;
    if (!order) throw new Error('ไม่พบใบสั่งซื้อนี้');
    if (order.status === 'cancelled')
      throw new Error('ไม่สามารถแก้ไขราคาใบสั่งซื้อที่ถูกยกเลิกได้');

  const { data: item, error: itemError } = await sb
    .from('purchase_order_items')
    .select('item_name, unit')
    .eq('id', itemId)
    .single();
  if (itemError) throw itemError;

  const { error } = await sb.from('purchase_order_items').update({ unit_price: unitPrice }).eq('id', itemId);
  if (error) throw error;

  const { data: supplier } = await sb.from('suppliers').select('name').eq('id', order.supplier_id).single();
  await sb.from('history_logs').insert({
    action_type: 'po_price_update',
    actor_id: actorId,
    target_label: `ใบสั่งซื้อ · ${supplier?.name ?? order.supplier_id}`,
    detail: `แก้ไขราคา "${item?.item_name ?? itemId}" เป็น ${unitPrice.toLocaleString()} บาท/${item?.unit ?? ''}`,
  });
}

// ================= รายงานเงินสดปิดร้าน (แบบง่าย — append-only) — เฟส 3 =================
export async function fetchCashReports(): Promise<CashReport[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('cash_reports').select('*').order('report_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    date: r.report_date,
    closingAmount: Number(r.closing_amount),
    note: r.note ?? '',
    submittedBy: r.submitted_by,
    submittedAt: r.submitted_at,
  }));
}

/** บันทึกรายงานเงินสดของวันที่ระบุ */
export async function submitCashReport(input: { date: string; closingAmount: number; note: string; actorId: string }) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('cash_reports')
    .insert({
      report_date: input.date,
      closing_amount: input.closingAmount,
      note: input.note,
      submitted_by: input.actorId,
    })
    .select()
    .single();
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'cash_report_submit',
    actor_id: input.actorId,
    target_label: `รายงานเงินสด · ${input.date}`,
    detail: `บันทึกยอดปิดร้าน ${input.closingAmount.toLocaleString()} บาท`,
  });

  return data;
}

/** แก้ไขยอดเงิน/หมายเหตุของรายงานเงินสดที่บันทึกไว้แล้ว — ต้องมี RLS policy "cash_reports_update_owner_manager" (owner/manager) จึงจะสำเร็จ */
export async function updateCashReport(id: string, patch: { closingAmount?: number; note?: string }, actorId: string) {
  const sb = getSupabaseClient();
  const { data: before } = await sb.from('cash_reports').select('report_date, closing_amount, note').eq('id', id).single();

  const updatePayload: Record<string, unknown> = {};
  if (patch.closingAmount !== undefined) updatePayload.closing_amount = patch.closingAmount;
  if (patch.note !== undefined) updatePayload.note = patch.note;

  const { error } = await sb.from('cash_reports').update(updatePayload).eq('id', id);
  if (error) throw error;

  const changes: string[] = [];
  if (patch.closingAmount !== undefined && before && Number(before.closing_amount) !== patch.closingAmount) {
    changes.push(`ยอดเงิน ${Number(before.closing_amount).toLocaleString()} -> ${patch.closingAmount.toLocaleString()} บาท`);
  }
  if (patch.note !== undefined && before && before.note !== patch.note) {
    changes.push('แก้ไขหมายเหตุ');
  }

  await sb.from('history_logs').insert({
    action_type: 'cash_report_edit',
    actor_id: actorId,
    target_label: `รายงานเงินสด · ${before?.report_date ?? id}`,
    detail: changes.length > 0 ? changes.join(', ') : 'แก้ไขรายงานเงินสด',
  });
}

// ================= วันหยุดร้าน — เฟส 4 =================
export async function fetchStoreHolidays(): Promise<StoreHoliday[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('store_holidays').select('*').order('holiday_date');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    date: r.holiday_date,
    label: r.label ?? '',
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function addStoreHoliday(input: { date: string; label: string; actorId: string }) {
  const sb = getSupabaseClient();
  const { error } = await sb.from('store_holidays').insert({
    holiday_date: input.date,
    label: input.label,
    created_by: input.actorId,
  });
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: input.actorId,
    target_label: `วันหยุดร้าน · ${input.date}`,
    detail: `เพิ่มวันหยุดร้าน${input.label ? `: ${input.label}` : ''}`,
  });
}

export async function removeStoreHoliday(id: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: holiday } = await sb.from('store_holidays').select('holiday_date, label').eq('id', id).single();
  const { error } = await sb.from('store_holidays').delete().eq('id', id);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: `วันหยุดร้าน · ${holiday?.holiday_date ?? id}`,
    detail: `ลบวันหยุดร้าน${holiday?.label ? `: ${holiday.label}` : ''}`,
  });
}

// ================= แจ้งเตือนให้แผนกสั่งสินค้า (owner/manager ส่ง — แผนกเป้าหมายยืนยันรับทราบ) — เฟส 5 =================
export async function fetchOrderReminders(): Promise<OrderReminder[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('order_reminders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    stationId: r.station_id,
    message: r.message ?? '',
    createdBy: r.created_by,
    createdAt: r.created_at,
    acknowledgedBy: r.acknowledged_by,
    acknowledgedAt: r.acknowledged_at,
    willOrder: r.will_order,
    responseNote: r.response_note ?? '',
  }));
}

export async function sendOrderReminder(input: { stationId: string; message: string; actorId: string }) {
  const sb = getSupabaseClient();
  const { data: station } = await sb.from('stations').select('name').eq('id', input.stationId).single();

  const { error } = await sb.from('order_reminders').insert({
    station_id: input.stationId,
    message: input.message,
    created_by: input.actorId,
  });
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'order_reminder_send',
    actor_id: input.actorId,
    target_label: station?.name ?? input.stationId,
    detail: `ส่งแจ้งเตือนให้ ${station?.name ?? ''} ตรวจสอบ/สั่งสินค้า${input.message ? `: ${input.message}` : ''}`,
  });
}

export async function acknowledgeOrderReminder(id: string, input: { willOrder: boolean; note: string }, actorId: string) {
  const sb = getSupabaseClient();
  const { data: before } = await sb.from('order_reminders').select('station_id').eq('id', id).single();
  const { data: station } = before
    ? await sb.from('stations').select('name').eq('id', before.station_id).single()
    : { data: null };

  const { error } = await sb
    .from('order_reminders')
    .update({
      acknowledged_by: actorId,
      acknowledged_at: new Date().toISOString(),
      will_order: input.willOrder,
      response_note: input.note,
    })
    .eq('id', id);
  if (error) throw error;

  const stationName = station?.name ?? before?.station_id ?? id;
  await sb.from('history_logs').insert({
    action_type: 'order_reminder_ack',
    actor_id: actorId,
    target_label: stationName,
    detail: `ยืนยันรับทราบแจ้งเตือนสั่งสินค้าของ ${stationName}: ${input.willOrder ? 'จะสั่งสินค้า' : 'ไม่มีของต้องสั่ง'}${input.note ? ` — ${input.note}` : ''}`,
  });
}


/** ลบการ์ดแจ้งเตือนให้สั่งสินค้า พนักงานทุกตำแหน่ง (owner/manager/staff) ลบได้ */
export async function deleteOrderReminder(id: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: before } = await sb.from('order_reminders').select('station_id').eq('id', id).single();
  const { data: station } = before
    ? await sb.from('stations').select('name').eq('id', before.station_id).single()
    : { data: null };

  const { error } = await sb.from('order_reminders').delete().eq('id', id);
  if (error) throw error;

  const stationName = station?.name ?? before?.station_id ?? id;
  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: stationName,
    detail: `ลบการ์ดแจ้งเตือนให้สั่งสินค้าของ ${stationName}`,
  });
}

// ================= ติ๊กเลือกสินค้าแบบเรียลไทม์ที่หน้า "สั่งสินค้า" (ก่อนบันทึกสั่งซื้อจริง) =================
/** เอาเฉพาะรายการที่เพิ่งอัปเดตภายใน 6 ชม. ที่ผ่านมา — กันรายการค้างเก่าที่พนักงานปิดแท็บทิ้งไว้โดยไม่ได้ยกเลิกติ๊ก ไม่ให้ค้างแสดงตลอดไป */
const ORDER_DRAFT_PICK_STALE_HOURS = 6;

export async function fetchOrderDraftPicks(): Promise<OrderDraftPick[]> {
  const sb = getSupabaseClient();
  const cutoff = new Date(Date.now() - ORDER_DRAFT_PICK_STALE_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('order_draft_picks')
    .select('*')
    .gte('updated_at', cutoff)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    employeeId: r.employee_id,
    stockItemId: r.stock_item_id,
    quantity: Number(r.quantity),
    updatedAt: r.updated_at,
  }));
}

/** ติ๊กเลือก/แก้จำนวนสินค้า — upsert แถวเดียวต่อ (พนักงาน, วัตถุดิบ) ให้พนักงานคนอื่นเห็นแบบเรียลไทม์ทันที
 *  เป็นสถานะชั่วคราวเพื่อประสานงานเท่านั้น จึงไม่บันทึกลง history_logs */
export async function setOrderDraftPick(stockItemId: string, quantity: number, employeeId: string) {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('order_draft_picks')
    .upsert(
      { employee_id: employeeId, stock_item_id: stockItemId, quantity, updated_at: new Date().toISOString() },
      { onConflict: 'employee_id,stock_item_id' }
    );
  if (error) throw error;
}

/** ยกเลิกติ๊ก — ลบแถวออกทันที (ใช้ตอนพนักงานเอาติ๊กออกเอง หรือหลังบันทึกสั่งซื้อสำเร็จแล้ว) */
export async function clearOrderDraftPick(stockItemId: string, employeeId: string) {
  const sb = getSupabaseClient();
  const { error } = await sb.from('order_draft_picks').delete().eq('employee_id', employeeId).eq('stock_item_id', stockItemId);
  if (error) throw error;
}

// ================= SETTINGS =================
export async function fetchSettings(): Promise<AppSettings> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('app_settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return {
    checklistStartTime: data.checklist_start_time,
    checklistDueTime: data.checklist_due_time,
    milkShelfLifeDays: data.milk_shelf_life_days,
    notifyLeadHoursBeforeExpiry: data.notify_lead_hours_before_expiry,
    lowStockNotifyEnabled: data.low_stock_notify_enabled,
    closingTime: data.closing_time,
    closingSummaryEnabled: data.closing_summary_enabled,
  };
}

export async function updateSettings(patch: Partial<AppSettings>, actorId: string) {
  const sb = getSupabaseClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.checklistStartTime) dbPatch.checklist_start_time = patch.checklistStartTime;
  if (patch.checklistDueTime) dbPatch.checklist_due_time = patch.checklistDueTime;
  if (patch.milkShelfLifeDays !== undefined) dbPatch.milk_shelf_life_days = patch.milkShelfLifeDays;
  if (patch.notifyLeadHoursBeforeExpiry !== undefined) dbPatch.notify_lead_hours_before_expiry = patch.notifyLeadHoursBeforeExpiry;
  if (patch.lowStockNotifyEnabled !== undefined) dbPatch.low_stock_notify_enabled = patch.lowStockNotifyEnabled;
  if (patch.closingTime) dbPatch.closing_time = patch.closingTime;
  if (patch.closingSummaryEnabled !== undefined) dbPatch.closing_summary_enabled = patch.closingSummaryEnabled;

  const { error } = await sb.from('app_settings').update(dbPatch).eq('id', 1);
  if (error) throw error;

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: 'ตั้งค่าระบบ',
    detail: `อัปเดตการตั้งค่า: ${Object.keys(patch).join(', ')}`,
  });
}

// ================= EMPLOYEES (เพิ่มใหม่) =================
/**
 * เพิ่มพนักงานใหม่พร้อมบัญชีล็อกอิน (email/password) — ต้องผ่าน API route ฝั่งเซิร์ฟเวอร์เท่านั้น
 * เพราะการสร้างบัญชี Supabase Auth ให้คนอื่นต้องใช้ service role key (ห้ามอยู่ฝั่ง client)
 */
export async function createEmployee(input: {
  name: string;
  nickname: string;
  role: string;
  stationId: string | null;
  stationIds: string[];
  email: string;
  password: string;
  actorId: string;
}) {
  const sb = getSupabaseClient();
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');

  const res = await fetch('/api/employees/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: input.name,
      nickname: input.nickname,
      role: input.role,
      stationId: input.stationId,
      stationIds: input.stationIds,
      email: input.email,
      password: input.password,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error ?? 'เพิ่มพนักงานไม่สำเร็จ');
  }

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: input.actorId,
    target_label: `พนักงาน: ${input.name}`,
    detail: `เพิ่มพนักงานใหม่: ${input.name} (${input.nickname}) — สิทธิ์ ${input.role}`,
  });
}

/**
 * เจ้าของร้านตั้งรหัสผ่านใหม่ให้พนักงานคนอื่น — ต้องผ่าน API route ฝั่งเซิร์ฟเวอร์เท่านั้น
 * เพราะการเปลี่ยนรหัสผ่านบัญชี "คนอื่น" ต้องใช้ service role key (ห้ามอยู่ฝั่ง client)
 */
export async function resetEmployeePassword(employeeId: string, newPassword: string, actorId: string) {
  const sb = getSupabaseClient();
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');

  const { data: target } = await sb.from('employees').select('name').eq('id', employeeId).single();

  const res = await fetch('/api/employees/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ employeeId, newPassword }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error ?? 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
  }

  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: `พนักงาน: ${target?.name ?? employeeId}`,
    detail: `รีเซ็ตรหัสผ่านให้ ${target?.name ?? employeeId}`,
  });
}

// ================= EMPLOYEES (แก้ไข) =================
export async function updateEmployee(
  id: string,
  patch: { role?: string; active?: boolean; stationId?: string | null; stationIds?: string[]; name?: string; nickname?: string },
  actorId: string
) {
  const sb = getSupabaseClient();
  const { data: before } = await sb.from('employees').select('name').eq('id', id).single();

  const dbPatch: Record<string, unknown> = {};
  if (patch.role) dbPatch.role = patch.role;
  if (patch.active !== undefined) dbPatch.active = patch.active;
  if (patch.stationId !== undefined) dbPatch.station_id = patch.stationId;
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.nickname !== undefined) dbPatch.nickname = patch.nickname;

  const { error } = await sb.from('employees').update(dbPatch).eq('id', id);
  if (error) throw error;

  if (patch.stationIds !== undefined) {
    const { error: delError } = await sb.from('employee_stations').delete().eq('employee_id', id);
    if (delError) throw delError;
    if (patch.stationIds.length > 0) {
      const { error: insError } = await sb
        .from('employee_stations')
        .insert(patch.stationIds.map((stationId) => ({ employee_id: id, station_id: stationId })));
      if (insError) throw insError;
    }
  }

  let detail = 'แก้ไขข้อมูลพนักงาน';
  if (patch.role) detail = `เปลี่ยนสิทธิ์เป็น ${patch.role}`;
  else if (patch.active !== undefined) detail = patch.active ? 'เปิดใช้งานพนักงาน' : 'ระงับการใช้งานพนักงาน';
  else if (patch.stationIds !== undefined) detail = `เปลี่ยนแผนกที่เข้าถึงได้ (${patch.stationIds.length} แผนก)`;
  else if (patch.stationId !== undefined) {
    const { data: station } = patch.stationId ? await sb.from('stations').select('name').eq('id', patch.stationId).single() : { data: null };
    detail = `เปลี่ยนแผนกที่ประจำเป็น ${station?.name ?? 'ไม่ระบุ'}`;
  } else if (patch.name !== undefined || patch.nickname !== undefined) {
    detail = `เปลี่ยนชื่อจาก "${before?.name ?? id}" เป็น "${patch.name ?? before?.name ?? id}"${patch.nickname !== undefined ? ` (ชื่อเล่น: ${patch.nickname})` : ''}`;
  }
  await sb.from('history_logs').insert({
    action_type: 'settings_change',
    actor_id: actorId,
    target_label: `พนักงาน: ${before?.name ?? id}`,
    detail,
  });
}

// ================= HISTORY (read-only) =================
export async function fetchHistoryLogs(filters?: { actorId?: string; actionType?: string; date?: string; query?: string }): Promise<HistoryLog[]> {
  const sb = getSupabaseClient();
  let q = sb.from('history_logs').select('*').order('created_at', { ascending: false }).limit(500);
  if (filters?.actorId) q = q.eq('actor_id', filters.actorId);
  if (filters?.actionType) q = q.eq('action_type', filters.actionType);
  if (filters?.date) q = q.gte('created_at', `${filters.date}T00:00:00`).lte('created_at', `${filters.date}T23:59:59`);
  if (filters?.query) q = q.ilike('target_label', `%${filters.query}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    actionType: r.action_type,
    actorId: r.actor_id,
    targetLabel: r.target_label,
    detail: r.detail ?? '',
    createdAt: r.created_at,
    metadata: r.metadata ?? undefined,
  }));
}

/**
 * ตัวอย่างการอัปโหลดรูปภาพขึ้น Supabase Storage
 * ใช้แทนการเก็บ data URL แบบใน mock store
 */
export async function uploadPhoto(bucket: 'checklist-photos' | 'production-photos' | 'purchase-photos', file: File, employeeId: string) {
  const sb = getSupabaseClient();
  const path = `${employeeId}/${Date.now()}-${file.name}`;
  const { error } = await sb.storage.from(bucket).upload(path, file);
  if (error) throw error;
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
