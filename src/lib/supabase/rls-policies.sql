-- ============================================================================
-- Panday Bar Control — Row Level Security (RLS) Policies
-- ============================================================================
-- แนวคิดหลัก:
--   - ทุกตารางเปิด RLS (บังคับสิทธิ์ระดับแถว)
--   - ผู้ใช้ทุกคนที่ล็อกอินแล้ว (Owner/Manager/Staff) "อ่าน" ข้อมูลได้เกือบทั้งหมด
--     (ตรงตามสเปก "Manager ดูข้อมูลทั้งหมด", ส่วน Staff ก็ต้องเห็นสต๊อก/เช็กลิสต์เพื่อทำงาน)
--   - การ "เขียน/แก้ไข" ถูกจำกัดตามบทบาทในสเปก เช่น อนุมัติคำสั่งซื้อได้เฉพาะ Owner/Manager
--   - history_logs อนุญาตให้ "เพิ่ม" และ "อ่าน" เท่านั้น — ไม่มี policy สำหรับ UPDATE/DELETE
--     เจตนา = ป้องกันพนักงานแก้ไขหรือลบประวัติย้อนหลังตามข้อกำหนด #15
-- รันไฟล์นี้ต่อจาก schema.sql
-- ============================================================================

alter table public.stations enable row level security;
alter table public.employees enable row level security;
alter table public.stock_categories enable row level security;
alter table public.stock_items enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.checklist_runs enable row level security;
alter table public.checklist_entry_items enable row level security;
alter table public.products enable row level security;
alter table public.product_lots enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_item_prices enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.cash_reports enable row level security;
alter table public.store_holidays enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.history_logs enable row level security;
alter table public.order_draft_picks enable row level security;
alter table public.app_settings enable row level security;

-- ---------------- STATIONS (บาร์น้ำ) ----------------
create policy "stations_select_all"
  on public.stations for select using (auth.role() = 'authenticated');

create policy "stations_write_owner_only"
  on public.stations for all
  using (public.current_employee_role() = 'owner')
  with check (public.current_employee_role() = 'owner');

-- ---------------- EMPLOYEES ----------------
create policy "employees_select_all_authenticated"
  on public.employees for select
  using (auth.role() = 'authenticated');

create policy "employees_update_owner_only"
  on public.employees for update
  using (public.current_employee_role() = 'owner');

create policy "employees_insert_owner_only"
  on public.employees for insert
  with check (public.current_employee_role() = 'owner');

-- ---------------- STOCK ----------------
create policy "stock_categories_select_all"
  on public.stock_categories for select using (auth.role() = 'authenticated');

create policy "stock_categories_write_owner_manager"
  on public.stock_categories for all
  using (public.current_employee_role() in ('owner', 'manager'))
  with check (public.current_employee_role() in ('owner', 'manager'));

create policy "stock_items_select_all"
  on public.stock_items for select using (auth.role() = 'authenticated');

create policy "stock_items_update_any_staff"
  on public.stock_items for update
  using (public.current_employee_role() in ('owner', 'manager', 'staff'))
  with check (public.current_employee_role() in ('owner', 'manager', 'staff'));

create policy "stock_items_insert_all_roles"
  on public.stock_items for insert
  -- ทุกตำแหน่งเพิ่มวัตถุดิบใหม่เข้าคลังกลางได้ (owner/manager/staff)
  with check (public.current_employee_role() in ('owner', 'manager', 'staff'));

create policy "stock_items_delete_owner_only"
  on public.stock_items for delete
  using (public.current_employee_role() = 'owner');
-- หมายเหตุ: ในทางปฏิบัติแอปไม่ได้ DELETE จริง ใช้วิธี "soft delete" (update active=false) แทน
-- ซึ่งอยู่ภายใต้ policy "stock_items_update_any_staff" ด้านบน (owner/manager/staff update ได้)
-- หน้าจอ UI จะจำกัดปุ่ม "ลบวัตถุดิบ" ให้เห็นเฉพาะ owner/manager เท่านั้น

-- ---------------- CHECKLIST ----------------
create policy "checklist_template_select_all"
  on public.checklist_template_items for select using (auth.role() = 'authenticated');

create policy "checklist_template_write_owner_manager"
  on public.checklist_template_items for all
  using (public.current_employee_role() in ('owner', 'manager'))
  with check (public.current_employee_role() in ('owner', 'manager'));

create policy "checklist_runs_select_all"
  on public.checklist_runs for select using (auth.role() = 'authenticated');

-- staff ทำเช็กลิสต์ย้อนหลังไม่ได้ (บันทึกได้เฉพาะของวันนี้) — owner/manager ทำย้อนหลังได้ (ดูสเปก §7 backdated)
create policy "checklist_runs_insert_staff_today_manager_any"
  on public.checklist_runs for insert
  with check (
    public.current_employee_role() in ('owner', 'manager')
    or (public.current_employee_role() = 'staff' and run_date = current_date)
  );

create policy "checklist_runs_update_owner_manager"
  on public.checklist_runs for update
  using (public.current_employee_role() in ('owner', 'manager'));

create policy "checklist_entries_select_all"
  on public.checklist_entry_items for select using (auth.role() = 'authenticated');

create policy "checklist_entries_insert_staff_up"
  on public.checklist_entry_items for insert
  with check (public.current_employee_role() in ('owner', 'manager', 'staff'));

create policy "checklist_entries_update_owner_manager"
  on public.checklist_entry_items for update
  using (public.current_employee_role() in ('owner', 'manager'));

-- ---------------- PRODUCTS / PRODUCT LOTS ----------------
create policy "products_select_all"
  on public.products for select using (auth.role() = 'authenticated');

create policy "products_write_owner_manager"
  on public.products for all
  using (public.current_employee_role() in ('owner', 'manager'))
  with check (public.current_employee_role() in ('owner', 'manager'));

-- staff เพิ่ม "สินค้าที่ผลิต" ของแผนกตัวเองได้เอง (บันทึกล็อตผลิตได้โดยไม่ต้องรอผู้จัดการ/เจ้าของร้าน) —
-- จำกัดให้เพิ่มได้เฉพาะ station_id ของตัวเองเท่านั้น แก้ไข/ลบสินค้ายังคงเป็นสิทธิ์ owner/manager เท่านั้น (ตาม policy ด้านบน)
create policy "products_insert_staff_own_station"
  on public.products for insert
  with check (
    public.current_employee_role() = 'staff'
    and station_id = public.current_employee_station_id()
  );

create policy "product_lots_select_all"
  on public.product_lots for select using (auth.role() = 'authenticated');

create policy "product_lots_insert_staff_up"
  on public.product_lots for insert
  with check (public.current_employee_role() in ('owner', 'manager', 'staff'));

create policy "product_lots_update_staff_up"
  on public.product_lots for update
  using (public.current_employee_role() in ('owner', 'manager', 'staff'));
-- หมายเหตุ: ไม่มี policy DELETE ให้ใคร -> ห้ามลบล็อตสินค้า (สอดคล้องสเปก "ห้ามลบหรือเขียนทับข้อมูลเดิม")

-- ---------------- PURCHASE REQUESTS ----------------
create policy "pr_select_all"
  on public.purchase_requests for select using (auth.role() = 'authenticated');

create policy "pr_insert_staff_up"
  on public.purchase_requests for insert
  with check (public.current_employee_role() in ('owner', 'manager', 'staff'));

-- staff แก้ไขได้เฉพาะตอนยัง pending และเป็นรายการของตัวเอง (เช่น แก้จำนวน/ยกเลิกก่อนอนุมัติ)
create policy "pr_update_own_pending_staff"
  on public.purchase_requests for update
  using (
    public.current_employee_role() = 'staff'
    and requested_by = public.current_employee_id()
    and status = 'pending'
  );

-- owner/manager แก้ไขสถานะได้ทุกกรณี (อนุมัติ/สั่งซื้อ/รับสินค้า/ยกเลิก)
create policy "pr_update_owner_manager"
  on public.purchase_requests for update
  using (public.current_employee_role() in ('owner', 'manager'));

-- ---------------- SUPPLIERS ----------------
create policy "suppliers_select_all"
  on public.suppliers for select using (auth.role() = 'authenticated');

create policy "suppliers_write_owner_manager"
  on public.suppliers for all
  using (public.current_employee_role() in ('owner', 'manager'))
  with check (public.current_employee_role() in ('owner', 'manager'));

-- ---------------- SUPPLIER ITEM PRICES (ประวัติราคา — append-only) ----------------
create policy "supplier_item_prices_select_all"
  on public.supplier_item_prices for select using (auth.role() = 'authenticated');

create policy "supplier_item_prices_insert_owner_manager"
  on public.supplier_item_prices for insert
  with check (public.current_employee_role() in ('owner', 'manager'));
-- ไม่มี policy UPDATE/DELETE — ราคาเป็นประวัติ ห้ามแก้ไข/ลบ ต้องเพิ่มแถวใหม่เมื่อราคาเปลี่ยนเท่านั้น

-- ---------------- PURCHASE ORDERS ----------------
-- เปิดให้พนักงานทุกคน (ไม่ใช่แค่ owner/manager) สร้างใบสั่งซื้อได้เองจากหน้า "สั่งสินค้า" — แต่การเปลี่ยนสถานะ
-- (ส่ง/ยืนยัน/รับสินค้า/ยกเลิก) ยังคงจำกัดไว้เฉพาะ owner/manager เหมือนเดิม จึงแยก insert ออกจาก update/delete
create policy "purchase_orders_select_all"
  on public.purchase_orders for select using (auth.role() = 'authenticated');

create policy "purchase_orders_insert_any_staff"
  on public.purchase_orders for insert
  with check (public.current_employee_role() in ('owner', 'manager', 'staff'));

create policy "purchase_orders_update_owner_manager"
  on public.purchase_orders for update
  using (public.current_employee_role() in ('owner', 'manager'))
  with check (public.current_employee_role() in ('owner', 'manager'));

create policy "purchase_orders_delete_owner_manager"
  on public.purchase_orders for delete
  using (public.current_employee_role() in ('owner', 'manager'));

-- ---------------- PURCHASE ORDER ITEMS ----------------
create policy "purchase_order_items_select_all"
  on public.purchase_order_items for select using (auth.role() = 'authenticated');

create policy "purchase_order_items_insert_any_staff"
  on public.purchase_order_items for insert
  with check (public.current_employee_role() in ('owner', 'manager', 'staff'));

create policy "purchase_order_items_update_owner_manager"
  on public.purchase_order_items for update
  using (public.current_employee_role() in ('owner', 'manager'))
  with check (public.current_employee_role() in ('owner', 'manager'));

create policy "purchase_order_items_delete_owner_manager"
  on public.purchase_order_items for delete
  using (public.current_employee_role() in ('owner', 'manager'));

-- ---------------- CASH REPORTS (รายงานเงินสดปิดร้าน — เห็น/บันทึกได้เฉพาะ owner/manager, append-only) ----------------
create policy "cash_reports_select_owner"
  on public.cash_reports for select
  -- สรุปการเงิน/รายงานเงินสด: เจ้าของร้านเท่านั้น (ผู้จัดการทำได้ทุกอย่างยกเว้นส่วนนี้)
  using (public.current_employee_role() = 'owner');

create policy "cash_reports_insert_owner"
  on public.cash_reports for insert
  with check (public.current_employee_role() = 'owner');
-- ไม่มี policy UPDATE/DELETE — รายงานเงินสดเป็นประวัติ ห้ามแก้ไข/ลบ ต้องบันทึกใหม่เท่านั้น

-- ---------------- STORE HOLIDAYS (วันหยุดร้าน) ----------------
create policy "store_holidays_select_all"
  on public.store_holidays for select using (auth.role() = 'authenticated');

create policy "store_holidays_write_owner_manager"
  on public.store_holidays for all
  using (public.current_employee_role() in ('owner', 'manager'))
  with check (public.current_employee_role() in ('owner', 'manager'));

-- ---------------- NOTIFICATIONS ----------------
create policy "notifications_select_all"
  on public.notifications for select using (auth.role() = 'authenticated');

-- การเขียนแจ้งเตือนควรทำผ่าน service role (Edge Function / database trigger) เท่านั้น
-- จึงไม่เปิด policy insert/update/delete ให้ authenticated role ทั่วไป

create policy "notification_reads_select_own"
  on public.notification_reads for select
  using (employee_id = public.current_employee_id());

create policy "notification_reads_insert_own"
  on public.notification_reads for insert
  with check (employee_id = public.current_employee_id());

-- ---------------- HISTORY LOGS (append-only) ----------------
create policy "history_select_all"
  on public.history_logs for select using (auth.role() = 'authenticated');

create policy "history_insert_staff_up"
  on public.history_logs for insert
  with check (public.current_employee_role() in ('owner', 'manager', 'staff'));

-- ไม่มี policy UPDATE / DELETE บนตารางนี้เลย
-- ผลลัพธ์: แม้แต่ Owner ก็ไม่สามารถแก้ไข/ลบผ่าน client ได้ (ต้องทำผ่าน service_role/DB ตรง ๆ เท่านั้น)
-- นี่คือกลไกหลักที่ตอบข้อกำหนด #15 "ป้องกันพนักงานแก้ไขหรือลบประวัติย้อนหลังโดยไม่มีสิทธิ์"

-- ---------------- APP SETTINGS ----------------
create policy "settings_select_all"
  on public.app_settings for select using (auth.role() = 'authenticated');

create policy "settings_update_owner_only"
  on public.app_settings for update
  using (public.current_employee_role() = 'owner');

-- ---------------- ORDER DRAFT PICKS (ติ๊กเลือกสินค้าแบบเรียลไทม์ที่หน้า "สั่งสินค้า" ก่อนบันทึกสั่งซื้อจริง) ----------------
-- ทุกคนอ่านได้ทุกแถว (ต้องเห็นของคนอื่นด้วยเพื่อประสานงาน ไม่ใช่แค่ของตัวเอง)
create policy "order_draft_picks_select_all"
  on public.order_draft_picks for select using (auth.role() = 'authenticated');

-- เขียน/แก้ไข/ลบได้เฉพาะแถวของตัวเอง (แก้ไขของคนอื่นไม่ได้)
create policy "order_draft_picks_insert_own"
  on public.order_draft_picks for insert
  with check (employee_id = public.current_employee_id());

create policy "order_draft_picks_update_own"
  on public.order_draft_picks for update
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

create policy "order_draft_picks_delete_own"
  on public.order_draft_picks for delete
  using (employee_id = public.current_employee_id());

-- ============================================================================
-- ORDER_REMINDERS (การ์ดแจ้งเตือนให้สั่งสินค้า) -- เพิ่มภายหลัง สร้างผ่าน SQL editor
-- ทุกคนอ่านได้, owner/manager ส่งได้, สถานี/manager ยืนยันได้, ทุกคนลบได้
-- ============================================================================
alter table public.order_reminders enable row level security;

create policy "order_reminders_select_all"
  on public.order_reminders for select
  using (auth.role() = 'authenticated');

create policy "order_reminders_insert_all_roles"
  on public.order_reminders for insert
  -- ทุกตำแหน่งส่งแจ้งเตือนให้แผนกไหนก็ได้ (owner/manager/staff)
  with check (public.current_employee_role() in ('owner', 'manager', 'staff'));

create policy "order_reminders_update_station_or_manager"
  on public.order_reminders for update
  using (
    public.current_employee_role() = ANY (ARRAY['owner'::text, 'manager'::text])
    or station_id = (select station_id from public.employees where employees.id = public.current_employee_id())
  );

create policy "order_reminders_delete_all"
  on public.order_reminders for delete
  using (public.current_employee_role() in ('owner', 'manager', 'staff'));

-- ============================================================================
-- STORAGE BUCKETS (รูปภาพ) — รันใน SQL editor เช่นกัน หรือสร้างผ่าน Dashboard > Storage
-- ============================================================================
-- insert into storage.buckets (id, name, public) values
--   ('checklist-photos', 'checklist-photos', true),
--   ('production-photos', 'production-photos', true),
--   ('purchase-photos', 'purchase-photos', true)
-- on conflict (id) do nothing;
--
-- create policy "photos_public_read" on storage.objects for select using (bucket_id in ('checklist-photos','production-photos','purchase-photos'));
-- create policy "photos_authenticated_upload" on storage.objects for insert
--   with check (bucket_id in ('checklist-photos','production-photos','purchase-photos') and auth.role() = 'authenticated');
