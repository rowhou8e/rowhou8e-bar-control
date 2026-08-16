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
    cachedClient = createClient<any, any, any>(supabaseUrl!, supabaseAnonKey!);
  }
  return cachedClient;
}

export function getDataMode(): 'mock' | 'supabase' {
  const mode = process.env.NEXT_PUBLIC_DATA_MODE;
  if (mode === 'supabase' && isSupabaseConfigured()) return 'supabase';
  return 'mock';
}
