/**
 * Supabase client (ฝั่ง browser) — ใช้ anon key เท่านั้น ห้ามใส่ service role key ที่นี่
 * ต้องตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน .env.local ก่อนใช้งาน
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * ต้นตอตัวจริงของบั๊ก "ใบสั่งซื้อโชว์ 0 รายการ" ที่ไล่แก้กันมาหลายรอบ (optimistic update,
 * atomic RPC, guard กันค่าว่างผิดปกติ ฯลฯ — ทุกอันช่วยบรรเทาแต่ไม่ได้แก้ที่ต้นตอ):
 *
 * PostgREST (REST API ของ Supabase) ไม่ได้ส่ง header `Cache-Control: no-store` กลับมาด้วย
 * ทุกครั้ง supabase-js เรียก fetch() แบบ GET ธรรมดา (ไม่ได้สั่ง cache: 'no-store' เอง) เบราว์เซอร์
 * จึงมีสิทธิ์ "แคช" คำตอบไว้ตาม URL เป๊ะๆ ได้ (แคชแบบ private ของเบราว์เซอร์ทำกับ request ที่มี
 * Authorization header ได้ปกติ ไม่เหมือนแคชแบบ shared/proxy) — ปัญหาคือ fetchPurchaseOrders()
 * ดึงรายการสินค้าด้วย `.in('purchase_order_id', orderIds)` ซึ่ง URL จะ "เหมือนเดิมทุกตัวอักษร"
 * ทุกครั้งที่ orderIds ชุดเดียวกัน (เช่น เพิ่ม/ลบแค่ "รายการสินค้าในใบสั่งซื้อเดิม" โดยไม่ได้สร้าง/ลบ
 * ใบสั่งซื้อใหม่) พอเบราว์เซอร์เจอ URL เดิมซ้ำ จะคืนคำตอบเก่าที่แคชไว้ (ก่อนรายการจะถูกเพิ่ม) แทนที่จะ
 * ยิง request ใหม่จริงๆ — ยืนยันแล้วด้วยการเทียบข้อมูลจริงในฐานข้อมูล (SQL ตรงๆ เห็น 9 รายการ) กับสิ่งที่
 * หน้าเว็บโหลดสดๆ ในเบราว์เซอร์จริงเห็น (0 รายการ) ของใบสั่งซื้อเดียวกันในเวลาเดียวกัน — อธิบายได้ครบทุก
 * อาการที่เจอมา: เห็นถูกต้องตอนเพิ่งบันทึก (optimistic update ไม่ผ่าน fetch), แล้ว "รีเซ็ตเป็น 0 เอง"
 * ตอนปิดแอป/สลับหน้าแล้วกลับมา (fetch รอบใหม่โดนแคชเก่าทับ), และทำไมใบสั่งซื้อเก่าที่ไม่ได้ถูกแก้ไข
 * ต่อถึงโชว์ถูกต้องเสมอ (ไม่เคยมีการแก้ไขให้ URL cache เพี้ยน)
 *
 * แก้โดยสั่งให้ทุก request ที่ยิงผ่าน client ตัวนี้ (ทั้ง REST และ Auth) ใช้ cache: 'no-store' เสมอ
 * ผ่าน global.fetch ที่ custom เอง — บังคับให้ยิงเน็ตใหม่จริงทุกครั้ง ไม่มีการอ่านจากแคชเบราว์เซอร์อีก
 */
function noStoreFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, cache: 'no-store' });
}

/**
 * สร้าง client แบบ lazy + singleton (สร้างครั้งเดียวแล้วใช้ซ้ำ) เพื่อไม่ให้แอปพังตอน build/dev
 * หากยังไม่ได้ตั้งค่า env และเพื่อให้ auth session / onAuthStateChange listener ทำงานถูกต้อง
 * (ถ้าสร้าง client ใหม่ทุกครั้งที่เรียก จะทำให้ listener หลุดและ session ไม่ sync)
 * (เวอร์ชัน prototype รันด้วย mock store เป็นค่าเริ่มต้น ไม่จำเป็นต้องมี Supabase client ก็ใช้งานได้)
 *
 * ระบุ generic เป็น <any, any, any> ตรง ๆ (แทนที่จะปล่อยให้ TS infer ค่า default) เพราะเราไม่ได้
 * generate type จาก schema จริง (Database type) — ถ้าปล่อย default จะทำให้ supabase-js เวอร์ชันใหม่
 * infer ผลลัพธ์ของ .from(...).select()/.insert()/.update() เป็น `never` แล้ว build พังทั้งไฟล์ queries.ts
 */
let cachedClient: SupabaseClient<any, any, any> | null = null;

export function getSupabaseClient(): SupabaseClient<any, any, any> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'ยังไม่ได้ตั้งค่า Supabase — กรุณาใส่ NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน .env.local'
    );
  }
  if (!cachedClient) {
    cachedClient = createClient<any, any, any>(supabaseUrl!, supabaseAnonKey!, {
      global: { fetch: noStoreFetch },
    });
  }
  return cachedClient;
}

export function getDataMode(): 'mock' | 'supabase' {
  const mode = process.env.NEXT_PUBLIC_DATA_MODE;
  if (mode === 'supabase' && isSupabaseConfigured()) return 'supabase';
  return 'mock';
}
