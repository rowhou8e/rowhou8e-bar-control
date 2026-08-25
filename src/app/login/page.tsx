'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/use-store';
import { store } from '@/lib/store';
import { getDataMode } from '@/lib/supabase/client';
import { roleLabel } from '@/lib/derive';
import type { Employee } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const { employees, session, initializing } = useAppState();
  const isLive = getDataMode() === 'supabase';

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      router.replace('/reset-password' + window.location.hash);
      return;
    }
    if (!initializing && session) router.replace('/dashboard');
  }, [initializing, session, router]);

  if (isLive) {
    return <LiveLoginForm />;
  }

  return <MockPinLogin employees={employees} />;
}

/**
 * ล็อกอินด้วยอีเมล + รหัสผ่านจริง ผ่าน Supabase Auth (ใช้เมื่อ NEXT_PUBLIC_DATA_MODE=supabase)
 */
function LiveLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      const result = await store.login(email, password);
      if (!result.ok) {
        setError(result.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
      } else {
        router.replace('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-app flex-col bg-white px-6 pb-10 pt-16">
      <div className="mb-10 flex flex-col items-center">
        <img src="/logo.png" alt="Rowhouse" className="h-16 w-16 rounded-2xl object-cover" />
        <h1 className="mt-4 text-xl font-bold text-gray-900">Rowhou8e Bar Control</h1>
        <p className="mt-1 text-sm text-gray-500">เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">อีเมล</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-brand-600"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">รหัสผ่าน</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-brand-600"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-60"
        >
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-gray-400">
        ระบบสำหรับใช้งานภายในร้านเท่านั้น · v0.1 Prototype
      </p>
    </div>
  );
}

/**
 * ล็อกอินด้วยการเลือกชื่อ + PIN 4 หลัก (ใช้เมื่อยังไม่ได้ต่อ Supabase — ข้อมูลจำลอง)
 */
function MockPinLogin({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function handleDigit(d: string) {
    if (pin.length >= 4) return;
    setError('');
    const next = pin + d;
    setPin(next);
    if (next.length === 4 && selected) {
      const result = store.login(selected.id, next);
      if (result instanceof Promise) return; // ไม่ควรเกิดในโหมด mock แต่กันไว้เผื่อ type แปลกใจ
      if (!result.ok) {
        setError(result.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
        setTimeout(() => setPin(''), 400);
      } else {
        router.replace('/dashboard');
      }
    }
  }

  if (selected) {
    return (
      <div className="mx-auto flex min-h-screen max-w-app flex-col bg-white px-6 pb-10 pt-14">
        <button
          onClick={() => {
            setSelected(null);
            setPin('');
            setError('');
          }}
          className="mb-6 flex items-center gap-1 text-sm text-gray-500"
        >
          ← กลับ
        </button>
        <div className="flex flex-col items-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ backgroundColor: selected.avatarColor }}
          >
            {selected.nickname.slice(0, 2)}
          </div>
          <p className="mt-3 text-lg font-semibold text-gray-900">{selected.name}</p>
          <p className="text-sm text-gray-500">{roleLabel(selected.role)}</p>
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">กรอกรหัส PIN 4 หลัก</p>
        <div className="mt-4 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 ${
                i < pin.length ? 'border-brand-600 bg-brand-600' : 'border-gray-300'
              }`}
            />
          ))}
        </div>
        {error && <p className="mt-3 text-center text-sm font-medium text-status-danger">{error}</p>}

        <div className="mt-10 grid grid-cols-3 gap-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, idx) =>
            d === '' ? (
              <div key={idx} />
            ) : (
              <button
                key={idx}
                onClick={() => (d === '⌫' ? setPin((p) => p.slice(0, -1)) : handleDigit(d))}
                className="flex h-16 items-center justify-center rounded-2xl bg-gray-50 text-2xl font-semibold text-gray-800 active:bg-gray-200"
              >
                {d}
              </button>
            )
          )}
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">
          Demo PIN: {selected.pinCode} (ตัวอย่างสำหรับทดสอบระบบ)
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-app flex-col bg-white px-6 pb-10 pt-16">
      <div className="mb-10 flex flex-col items-center">
        <img src="/logo.png" alt="Rowhouse" className="h-16 w-16 rounded-2xl object-cover" />
        <h1 className="mt-4 text-xl font-bold text-gray-900">Rowhou8e Bar Control</h1>
        <p className="mt-1 text-sm text-gray-500">เลือกชื่อของคุณเพื่อเข้าสู่ระบบ</p>
      </div>

      <div className="flex flex-col gap-3">
        {employees
          .filter((e) => e.active)
          .map((emp) => (
            <button
              key={emp.id}
              onClick={() => setSelected(emp)}
              className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-card active:bg-gray-50"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                style={{ backgroundColor: emp.avatarColor }}
              >
                {emp.nickname.slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900">{emp.name}</p>
                <p className="text-xs text-gray-500">{emp.nickname}</p>
              </div>
              <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {roleLabel(emp.role)}
              </span>
            </button>
          ))}
      </div>

      <p className="mt-8 text-center text-xs text-gray-400">
        ระบบสำหรับใช้งานภายในร้านเท่านั้น · v0.1 Prototype
      </p>
    </div>
  );
}
