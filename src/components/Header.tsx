'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { store } from '@/lib/store';
import { PhotoAttach } from '@/components/ui';
import { getDataMode } from '@/lib/supabase/client';
import { roleLabel } from '@/lib/derive';
import type { Employee } from '@/lib/types';

export function Header({
  title,
  subtitle,
  currentEmployee,
  onBack,
}: {
  title: string;
  subtitle?: string;
  currentEmployee: Employee | null;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [newPin, setNewPin] = useState('');
  const canChangeOwnPin = getDataMode() === 'mock'; // โหมด Supabase ใช้อีเมล/รหัสผ่านผ่าน Supabase Auth แทน PIN

  function closeMenu() {
    setMenuOpen(false);
    setPinMode(false);
    setNewPin('');
  }

  function handleSavePin() {
    if (!currentEmployee || newPin.length !== 4) return;
    store.updateEmployee(currentEmployee.id, { pinCode: newPin }, currentEmployee.id);
    closeMenu();
  }

  return (
    <header className="sticky top-0 z-20 mx-auto flex max-w-app items-center gap-3 border-b border-gray-100 bg-white/95 px-4 py-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur">
      {onBack && (
        <button onClick={onBack} className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full active:bg-gray-100">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
      </div>
      {currentEmployee && (
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white"
            style={currentEmployee.avatarUrl ? undefined : { backgroundColor: currentEmployee.avatarColor }}
          >
            {currentEmployee.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentEmployee.avatarUrl} alt={currentEmployee.nickname} className="h-full w-full object-cover" />
            ) : (
              currentEmployee.nickname.slice(0, 2)
            )}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={closeMenu} />
              <div className="absolute right-0 top-11 z-40 w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-card">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-semibold text-gray-900">{currentEmployee.name}</p>
                  <p className="text-xs text-gray-500">{roleLabel(currentEmployee.role)}</p>
                </div>
                <div className="my-1 h-px bg-gray-100" />
                <div className="px-2 py-1.5">
                  <PhotoAttach
                    value={currentEmployee.avatarUrl}
                    onChange={(url) => store.updateEmployee(currentEmployee.id, { avatarUrl: url }, currentEmployee.id)}
                    bucket="employee-photos"
                    employeeId={currentEmployee.id}
                    label="รูปโปรไฟล์"
                  />
                </div>
                <div className="my-1 h-px bg-gray-100" />
                {pinMode ? (
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-semibold text-gray-500">PIN ใหม่ (4 หลัก)</p>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      autoFocus
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-center text-sm tracking-[0.3em] outline-none focus:border-brand-400"
                    />
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        onClick={handleSavePin}
                        disabled={newPin.length !== 4}
                        className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                      >
                        บันทึก
                      </button>
                      <button
                        onClick={() => {
                          setPinMode(false);
                          setNewPin('');
                        }}
                        className="flex-1 rounded-lg bg-gray-100 py-1.5 text-xs font-semibold text-gray-500"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {canChangeOwnPin && (
                      <button
                        onClick={() => setPinMode(true)}
                        className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-gray-700 active:bg-gray-50"
                      >
                        เปลี่ยน PIN
                      </button>
                    )}
                    {currentEmployee.role === 'owner' && (
                      <button
                        onClick={() => {
                          closeMenu();
                          router.push('/settings');
                        }}
                        className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-gray-700 active:bg-gray-50"
                      >
                        ตั้งค่าระบบ
                      </button>
                    )}
                    <button
                      onClick={() => {
                        closeMenu();
                        store.logout();
                        router.replace('/login');
                      }}
                      className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-status-danger active:bg-red-50"
                    >
                      ออกจากระบบ
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
