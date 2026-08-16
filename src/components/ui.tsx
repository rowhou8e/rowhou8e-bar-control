'use client';

import type { Role } from '@/lib/types';

export function EmptyState({ icon = '🗒️', title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
      <div className="mb-2 text-3xl">{icon}</div>
      <p className="font-semibold text-gray-700">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-bold text-gray-700">{children}</h2>
      {action}
    </div>
  );
}

export function RoleGate({ role, allow, children }: { role: Role | undefined; allow: Role[]; children: React.ReactNode }) {
  if (!role || !allow.includes(role)) return null;
  return <>{children}</>;
}

/** จำลองการแนบรูปภาพ — prototype: บันทึกเป็น data URL ในเบราว์เซอร์เท่านั้น
 *  production: อัปโหลดขึ้น Supabase Storage bucket "checklist-photos" / "production-photos" แล้วเก็บ URL จริง (ดู README) */
export function PhotoAttach({
  value,
  onChange,
  label = 'แนบรูปภาพ',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}) {
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  if (value) {
    return (
      <div className="relative inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="แนบรูป" className="h-20 w-20 rounded-xl object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs text-white"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 active:bg-gray-50">
      <span className="text-xl">📷</span>
      <span className="text-[10px]">{label}</span>
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </label>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl bg-brand-600 py-3.5 text-center text-base font-bold text-white shadow-sm active:bg-brand-700 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border border-gray-200 bg-white py-3.5 text-center text-base font-semibold text-gray-700 active:bg-gray-50 ${className}`}
    >
      {children}
    </button>
  );
}
