/**
 * API route — บอก commit SHA ของ build ที่กำลังรันอยู่จริงบนเซิร์ฟเวอร์ตอนนี้ (อ่านสด ไม่ cache)
 *
 * ใช้คู่กับ NEXT_PUBLIC_BUILD_SHA (ฝังไว้ใน client bundle ตอน build — ดู next.config.mjs) เพื่อให้
 * VersionWatcher (src/app/(app)/layout.tsx) ตรวจจับได้ว่าเบราว์เซอร์/PWA ของพนักงานยังรัน JS บันเดิลเก่า
 * ค้างอยู่ทั้งที่ deploy เวอร์ชันใหม่ไปแล้วหรือไม่ — กรณีที่พบว่าเป็นสาเหตุจริงของปัญหา "แก้บั๊กไปแล้วแต่
 * อาการเดิม": ถ้าเปิดแอปทิ้งไว้ (เช่น หน้าจอ PWA บนมือถือ) แล้วเปลี่ยนหน้าด้วย client-side navigation
 * (router.push/Link) ไปตลอด โดยไม่เคยโหลดหน้าใหม่แบบเต็มๆ เลย เบราว์เซอร์จะยังใช้ JS runtime ของ build
 * เก่าต่อไปเรื่อยๆ (Next.js โหลด chunk ของแต่ละ route ด้วย buildId ที่ฝังมาตอนโหลดหน้าแรก) แม้ Vercel
 * จะมี deployment ใหม่ขึ้น production ไปแล้วก็ตาม — ทำให้โค้ดที่แก้บั๊กไปแล้วไม่มีผลกับเครื่องนั้นเลย
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA || '' },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
}
