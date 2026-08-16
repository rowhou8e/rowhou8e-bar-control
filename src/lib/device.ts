'use client';

/**
 * ตรวจจับป้ายอุปกรณ์/เบราว์เซอร์แบบคร่าว ๆ จาก navigator.userAgent — ใช้บันทึก "ล็อกอินล่าสุดจากอุปกรณ์ไหน"
 * (เก็บแค่ครั้งล่าสุดครั้งเดียวต่อพนักงาน ไม่ใช่ประวัติเต็ม — ดู Employee.lastLoginDevice) — เฟส 4
 * ไม่แม่นยำระดับ fingerprint จริง แค่พอให้เจ้าของร้านรู้คร่าว ๆ ว่าใครล็อกอินจากอุปกรณ์ประเภทไหน
 */
export function detectDeviceLabel(): string | null {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return null;
  const ua = navigator.userAgent;

  let os = 'อุปกรณ์ไม่ทราบชนิด';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = '';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  return browser ? `${os} · ${browser}` : os;
}
