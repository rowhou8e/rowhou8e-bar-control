'use client';

import type { Role } from '@/lib/types';
import { useState } from 'react';
import { getDataMode } from '@/lib/supabase/client';
import { uploadPhoto } from '@/lib/supabase/queries';

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

/**
 * ย่อ/บีบอัดรูปก่อนอัปโหลด — จำกัดด้านยาวสุดไม่เกิน maxDim px แล้วแปลงเป็น JPEG คุณภาพ ~0.8
 * ลดขนาดไฟล์จากรูปถ่ายมือถือ (มักหลาย MB) ลงเหลือหลักสิบ-ร้อย KB เพื่อไม่ให้พื้นที่เก็บรูปบานในระยะยาว
 * ถ้าบีบอัดไม่สำเร็จ (เช่น browser ไม่รองรับ) จะคืนไฟล์ต้นฉบับแทน ไม่บล็อกการอัปโหลด
 */
async function compressImage(file: File, maxDim = 1024, quality = 0.8): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch (err) {
    console.error('compressImage failed, using original file', err);
    return file;
  }
}

/** แนบรูปภาพ – โหมด mock: เก็บเป็น data URL ในเบราว์เซอร์ / โหมด supabase: อัปโหลดขึ้น Supabase Storage bucket จริงแล้วเก็บ URL (ดู README)
 *  ทั้งสองโหมดบีบอัด/ย่อขนาดรูปก่อนเสมอ (ดู compressImage ด้านบน) */
export function PhotoAttach({
  value,
  onChange,
  label = 'แนบรูปภาพ',
  bucket,
  employeeId,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  bucket: 'checklist-photos' | 'production-photos' | 'purchase-photos' | 'employee-photos' | 'stock-photos';
  employeeId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    if (!rawFile) return;
    setUploadError(null);
    setUploading(true);
    try {
      const file = await compressImage(rawFile);

      if (getDataMode() === 'supabase') {
        const url = await uploadPhoto(bucket, file, employeeId);
        onChange(url);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => onChange(reader.result as string);
      reader.onerror = () => setUploadError('อ่านไฟล์รูปไม่สำเร็จ ลองใหม่อีกครั้ง');
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setUploadError('อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
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
    <div className="flex flex-col items-center gap-1">
      <label
        className={`flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 ${
          uploading ? 'cursor-wait opacity-60' : 'cursor-pointer active:bg-gray-50'
        }`}
      >
        <span className="text-xl">{uploading ? '⏳' : '📷'}</span>
        <span className="text-[10px]">{uploading ? 'กำลังอัปโหลด...' : label}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
          disabled={uploading}
        />
      </label>
      {uploadError && <p className="max-w-[80px] text-center text-[10px] text-red-500">{uploadError}</p>}
    </div>
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
