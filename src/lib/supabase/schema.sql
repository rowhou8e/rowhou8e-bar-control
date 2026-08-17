-- ============================================================================
-- Panday Bar Control — Supabase (PostgreSQL) Schema
-- ============================================================================
-- วิธีใช้:
--   1. สร้างโปรเจกต์ใหม่ที่ https://supabase.com
--   2. เปิด SQL Editor > New query > วางไฟล์นี้ทั้งหมด > Run
--   3. รันไฟล์ seed.sql ต่อ (ถ้าต้องการข้อมูลตัวอย่างภาษาไทย)
--   4. คัดลอก Project URL และ anon key ไปใส่ใน .env.local (ดู .env.example)
-- ============================================================================

create extension if not exists "pgcrypto"; -- สำหรับ gen_random_uuid()

-- ============================================================================
-- 0) STATIONS — แผนกแต่ละแผนกในร้าน (ครัวขนม/ครัวผลิตขนมปัง/ครัวบาร์น้ำ/ครัวจิปาถะ ฯลฯ)
--    แต่ละแผนกทำเช็กลิสต์แยกกัน — ชื่อตาราง/คอลัมน์ยังใช้ "station" ตามของเดิมในโค้ด
--    (แค่ชื่อภายใน ไม่กระทบการทำงาน — หน้าจอแสดงเป็น "แผนก" เสมอ)
-- ============================================================================
create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  -- false = แผนกไม่มีระบบผลิต ใช้เฉพาะสต๊อก/การสั่งซื้อ (เช่น ครัวจิปาถะ ตามสเปก Panday OPS §3)
  has_production boolean not null default true
);

-- ============================================================================
-- 1) EMPLOYEES — พนักงาน (เชื่อมกับ Supabase Auth ผ่าน auth_user_id)
-- ============================================================================
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  nickname text not null,
  role text not null check (role in ('owner', 'manager', 'staff')),
  avatar_color text not null default '#EA580C',
  station_id uuid references public.stations (id) on delete set null, -- บาร์ที่ประจำ — null สำหรับ owner/manager หรือพนักงานที่ทำได้ทุกบาร์
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- อุปกรณ์/เวลาล็อกอินล่าสุด — เก็บแค่ครั้งล่าสุดครั้งเดียว (ไม่ใช่ประวัติ) — เฟส 4, อัปเดตผ่าน record_login() เท่านั้น
  last_login_at timestamptz,
  last_login_device text
);

comment on table public.employees is 'พนักงานร้าน — production ควรผูกกับ auth.users ผ่าน auth_user_id แทนการใช้ PIN แบบ prototype';

-- ============================================================================
-- 2) STOCK — หมวดหมู่และวัตถุดิบ/สต๊อก
-- ============================================================================
create table if not exists public.stock_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references public.stock_categories (id) on delete set null,
  quantity numeric not null default 0,
  unit text not null,
  min_quantity numeric not null default 0,
  par_quantity numeric not null default 0,
  expiry_date date,
  status text not null default 'normal'
    check (status in ('normal', 'low', 'out', 'near_expiry', 'expired', 'unusable')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees (id),
  -- active=false = "ลบ" ออกจากรายการวัตถุดิบ (soft-delete) — ใช้แทนการ DELETE จริง เพราะ
  -- purchase_requests.stock_item_id อ้างอิงแถวนี้อยู่ (ไม่มี on delete cascade) ลบตรง ๆ อาจชน foreign key
  active boolean not null default true
);

create index if not exists idx_stock_items_status on public.stock_items (status);
create index if not exists idx_stock_items_category on public.stock_items (category_id);
create index if not exists idx_stock_items_active on public.stock_items (active);

-- ============================================================================
-- 3) CHECKLIST — เทมเพลตเช็กลิสต์ + การทำเช็กลิสต์ประจำวัน (แยกต่อบาร์)
-- ============================================================================
create table if not exists public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations (id) on delete cascade, -- แต่ละบาร์มีรายการเช็กลิสต์เป็นของตัวเอง
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true
);

create index if not exists idx_checklist_template_station on public.checklist_template_items (station_id);

create table if not exists public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations (id) on delete cascade,
  run_date date not null,
  submitted_at timestamptz,
  submitted_by uuid references public.employees (id),
  is_complete boolean not null default false,
  unique (run_date, station_id) -- หนึ่งบาร์ทำเช็กลิสต์ได้หนึ่งครั้งต่อวัน
);

-- ทำเช็กลิสต์ย้อนหลังได้เฉพาะ manager/owner (ดู RLS) — บันทึกเหตุผลไว้เสมอ
alter table public.checklist_runs add column if not exists backdated boolean not null default false;
alter table public.checklist_runs add column if not exists backdated_reason text; -- บังคับกรอกเมื่อ backdated = true (บังคับที่ชั้นแอป)

create table if not exists public.checklist_entry_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.checklist_runs (id) on delete cascade,
  template_item_id uuid references public.checklist_template_items (id),
  label text not null,
  -- ครบ 9 สถานะตามสเปก Panday OPS §7 — expired/unusable/production_failed บังคับถ่ายรูป+เหตุผล+จำนวนที่ชั้นแอป
  status text not null
    check (status in ('normal', 'near_expiry', 'used_up', 'unusable', 'expired', 'banned', 'discarded', 'refilled', 'production_failed')),
  note text not null default '',
  photo_url text,
  quantity numeric
);

create index if not exists idx_checklist_entry_run on public.checklist_entry_items (run_id);

-- ============================================================================
-- 4) PRODUCTS + PRODUCT LOTS — สินค้าที่แต่ละแผนกผลิต + ล็อตการผลิต (FIFO/FEFO)
--    แทนที่ milk_batches เดิม (เฉพาะนมต้ม) ด้วยระบบล็อตสินค้าที่ใช้ได้ทุกแผนกที่มีการผลิต
-- ============================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations (id) on delete cascade,
  name text not null,
  unit text not null default 'ชิ้น',
  shelf_life_days int not null default 3,
  active boolean not null default true
);

create index if not exists idx_products_station on public.products (station_id);

-- ล็อตสินค้า (ห้ามลบ/เขียนทับ ต้องสร้างล็อตใหม่เสมอ — ดู RLS)
create table if not exists public.product_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  lot_number text not null unique,
  produced_date date not null,
  produced_time time not null,
  quantity numeric not null,
  unit text not null,
  produced_by uuid references public.employees (id),
  shelf_life_days int not null,
  expires_at timestamptz not null,
  note text not null default '',
  photo_url text,
  status text not null default 'active'
    check (status in ('active', 'near_expiry', 'expired', 'used_up', 'discarded')),
  used_up_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_lots_status on public.product_lots (status);
create index if not exists idx_product_lots_expires on public.product_lots (expires_at);
create index if not exists idx_product_lots_product on public.product_lots (product_id);

-- ============================================================================
-- 5) PURCHASE REQUESTS — รายการเสนอซื้อ
-- ============================================================================
create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid references public.stock_items (id),
  item_name text not null,
  current_quantity numeric not null default 0,
  requested_quantity numeric not null,
  unit text not null,
  reason text not null default '',
  needed_by date,
  requested_by uuid references public.employees (id),
  photo_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'ordered', 'received', 'cancelled')),
  approved_by uuid references public.employees (id),
  approved_at timestamptz,
  received_at timestamptz,
  auto_generated boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_pr_status on public.purchase_requests (status);

-- ============================================================================
-- 5b) SUPPLIERS + SUPPLIER ITEM PRICES + PURCHASE ORDERS — เฟส 2
--     purchase_requests (ด้านบน) = รายการ "เสนอซื้อ" ของพนักงาน/ระบบอัตโนมัติ
--     purchase_orders = ใบสั่งซื้อจริงที่ส่งให้ผู้ขาย แปลงมาจาก purchase_requests ที่อนุมัติแล้ว
--     โดยรวม (auto-merge) รายการจากผู้ขายเดียวกัน+วันเดียวกันเป็นใบเดียว
-- ============================================================================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text not null default '',
  phone text not null default '',
  address text not null default '',
  note text not null default '',
  active boolean not null default true
);

-- ผู้ขายที่กำหนดไว้ล่วงหน้าต่อวัตถุดิบแต่ละชิ้น (เจ้าของ/ผู้จัดการกำหนดเองตอนสร้าง/แก้ไขรายการในหน้าตั้งค่า)
-- พนักงานเลือกผู้ขายเองตอนสั่งสินค้าไม่ได้อีกต่อไป — หน้า "สั่งสินค้า" ใช้ค่านี้โดยตรง (ต้องมาหลัง suppliers เพราะอ้างอิงถึง)
alter table public.stock_items add column if not exists supplier_id uuid references public.suppliers (id);

-- ประวัติราคาต่อวัตถุดิบต่อผู้ขาย (append-only ห้ามแก้ไข/ลบ — เพิ่มแถวใหม่เสมอเมื่อราคาเปลี่ยน)
-- รองรับวัตถุดิบชนิดเดียวกันซื้อได้จากหลายผู้ขาย และหน่วยที่ผู้ขายแต่ละรายขาย อาจต่างจาก unit หลักของวัตถุดิบ (เช่น ลัง/ขวด)
create table if not exists public.supplier_item_prices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  stock_item_id uuid not null references public.stock_items (id) on delete cascade,
  unit text not null,
  price numeric not null,
  note text not null default '',
  created_by uuid references public.employees (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_sip_supplier on public.supplier_item_prices (supplier_id);
create index if not exists idx_sip_stock_item on public.supplier_item_prices (stock_item_id);
create index if not exists idx_sip_created on public.supplier_item_prices (created_at desc);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  order_date date not null default current_date,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'confirmed', 'received', 'cancelled')),
  note text not null default '',
  created_by uuid references public.employees (id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz,
  received_by uuid references public.employees (id)
);

create index if not exists idx_po_supplier on public.purchase_orders (supplier_id);
create index if not exists idx_po_status on public.purchase_orders (status);
create index if not exists idx_po_date on public.purchase_orders (order_date);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  stock_item_id uuid references public.stock_items (id),
  item_name text not null,
  quantity numeric not null,
  unit text not null,
  unit_price numeric not null default 0,
  source_purchase_request_id uuid references public.purchase_requests (id)
);

create index if not exists idx_poi_po on public.purchase_order_items (purchase_order_id);
create index if not exists idx_poi_source_pr on public.purchase_order_items (source_purchase_request_id);

-- ============================================================================
-- 5c) CASH REPORTS — รายงานเงินสดปิดร้านประจำวัน (แบบง่าย) — เฟส 3
--     บันทึกได้เท่านั้น ห้ามแก้ไข/ลบ (append-only ดู RLS) — owner/manager เท่านั้นที่บันทึกได้
-- ============================================================================
create table if not exists public.cash_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null default current_date,
  closing_amount numeric not null,
  note text not null default '',
  submitted_by uuid references public.employees (id),
  submitted_at timestamptz not null default now()
);

create index if not exists idx_cash_reports_date on public.cash_reports (report_date desc);

-- ============================================================================
-- 5d) STORE HOLIDAYS — วันหยุดร้าน — เฟส 4
--     วันที่ระบุจะข้ามการแจ้งเตือน "ยังไม่ได้ทำเช็กลิสต์"/"เลยเวลา" และสรุปปิดร้าน
-- ============================================================================
create table if not exists public.store_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  label text not null default '',
  created_by uuid references public.employees (id),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 5e) ORDER DRAFT PICKS — รายการที่พนักงานกำลังติ๊กเลือกอยู่ที่หน้า "สั่งสินค้า" (ยังไม่ได้บันทึกสั่งซื้อจริง)
--     ใช้ให้พนักงานหลายคนที่เปิดหน้านี้พร้อมกันเห็นว่าใครติ๊กอะไรไว้บ้างแบบเรียลไทม์ ก่อนสรุปส่งจริง
--     1 แถวต่อ (พนักงาน, วัตถุดิบ) — ติ๊กใหม่/แก้จำนวน = upsert, ยกเลิกติ๊ก/บันทึกสั่งซื้อสำเร็จแล้ว = ลบแถว
--     เป็นสถานะชั่วคราวเพื่อประสานงานเท่านั้น ไม่ใช่ประวัติถาวร จึงไม่มี history_logs
-- ============================================================================
create table if not exists public.order_draft_picks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  stock_item_id uuid not null references public.stock_items (id) on delete cascade,
  quantity numeric not null,
  updated_at timestamptz not null default now(),
  unique (employee_id, stock_item_id)
);

create index if not exists idx_odp_stock_item on public.order_draft_picks (stock_item_id);
create index if not exists idx_odp_updated on public.order_draft_picks (updated_at desc);

-- ============================================================================
-- 6) NOTIFICATIONS — การแจ้งเตือน + สถานะอ่านแล้วรายคน
-- ============================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  severity text not null check (severity in ('info', 'review', 'urgent', 'blocked')),
  title text not null,
  message text not null,
  related_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_reads (
  notification_id uuid references public.notifications (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, employee_id)
);

-- ============================================================================
-- 7) HISTORY LOGS — ประวัติ/Audit log (append-only ห้ามแก้ไข/ลบ — ดู RLS ด้านล่าง)
-- ============================================================================
create table if not exists public.history_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null check (action_type in (
    'checklist_submit', 'production_log', 'lot_status_change', 'stock_adjust',
    'waste_report', 'purchase_create', 'purchase_approve', 'purchase_receive',
    'settings_change', 'supplier_change', 'po_create', 'po_status_change',
    'cash_report_submit', 'cash_report_edit', 'order_reminder_send', 'order_reminder_ack',
    'po_price_update'
  )),
  actor_id uuid references public.employees (id),
  target_label text not null,
  detail text not null default '',
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_history_created on public.history_logs (created_at desc);
create index if not exists idx_history_actor on public.history_logs (actor_id);
create index if not exists idx_history_type on public.history_logs (action_type);

-- ============================================================================
-- 8) SETTINGS — การตั้งค่าระบบ (แถวเดียว/singleton)
-- ============================================================================
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  checklist_start_time time not null default '07:00',
  checklist_due_time time not null default '10:00',
  milk_shelf_life_days int not null default 3,
  notify_lead_hours_before_expiry int not null default 4,
  low_stock_notify_enabled boolean not null default true,
  closing_time time not null default '20:00',
  closing_summary_enabled boolean not null default true
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================================
-- HELPER: หาบทบาทของผู้ใช้ที่ล็อกอินอยู่ (ใช้ใน RLS policies)
-- ============================================================================
create or replace function public.current_employee_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.employees where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_employee_station_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select station_id from public.employees where auth_user_id = auth.uid() limit 1;
$$;

-- ============================================================================
-- FUNCTION: บันทึกอุปกรณ์/เวลาล็อกอินล่าสุดของผู้ใช้ปัจจุบัน — เฟส 4
-- security definer เพื่อให้พนักงานทุกคนอัปเดต "แถวของตัวเอง" ได้ โดยไม่ต้องเปิด UPDATE
-- policy กว้าง ๆ บน employees (ซึ่งจำกัดไว้เฉพาะ owner ตาม RLS) — ฟังก์ชันนี้แก้ได้แค่
-- last_login_at/last_login_device ของแถวที่ auth_user_id ตรงกับผู้เรียกเท่านั้น
-- ============================================================================
create or replace function public.record_login(device text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employees
  set last_login_at = now(), last_login_device = device
  where auth_user_id = auth.uid();
end;
$$;

-- ============================================================================
-- TRIGGER: auto-update updated_at ของ stock_items
-- ============================================================================
create or replace function public.touch_stock_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stock_touch on public.stock_items;
create trigger trg_stock_touch
  before update on public.stock_items
  for each row execute function public.touch_stock_updated_at();

-- ============================================================================
-- 9) REALTIME — เปิด Postgres Changes ให้ตารางหลัก เพื่อให้ทุกหน้าจอที่เปิดค้างไว้
--    อัปเดตสดทันทีเมื่อมีคนอื่นบันทึกข้อมูล (เช็กลิสต์/สต๊อก/ใบสั่งซื้อ ฯลฯ) — เฟส 4
--    ใช้ DO block เพื่อให้รันซ้ำได้โดยไม่ error (publication ไม่มี "add table if not exists")
--    หมายเหตุ: cash_reports ไม่รวมในนี้ — ฝั่งแอปจะ subscribe เฉพาะ owner/manager เท่านั้น
--    เพื่อไม่ให้ยอดเงินสดหลุดไปถึง client ของพนักงานทั่วไปผ่าน realtime broadcast
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'stations', 'employees', 'stock_categories', 'stock_items',
    'checklist_template_items', 'checklist_runs', 'checklist_entry_items',
    'products', 'product_lots', 'purchase_requests', 'suppliers',
    'supplier_item_prices', 'purchase_orders', 'purchase_order_items',
    'store_holidays', 'order_draft_picks', 'history_logs', 'app_settings'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;

  -- cash_reports แยกต่างหาก เพิ่มเข้า publication เดียวกัน (แอปฝั่ง client เป็นคนกรอง subscribe เอง)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cash_reports'
  ) then
    execute 'alter publication supabase_realtime add table public.cash_reports';
  end if;
end $$;
