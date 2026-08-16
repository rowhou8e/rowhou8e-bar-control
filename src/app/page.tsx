'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/use-store';

export default function RootPage() {
  const router = useRouter();
  const { session } = useAppState();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      router.replace('/reset-password' + window.location.hash);
      return;
    }
    router.replace(session ? '/dashboard' : '/login');
  }, [session, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50">
      <div className="text-center">
        <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <p className="text-sm text-gray-500">กำลังโหลด Rowhou8e Bar Control...</p>
      </div>
    </div>
  );
}
