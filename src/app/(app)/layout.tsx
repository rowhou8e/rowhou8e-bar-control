'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/use-store';
import { BottomNav } from '@/components/BottomNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, initializing } = useAppState();

  useEffect(() => {
    // รอจนกว่าจะตรวจสอบสถานะล็อกอิน/โหลดข้อมูลเริ่มต้นเสร็จก่อน กัน flash ไป login ก่อนเวลา
    if (!initializing && session === null) {
      router.replace('/login');
    }
  }, [initializing, session, router]);

  if (initializing || session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-app bg-gray-50 pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
