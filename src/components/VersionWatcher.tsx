'use client';

import { useEffect, useState } from 'react';

/**
 * เช็กเป็นระยะว่าเบราว์เซอร์/PWA เครื่องนี้ยังรัน JS build เดียวกับที่ deploy อยู่บนเซิร์ฟเวอร์จริงหรือไม่
 * (ดูเหตุผลละเอียดที่คอมเมนต์ใน src/app/api/version/route.ts) — ถ้าเปิดแอปทิ้งไว้ข้ามการ deploy โดยไม่เคย
 * โหลดหน้าใหม่แบบเต็มๆ เลย (ใช้แต่ client-side navigation) บั๊กที่แก้ไปแล้วฝั่งโค้ดจะไม่มีผลกับเครื่องนั้น
 * จนกว่าจะโหลดใหม่ — ถ้าเจอว่าเวอร์ชันไม่ตรงกัน โชว์แบนเนอร์เล็กๆ ให้พนักงานกดโหลดใหม่เอง (ไม่ auto-reload
 * ทันที เพราะอาจกำลังกรอกฟอร์มอยู่ ข้อมูลที่ยังไม่บันทึกจะหาย)
 */
export function VersionWatcher() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const currentSha = process.env.NEXT_PUBLIC_BUILD_SHA;
    if (!currentSha) return; // รันในเครื่อง dev ไม่มีค่านี้ — ข้ามการเช็ก

    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data: { sha?: string } = await res.json();
        if (!cancelled && data.sha && data.sha !== currentSha) {
          setStale(true);
        }
      } catch {
        // เน็ตหลุดชั่วคราว/ออฟไลน์ — ไม่ต้องทำอะไร เดี๋ยวเช็กใหม่รอบถัดไป
      }
    }

    check();
    const interval = setInterval(check, 5 * 60 * 1000); // เช็กทุก 5 นาที
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-md">
      <span>มีแอปเวอร์ชันใหม่ กดเพื่อโหลดใหม่ (บั๊กที่แก้ล่าสุดจะยังไม่มีผลจนกว่าจะโหลดใหม่)</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-md bg-white px-3 py-1 font-bold text-amber-600"
      >
        โหลดใหม่
      </button>
    </div>
  );
}
