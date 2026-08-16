'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { store } from '@/lib/store';

type Phase = 'checking' | 'ready' | 'invalid' | 'success';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setPhase('invalid');
      return;
    }

    let active = true;
    const sb = getSupabaseClient();

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setPhase('ready');
      }
    });

    sb.auth.getSession().then(({ data }) => {
      if (active && data.session) setPhase('ready');
    });

    const timer = setTimeout(() => {
      setPhase((p) => (p === 'checking' ? 'invalid' : p));
    }, 5000);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (password !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setSubmitting(true);
    try {
      const sb = getSupabaseClient();
      const { error: updateError } = await sb.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ');
        return;
      }
      setPhase('success');
      try {
        await store.logout();
      } catch {
        // ignore — จะไปหน้า login ต่อไม่ว่า logout จะสำเร็จหรือไม่
      }
      setTimeout(() => router.replace('/login'), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-app flex-col bg-white px-6 pb-10 pt-16">
      <div className="mb-10 flex flex-col items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">
          P
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">Rowhou8e Bar Control</h1>
        <p className="mt-1 text-sm text-gray-500">ตั้งรหัสผ่านใหม่</p>
      </div>

      {phase === 'checking' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-gray-500">กำลังตรวจสอบลิงก์รีเซ็ตรหัสผ่าน...</p>
        </div>
      )}

      {phase === 'invalid' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm font-medium text-status-danger">
            ลิงก์รีเซ็ตรหัสผ่านหมดอายุหรือไม่ถูกต้อง
          </p>
          <p className="text-sm text-gray-500">
            กรุณาขอลิงก์รีเซ็ตรหัสผ่านใหม่อีกครั้ง แล้วเปิดลิงก์จากอีเมลฉบับล่าสุด
          </p>
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="mt-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white active:bg-brand-700"
          >
            กลับไปหน้าเข้าสู่ระบบ
          </button>
        </div>
      )}

      {phase === 'success' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium text-status-ok">ตั้งรหัสผ่านใหม่สำเร็จ</p>
          <p className="text-sm text-gray-500">กำลังพาไปหน้าเข้าสู่ระบบ...</p>
        </div>
      )}

      {phase === 'ready' && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">รหัสผ่านใหม่</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-brand-600"
              placeholder="อย่างน้อย 6 ตัวอักษร"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-brand-600"
              placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
            />
          </div>
          {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่'}
          </button>
        </form>
      )}
    </div>
  );
}
