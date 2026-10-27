/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  // ฝัง commit SHA ของ build นี้เข้าไปใน client bundle ตอน build (Vercel เซ็ต VERCEL_GIT_COMMIT_SHA ให้
  // อัตโนมัติ) — ใช้เทียบกับ /api/version (อ่านค่าเดียวกันนี้จากฝั่งเซิร์ฟเวอร์ตอน request จริง ไม่ cache)
  // เพื่อตรวจจับเวลาที่เบราว์เซอร์/PWA ยังรัน JS บันเดิลเก่าค้างอยู่ทั้งที่ deploy ใหม่ไปแล้ว (ดู VersionWatcher
  // ใน src/app/(app)/layout.tsx) — ถ้าเปิดแอปทิ้งไว้ข้ามการ deploy โดยไม่รีเฟรชเต็มหน้าเลย Next.js จะยังใช้
  // webpack runtime เก่าในการโหลด chunk ของ route ใหม่ๆ ต่อไปเรื่อยๆ ซึ่งอาจมีบั๊กที่แก้ไปแล้วติดอยู่
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '',
  },
};

export default nextConfig;
