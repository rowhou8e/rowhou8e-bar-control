'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { useAppState, useCurrentEmployee } from '@/lib/use-store';
import { store } from '@/lib/store';
import { Header } from '@/components/Header';
import { PhotoAttach, PrimaryButton, SectionTitle } from '@/components/ui';
import { getDataMode } from '@/lib/supabase/client';
import { formatThaiDate, formatThaiDateTime, roleLabel } from '@/lib/derive';
import type { ChecklistItemFrequency, ChecklistTemplateItem, Product, Role, Station, StockCategory, StockItem, StoreHoliday, Supplier, SupplierItemPrice } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const employee = useCurrentEmployee();
  const {
    settings,
    employees,
    stockItems,
    stations,
    checklistTemplate,
    stockCategories,
    products,
    suppliers,
    supplierItemPrices,
    storeHolidays,
  } = useAppState();

  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [resetPinFor, setResetPinFor] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordSaving, setResetPasswordSaving] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [editingNameFor, setEditingNameFor] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [nicknameValue, setNicknameValue] = useState('');
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpNickname, setNewEmpNickname] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<Role>('staff');
  const [newEmpStationId, setNewEmpStationId] = useState('');
  const [newEmpStationIds, setNewEmpStationIds] = useState<string[]>([]);
  const [newEmpPin, setNewEmpPin] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [addEmpSaving, setAddEmpSaving] = useState(false);
  const [addEmpError, setAddEmpError] = useState('');
  const isMockMode = getDataMode() === 'mock'; // รีเซ็ต PIN ใช้ได้เฉพาะโหมด mock — โหมด Supabase ใช้อีเมล/รหัสผ่านแทน

  const isOwner = employee?.role === 'owner';
  const canManageCatalog = employee?.role === 'owner' || employee?.role === 'manager';

  if (employee && !canManageCatalog) {
    return (
      <div>
        <Header title="ตั้งค่าระบบ" currentEmployee={employee} onBack={() => router.back()} />
        <main className="px-4 py-10 text-center">
          <p className="text-4xl">🔒</p>
          <p className="mt-3 text-sm font-semibold text-gray-700">หน้านี้สำหรับเจ้าของร้านและผู้จัดการเท่านั้น</p>
          <p className="mt-1 text-xs text-gray-400">ติดต่อเจ้าของร้าน/ผู้จัดการหากต้องการเปลี่ยนแปลงการตั้งค่า</p>
        </main>
      </div>
    );
  }

  function handleSave() {
    if (!employee) return;
    store.updateSettings(form, employee.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function resetAddEmployeeForm() {
    setNewEmpName('');
    setNewEmpNickname('');
    setNewEmpRole('staff');
    setNewEmpStationId('');
    setNewEmpStationIds([]);
    setNewEmpPin('');
    setNewEmpEmail('');
    setNewEmpPassword('');
    setAddEmpError('');
  }

  async function handleAddEmployee() {
    if (!employee) return;
    if (!newEmpName.trim() || !newEmpNickname.trim()) {
      setAddEmpError('กรอกชื่อและชื่อเล่นให้ครบ');
      return;
    }
    if (isMockMode && newEmpPin.length !== 4) {
      setAddEmpError('กรอกรหัส PIN 4 หลัก');
      return;
    }
    if (!isMockMode && (!newEmpEmail.trim() || newEmpPassword.length < 6)) {
      setAddEmpError('กรอกอีเมลและรหัสผ่าน (อย่างน้อย 6 ตัวอักษร)');
      return;
    }
    setAddEmpError('');
    setAddEmpSaving(true);
    try {
      await store.createEmployee({
        name: newEmpName.trim(),
        nickname: newEmpNickname.trim(),
        role: newEmpRole,
        stationId: newEmpStationId || null,
        stationIds: newEmpStationIds,
        pinCode: newEmpPin,
        email: newEmpEmail.trim(),
        password: newEmpPassword,
        actorId: employee.id,
      });
      resetAddEmployeeForm();
      setShowAddEmployee(false);
    } catch (err) {
      setAddEmpError(err instanceof Error ? err.message : 'เพิ่มพนักงานไม่สำเร็จ');
    } finally {
      setAddEmpSaving(false);
    }
  }

  return (
    <div>
      <Header
        title="ตั้งค่าระบบ"
        subtitle={isOwner ? 'เจ้าของร้าน' : 'ผู้จัดการ'}
        currentEmployee={employee}
        onBack={() => router.back()}
      />
      <main className="space-y-5 px-4 py-4">
        {isOwner && (
          <>
            <section className="rounded-2xl bg-white p-4 shadow-card">
              <SectionTitle>เวลาเช็กลิสต์</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">เวลาเริ่มเช็กลิสต์</label>
                  <input
                    type="time"
                    value={form.checklistStartTime}
                    onChange={(e) => setForm((f) => ({ ...f, checklistStartTime: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">เวลาสุดท้ายที่ต้องทำ</label>
                  <input
                    type="time"
                    value={form.checklistDueTime}
                    onChange={(e) => setForm((f) => ({ ...f, checklistDueTime: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
                  />
                </div>
              </div>
            </section>

            <PrimaryButton onClick={handleSave}>{saved ? '✓ บันทึกแล้ว' : 'บันทึกการตั้งค่า'}</PrimaryButton>

            <section className="rounded-2xl bg-white p-4 shadow-card">
              <div className="flex items-center justify-between">
                <SectionTitle>รายชื่อพนักงาน สิทธิ์ผู้ใช้ และแผนกที่ประจำ</SectionTitle>
                <button
                  onClick={() => {
                    setShowAddEmployee((v) => !v);
                    if (showAddEmployee) resetAddEmployeeForm();
                  }}
                  className="mb-3 text-[11px] font-semibold text-brand-600"
                >
                  {showAddEmployee ? 'ยกเลิก' : '+ เพิ่มพนักงาน'}
                </button>
              </div>

              {showAddEmployee && (
                <div className="mb-3 space-y-1.5 rounded-xl bg-gray-50 p-2.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      placeholder="ชื่อ-นามสกุล"
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
                    />
                    <input
                      value={newEmpNickname}
                      onChange={(e) => setNewEmpNickname(e.target.value)}
                      placeholder="ชื่อเล่น"
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={newEmpRole}
                      onChange={(e) => setNewEmpRole(e.target.value as Role)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none"
                    >
                      <option value="owner">{roleLabel('owner')}</option>
                      <option value="manager">{roleLabel('manager')}</option>
                      <option value="staff">{roleLabel('staff')}</option>
                    </select>
                    <div className="col-span-2 space-y-1 rounded-lg border border-gray-200 bg-white p-2.5">
                      <p className="text-[11px] font-medium text-gray-500">แผนกที่เข้าถึงได้ (เลือกได้หลายแผนก)</p>
                      <div className="flex flex-wrap gap-2">
                        {stations
                          .filter((s) => s.active)
                          .map((s) => (
                            <label key={s.id} className="flex items-center gap-1 text-[11px]">
                              <input
                                type="checkbox"
                                checked={newEmpStationIds.includes(s.id)}
                                onChange={(e) =>
                                  setNewEmpStationIds((prev) =>
                                    e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                                  )
                                }
                              />
                              {s.name}
                            </label>
                          ))}
                      </div>
                    </div>
                  </div>

                  {isMockMode ? (
                    <input
                      inputMode="numeric"
                      maxLength={4}
                      value={newEmpPin}
                      onChange={(e) => setNewEmpPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="รหัส PIN 4 หลัก (สำหรับล็อกอิน)"
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs tracking-[0.2em] outline-none focus:border-brand-400"
                    />
                  ) : (
                    <>
                      <input
                        type="email"
                        value={newEmpEmail}
                        onChange={(e) => setNewEmpEmail(e.target.value)}
                        placeholder="อีเมลสำหรับล็อกอิน"
                        autoComplete="off"
                        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
                      />
                      <input
                        type="password"
                        value={newEmpPassword}
                        onChange={(e) => setNewEmpPassword(e.target.value)}
                        placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)"
                        autoComplete="new-password"
                        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
                      />
                    </>
                  )}

                  {addEmpError && <p className="text-[11px] font-medium text-status-danger">{addEmpError}</p>}

                  <button
                    onClick={handleAddEmployee}
                    disabled={addEmpSaving}
                    className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {addEmpSaving ? 'กำลังบันทึก...' : 'เพิ่มพนักงาน'}
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {employees.map((emp) => (
                  <div key={emp.id} className="rounded-xl bg-gray-50 p-2.5">
                    {editingNameFor === emp.id ? (
                      <div className="mb-2 space-y-1.5">
                        <input
                          value={nameValue}
                          onChange={(e) => setNameValue(e.target.value)}
                          placeholder="ชื่อ-นามสกุล"
                          autoFocus
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                        />
                        <input
                          value={nicknameValue}
                          onChange={(e) => setNicknameValue(e.target.value)}
                          placeholder="ชื่อเล่น"
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand-400"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              if (!employee || !nameValue.trim() || !nicknameValue.trim()) return;
                              store.updateEmployee(emp.id, { name: nameValue.trim(), nickname: nicknameValue.trim() }, employee.id);
                              setEditingNameFor(null);
                            }}
                            disabled={!nameValue.trim() || !nicknameValue.trim()}
                            className="flex-1 rounded-lg bg-brand-600 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                          >
                            บันทึกชื่อ
                          </button>
                          <button
                            onClick={() => setEditingNameFor(null)}
                            className="flex-1 rounded-lg bg-gray-100 py-1.5 text-[11px] font-semibold text-gray-500"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-gray-800">
                          {emp.name} <span className="font-normal text-gray-400">({emp.nickname})</span>
                        </p>
                        <button
                          onClick={() => {
                            setEditingNameFor(emp.id);
                            setNameValue(emp.name);
                            setNicknameValue(emp.nickname);
                          }}
                          className="shrink-0 text-[11px] font-semibold text-brand-600"
                        >
                          แก้ไขชื่อ
                        </button>
                      </div>
                    )}
                    <div className="mt-2">
                      <PhotoAttach
                        value={emp.avatarUrl}
                        onChange={(url) => employee && store.updateEmployee(emp.id, { avatarUrl: url }, employee.id)}
                        bucket="employee-photos"
                        employeeId={emp.id}
                        label="รูปพนักงาน"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-gray-400">{emp.active ? 'ใช้งานอยู่' : 'ระงับการใช้งาน'}</p>
                      </div>
                      <select
                        value={emp.role}
                        onChange={(e) => employee && store.updateEmployee(emp.id, { role: e.target.value as Role }, employee.id)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none"
                        disabled={emp.id === employee?.id}
                      >
                        <option value="owner">{roleLabel('owner')}</option>
                        <option value="manager">{roleLabel('manager')}</option>
                        <option value="staff">{roleLabel('staff')}</option>
                      </select>
                      <button
                        onClick={() => employee && store.updateEmployee(emp.id, { active: !emp.active }, employee.id)}
                        disabled={emp.id === employee?.id}
                        className={`shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold disabled:opacity-30 ${
                          emp.active ? 'bg-status-dangerBg text-status-danger' : 'bg-status-okBg text-status-ok'
                        }`}
                      >
                        {emp.active ? 'ระงับ' : 'เปิดใช้'}
                      </button>
                    </div>
                    {emp.role === 'staff' && (
                      <div className="mt-2 space-y-1">
                        <span className="text-[11px] text-gray-500">แผนกที่เข้าถึงได้:</span>
                        <div className="flex flex-wrap gap-2">
                          {stations
                            .filter((s) => s.active)
                            .map((s) => (
                              <label
                                key={s.id}
                                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px]"
                              >
                                <input
                                  type="checkbox"
                                  checked={emp.stationIds.includes(s.id)}
                                  onChange={(e) => {
                                    if (!employee) return;
                                    const next = e.target.checked
                                      ? [...emp.stationIds, s.id]
                                      : emp.stationIds.filter((id) => id !== s.id);
                                    store.updateEmployee(emp.id, { stationIds: next }, employee.id);
                                  }}
                                />
                                {s.name}
                              </label>
                            ))}
                        </div>
                      </div>
                    )}

                    <p className="mt-2 text-[11px] text-gray-400">
                      ล็อกอินล่าสุด:{' '}
                      {emp.lastLoginAt
                        ? `${formatThaiDateTime(emp.lastLoginAt)}${emp.lastLoginDevice ? ` · ${emp.lastLoginDevice}` : ''}`
                        : 'ยังไม่เคยล็อกอิน'}
                    </p>

                    {isMockMode && emp.id !== employee?.id && (
                      <div className="mt-1.5">
                        {resetPinFor === emp.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={4}
                              value={resetPinValue}
                              onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              autoFocus
                              placeholder="PIN ใหม่"
                              className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-center text-xs tracking-[0.2em] outline-none focus:border-brand-400"
                            />
                            <button
                              onClick={() => {
                                if (!employee || resetPinValue.length !== 4) return;
                                store.updateEmployee(emp.id, { pinCode: resetPinValue }, employee.id);
                                setResetPinFor(null);
                                setResetPinValue('');
                              }}
                              disabled={resetPinValue.length !== 4}
                              className="rounded-lg bg-brand-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40"
                            >
                              บันทึก
                            </button>
                            <button
                              onClick={() => {
                                setResetPinFor(null);
                                setResetPinValue('');
                              }}
                              className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setResetPinFor(emp.id);
                              setResetPinValue('');
                            }}
                            className="text-[11px] font-semibold text-brand-600"
                          >
                            รีเซ็ต PIN
                          </button>
                        )}
                      </div>
                    )}

                    {!isMockMode && emp.id !== employee?.id && (
                      <div className="mt-1.5">
                        {resetPasswordFor === emp.id ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="password"
                                value={resetPasswordValue}
                                onChange={(e) => setResetPasswordValue(e.target.value)}
                                autoFocus
                                placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
                                className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
                              />
                            </div>
                            {resetPasswordError && <p className="text-[11px] font-medium text-status-danger">{resetPasswordError}</p>}
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={async () => {
                                  if (!employee || resetPasswordValue.length < 6) return;
                                  setResetPasswordError('');
                                  setResetPasswordSaving(true);
                                  try {
                                    await store.resetEmployeePassword(emp.id, resetPasswordValue, employee.id);
                                    setResetPasswordFor(null);
                                    setResetPasswordValue('');
                                  } catch (err) {
                                    setResetPasswordError(err instanceof Error ? err.message : 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
                                  } finally {
                                    setResetPasswordSaving(false);
                                  }
                                }}
                                disabled={resetPasswordValue.length < 6 || resetPasswordSaving}
                                className="rounded-lg bg-brand-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40"
                              >
                                {resetPasswordSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                              </button>
                              <button
                                onClick={() => {
                                  setResetPasswordFor(null);
                                  setResetPasswordValue('');
                                  setResetPasswordError('');
                                }}
                                className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setResetPasswordFor(emp.id);
                              setResetPasswordValue('');
                              setResetPasswordError('');
                            }}
                            className="text-[11px] font-semibold text-brand-600"
                          >
                            รีเซ็ตรหัสผ่าน
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {!isOwner && (
          <div className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-xs text-brand-700">
            คุณเข้าสู่ระบบในฐานะผู้จัดการ — จัดการรายชื่อวัตถุดิบและรายการเช็กลิสต์ได้ด้านล่าง ส่วนการตั้งค่าระบบและสิทธิ์พนักงานแก้ไขได้เฉพาะเจ้าของร้าน
          </div>
        )}

        {employee && (
          <section className="rounded-2xl bg-white p-4 shadow-card">
            <SectionTitle>จัดซื้อ/การเงิน</SectionTitle>
            <div className={isOwner ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
              <Link
                href="/purchase-orders"
                className="rounded-xl bg-gray-50 px-3 py-2.5 text-center text-xs font-semibold text-gray-700 active:bg-gray-100"
              >
                📦 ใบสั่งซื้อ
              </Link>
              {isOwner && (
                <Link
                  href="/cash-report"
                  className="rounded-xl bg-gray-50 px-3 py-2.5 text-center text-xs font-semibold text-gray-700 active:bg-gray-100"
                >
                  💵 รายงานเงินสด
                </Link>
              )}
            </div>
          </section>
        )}

        {employee && <StoreHolidaysSection storeHolidays={storeHolidays} employeeId={employee.id} />}

        {employee && (
          <ChecklistItemsSection stations={stations} checklistTemplate={checklistTemplate} employeeId={employee.id} isOwner={isOwner} />
        )}

        {employee && <ProductsSection stations={stations} products={products} employeeId={employee.id} />}

        {employee && (
          <StockItemsSection stockItems={stockItems} stockCategories={stockCategories} suppliers={suppliers} employeeId={employee.id} />
        )}

        {employee && (
          <SuppliersSection
            suppliers={suppliers}
            supplierItemPrices={supplierItemPrices}
            stockItems={stockItems}
            employeeId={employee.id}
          />
        )}
      </main>
    </div>
  );
}

// ============================================================================
// จัดการรายการเช็กลิสต์ต่อแผนก — เพิ่ม/แก้ไข/ลบ (owner/manager เท่านั้น ผ่านการ์ดที่หน้า SettingsPage ด้านบน + RLS)
// ============================================================================
function ChecklistItemsSection({
  stations,
  checklistTemplate,
  employeeId,
  isOwner,
}: {
  stations: Station[];
  checklistTemplate: ChecklistTemplateItem[];
  employeeId: string;
  isOwner: boolean;
}) {
  const activeStations = stations.filter((s) => s.active).sort((a, b) => a.order - b.order);
  const [showAddStation, setShowAddStation] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [newStationHasProduction, setNewStationHasProduction] = useState(true);

  function handleAddStation() {
    if (!newStationName.trim()) return;
    store.createStation({ name: newStationName.trim(), hasProduction: newStationHasProduction, actorId: employeeId });
    setNewStationName('');
    setNewStationHasProduction(true);
    setShowAddStation(false);
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <SectionTitle>แผนก ({activeStations.length} แผนก)</SectionTitle>
        {isOwner && (
          <button onClick={() => setShowAddStation((v) => !v)} className="mb-3 text-[11px] font-semibold text-brand-600">
            {showAddStation ? 'ยกเลิก' : '+ เพิ่มแผนก'}
          </button>
        )}
      </div>
      {isOwner && showAddStation && (
        <div className="mb-3 space-y-1.5 rounded-xl bg-gray-50 p-2.5">
          <input
            value={newStationName}
            onChange={(e) => setNewStationName(e.target.value)}
            placeholder="ชื่อแผนกใหม่ เช่น ครัวเบเกอรี่"
            autoFocus
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <input
              type="checkbox"
              checked={newStationHasProduction}
              onChange={(e) => setNewStationHasProduction(e.target.checked)}
            />
            แผนกนี้มีระบบผลิตสินค้า (ถ้าไม่ติ๊ก จะใช้เฉพาะสต๊อก/การสั่งซื้อ เช่น ครัวจิปาถะ)
          </label>
          <button
            onClick={handleAddStation}
            disabled={!newStationName.trim()}
            className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            เพิ่มแผนก
          </button>
        </div>
      )}
      <div className="space-y-4">
        {activeStations.map((s) => (
          <ChecklistStationBlock
            key={s.id}
            station={s}
            items={checklistTemplate.filter((t) => t.stationId === s.id && t.active).sort((a, b) => a.order - b.order)}
            employeeId={employeeId}
            isOwner={isOwner}
          />
        ))}
      </div>
      {!isOwner && <p className="mt-3 text-[11px] text-gray-400">* การเพิ่ม/ลบ/แก้ไขชื่อแผนกทำได้เฉพาะเจ้าของร้านเท่านั้น</p>}
    </section>
  );
}

function ChecklistStationBlock({
  station,
  items,
  employeeId,
  isOwner,
}: {
  station: Station;
  items: ChecklistTemplateItem[];
  employeeId: string;
  isOwner: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [editingStation, setEditingStation] = useState(false);
  const [stationName, setStationName] = useState(station.name);

  function handleAdd() {
    if (!newLabel.trim()) return;
    store.createChecklistTemplateItem({ stationId: station.id, label: newLabel.trim(), actorId: employeeId });
    setNewLabel('');
    setShowAdd(false);
  }

  function handleDelete(id: string, label: string) {
    if (typeof window !== 'undefined' && !window.confirm(`ลบรายการเช็กลิสต์ "${label}" ออกจาก ${station.name}?`)) return;
    store.deleteChecklistTemplateItem(id, employeeId);
  }

  function handleSaveStationName() {
    const trimmed = stationName.trim();
    if (!trimmed || trimmed === station.name) {
      setStationName(station.name);
      setEditingStation(false);
      return;
    }
    store.updateStation(station.id, { name: trimmed }, employeeId);
    setEditingStation(false);
  }

  function handleDeleteStation() {
    if (typeof window !== 'undefined' && !window.confirm(`ลบแผนก "${station.name}"? ประวัติเช็กลิสต์/การผลิตเก่าจะยังเก็บไว้ แต่จะไม่แสดงแผนกนี้อีก`)) {
      return;
    }
    store.deleteStation(station.id, employeeId);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        {editingStation ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              autoFocus
              className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-bold outline-none focus:border-brand-400"
            />
            <button onClick={handleSaveStationName} className="shrink-0 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-bold text-white">
              บันทึก
            </button>
            <button
              onClick={() => {
                setStationName(station.name);
                setEditingStation(false);
              }}
              className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500"
            >
              ยกเลิก
            </button>
          </div>
        ) : (
          <p className="text-xs font-bold text-gray-700">
            {station.name} <span className="font-normal text-gray-400">({items.length} ข้อ)</span>
          </p>
        )}
        {!editingStation && (
          <div className="flex shrink-0 items-center gap-1.5">
            {isOwner && (
              <>
                <button
                  onClick={() => setEditingStation(true)}
                  className="rounded-md bg-gray-100 px-1.5 py-1 text-[10px] font-semibold text-gray-600"
                >
                  แก้ไขชื่อ
                </button>
                <button
                  onClick={handleDeleteStation}
                  className="rounded-md bg-status-dangerBg px-1.5 py-1 text-[10px] font-semibold text-status-danger"
                >
                  ลบแผนก
                </button>
              </>
            )}
            <button onClick={() => setShowAdd((v) => !v)} className="text-[11px] font-semibold text-brand-600">
              {showAdd ? 'ยกเลิก' : '+ เพิ่มรายการ'}
            </button>
          </div>
        )}
      </div>
      {showAdd && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="ชื่อรายการเช็กลิสต์"
            className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <button
            onClick={handleAdd}
            disabled={!newLabel.trim()}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            เพิ่ม
          </button>
        </div>
      )}
      <ul className="mt-1.5 space-y-0.5">
        {items.length === 0 && <li className="py-1 text-xs text-gray-300">ยังไม่มีรายการเช็กลิสต์สำหรับแผนกนี้</li>}
        {items.map((t) => (
          <ChecklistItemRow key={t.id} item={t} employeeId={employeeId} onDelete={() => handleDelete(t.id, t.label)} />
        ))}
      </ul>
    </div>
  );
}

const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const FREQUENCY_OPTIONS: { value: ChecklistItemFrequency; label: string }[] = [
  { value: 'daily', label: 'ทุกวัน' },
  { value: 'weekly', label: 'รายสัปดาห์' },
  { value: 'monthly', label: 'รายเดือน' },
];

function describeChecklistItemSchedule(item: ChecklistTemplateItem): string {
  const frequency = item.frequency ?? 'daily';
  if (frequency === 'weekly') {
    const days = item.weeklyDays ?? [];
    if (days.length === 0) return 'รายสัปดาห์ (ยังไม่เลือกวัน)';
    return `ทุก ${days.map((d) => WEEKDAY_LABELS[d]).join(' ')}`;
  }
  if (frequency === 'monthly') {
    return `วันที่ ${item.monthlyDay ?? 1} ของเดือน`;
  }
  return 'ทุกวัน';
}

function ChecklistItemRow({
  item,
  employeeId,
  onDelete,
}: {
  item: ChecklistTemplateItem;
  employeeId: string;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [frequency, setFrequency] = useState<ChecklistItemFrequency>(item.frequency ?? 'daily');
  const [weeklyDays, setWeeklyDays] = useState<number[]>(item.weeklyDays ?? []);
  const [monthlyDay, setMonthlyDay] = useState<number>(item.monthlyDay ?? 1);

  function handleSave() {
    if (!label.trim()) return;
    store.updateChecklistTemplateItem(
      item.id,
      {
        label: label.trim(),
        frequency,
        weeklyDays: frequency === 'weekly' ? weeklyDays : null,
        monthlyDay: frequency === 'monthly' ? monthlyDay : null,
      },
      employeeId
    );
    setEditing(false);
  }

  function toggleWeeklyDay(day: number) {
    setWeeklyDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-1.5 rounded-lg bg-gray-50 px-2 py-1.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400" />
        <div className="flex flex-wrap gap-1">
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFrequency(opt.value)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${frequency === opt.value ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {frequency === 'weekly' && (
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_LABELS.map((d, idx) => (
              <button
                key={idx}
                onClick={() => toggleWeeklyDay(idx)}
                className={`h-6 w-6 rounded-full text-[10px] font-semibold ${weeklyDays.includes(idx) ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {frequency === 'monthly' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">วันที่</span>
            <input
              type="number"
              min={1}
              max={31}
              value={monthlyDay}
              onChange={(e) => setMonthlyDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              className="w-14 rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
            />
            <span className="text-[10px] text-gray-500">ของเดือน</span>
          </div>
        )}
        <div className="flex gap-1.5">
          <button onClick={handleSave} className="shrink-0 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-bold text-white">บันทึก</button>
          <button
            onClick={() => {
              setLabel(item.label);
              setFrequency(item.frequency ?? 'daily');
              setWeeklyDays(item.weeklyDays ?? []);
              setMonthlyDay(item.monthlyDay ?? 1);
              setEditing(false);
            }}
            className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500"
          >
            ยกเลิก
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-0.5 text-xs text-gray-600">
      <span className="min-w-0 flex-1 truncate">
        {item.label}
        <span className="ml-1.5 text-[10px] text-gray-400">{describeChecklistItemSchedule(item)}</span>
      </span>
      <span className="flex shrink-0 gap-1">
        <button onClick={() => setEditing(true)} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">แก้ไข</button>
        <button onClick={onDelete} className="rounded-md bg-status-dangerBg px-1.5 py-0.5 text-[10px] font-semibold text-status-danger">ลบ</button>
      </span>
    </li>
  );
}

// ============================================================================
// จัดการ "สินค้าที่ผลิต" ต่อแผนก — เพิ่ม/แก้ไข/ลบ (owner/manager เท่านั้น + RLS) — เฉพาะแผนกที่ hasProduction = true
// ============================================================================
function ProductsSection({
  stations,
  products,
  employeeId,
}: {
  stations: Station[];
  products: Product[];
  employeeId: string;
}) {
  const productionStations = stations.filter((s) => s.active && s.hasProduction).sort((a, b) => a.order - b.order);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <SectionTitle>สินค้าที่ผลิต ({products.length} รายการ)</SectionTitle>
      <div className="space-y-4">
        {productionStations.map((s) => (
          <ProductStationBlock key={s.id} station={s} items={products.filter((p) => p.stationId === s.id)} employeeId={employeeId} />
        ))}
        {productionStations.length === 0 && <p className="text-xs text-gray-300">ยังไม่มีแผนกที่เปิดใช้ระบบผลิต</p>}
      </div>
      <p className="mt-3 text-[11px] text-gray-400">* กำหนดอายุการเก็บ (shelf life) ต่อสินค้า — ใช้คำนวณวันหมดอายุอัตโนมัติเมื่อบันทึกล็อตการผลิตใหม่</p>
    </section>
  );
}

function ProductStationBlock({ station, items, employeeId }: { station: Station; items: Product[]; employeeId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [shelfLifeDays, setShelfLifeDays] = useState('3');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim() || !unit.trim() || saving) return;
    setSaving(true);
    try {
      await store.createProduct({ stationId: station.id, name: name.trim(), unit: unit.trim(), shelfLifeDays: Number(shelfLifeDays) || 1, actorId: employeeId });
      setName('');
      setUnit('');
      setShelfLifeDays('3');
      setShowAdd(false);
    } catch (err) {
      console.error('[ProductStationBlock] createProduct failed', err);
      if (typeof window !== 'undefined') window.alert('บันทึกสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (typeof window !== 'undefined' && !window.confirm(`ลบสินค้า "${label}" ออกจากรายการที่ ${station.name} ผลิต?`)) return;
    setDeletingId(id);
    try {
      await store.deleteProduct(id, employeeId);
    } catch (err) {
      console.error('[ProductStationBlock] deleteProduct failed', err);
      if (typeof window !== 'undefined') window.alert('ลบสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-700">
          {station.name} <span className="font-normal text-gray-400">({items.length} รายการ)</span>
        </p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-[11px] font-semibold text-brand-600">
          {showAdd ? 'ยกเลิก' : '+ เพิ่มสินค้า'}
        </button>
      </div>
      {showAdd && (
        <div className="mt-1.5 space-y-1.5 rounded-xl bg-gray-50 p-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อสินค้า เช่น นมต้ม"
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="หน่วย เช่น ลิตร"
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
            />
            <input
              type="number"
              min={1}
              value={shelfLifeDays}
              onChange={(e) => setShelfLifeDays(e.target.value)}
              placeholder="อายุเก็บ (วัน)"
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || !unit.trim() || saving}
            className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            {saving ? 'กำลังบันทึก...' : 'เพิ่มสินค้า'}
          </button>
        </div>
      )}
      <ul className="mt-1.5 space-y-0.5">
        {items.length === 0 && <li className="py-1 text-xs text-gray-300">แผนกนี้ยังไม่มีรายการสินค้าที่ผลิต</li>}
        {items.map((p) => (
          <ProductRow key={p.id} product={p} employeeId={employeeId} deleting={deletingId === p.id} onDelete={() => handleDelete(p.id, p.name)} />
        ))}
      </ul>
    </div>
  );
}

function ProductRow({ product, employeeId, deleting, onDelete }: { product: Product; employeeId: string; deleting: boolean; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [unit, setUnit] = useState(product.unit);
  const [shelfLifeDays, setShelfLifeDays] = useState(String(product.shelfLifeDays));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !unit.trim() || saving) return;
    setSaving(true);
    try {
      await store.updateProduct(product.id, { name: name.trim(), unit: unit.trim(), shelfLifeDays: Number(shelfLifeDays) || 1 }, employeeId);
      setEditing(false);
    } catch (err) {
      console.error('[ProductRow] updateProduct failed', err);
      if (typeof window !== 'undefined') window.alert('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="space-y-1.5 border-b border-gray-50 py-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="หน่วย"
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
          />
          <input
            type="number"
            min={1}
            value={shelfLifeDays}
            onChange={(e) => setShelfLifeDays(e.target.value)}
            placeholder="อายุเก็บ (วัน)"
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
          />
        </div>
        <div className="flex gap-1.5">
          <button onClick={handleSave} disabled={saving} className="flex-1 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button
            onClick={() => {
              setName(product.name);
              setUnit(product.unit);
              setShelfLifeDays(String(product.shelfLifeDays));
              setEditing(false);
            }}
            disabled={saving}
            className="flex-1 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500 disabled:opacity-40"
          >
            ยกเลิก
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-0.5 text-xs text-gray-600">
      <span className="min-w-0 flex-1 truncate">
        {product.name} <span className="text-gray-400">· เก็บได้ {product.shelfLifeDays} วัน</span>
      </span>
      <span className="flex shrink-0 gap-1">
        <button onClick={() => setEditing(true)} disabled={deleting} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 disabled:opacity-40">
          แก้ไข
        </button>
        <button onClick={onDelete} disabled={deleting} className="rounded-md bg-status-dangerBg px-1.5 py-0.5 text-[10px] font-semibold text-status-danger disabled:opacity-40">
          {deleting ? 'กำลังลบ...' : 'ลบ'}
        </button>
      </span>
    </li>
  );
}

// ============================================================================
// จัดการรายชื่อวัตถุดิบในสต๊อก — เพิ่ม/แก้ไข/ลบ (owner/manager เท่านั้น ผ่านการ์ดที่หน้า SettingsPage ด้านบน + RLS)
// ============================================================================
function StockItemsSection({
  stockItems,
  stockCategories,
  suppliers,
  employeeId,
}: {
  stockItems: StockItem[];
  stockCategories: StockCategory[];
  suppliers: Supplier[];
  employeeId: string;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const emptyRow = () => ({ name: '', categoryId: stockCategories[0]?.id ?? '', unit: '', supplierId: '' });
  const [rows, setRows] = useState<{ name: string; categoryId: string; unit: string; supplierId: string }[]>(() => [emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  async function handleAddCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (stockCategories.some((c) => c.name === trimmed)) {
      if (typeof window !== 'undefined') window.alert(`มีหมวดหมู่ชื่อ "${trimmed}" อยู่แล้ว`);
      return;
    }
    setSavingCategory(true);
    try {
      await store.createStockCategory({ name: trimmed, actorId: employeeId });
      setNewCategoryName('');
      setShowAddCategory(false);
    } finally {
      setSavingCategory(false);
    }
  }

  function handleDeleteCategory(cat: StockCategory) {
    const itemsInCategory = stockItems.filter((it) => it.categoryId === cat.id).length;
    if (itemsInCategory > 0) {
      if (typeof window !== 'undefined') {
        window.alert(`ลบไม่ได้ — ยังมีวัตถุดิบ ${itemsInCategory} รายการอยู่ในหมวดหมู่ "${cat.name}" กรุณาย้ายวัตถุดิบเหล่านั้นไปหมวดหมู่อื่นก่อน`);
      }
      return;
    }
    if (typeof window !== 'undefined' && !window.confirm(`ลบหมวดหมู่ "${cat.name}"?`)) return;
    store.deleteStockCategory(cat.id, employeeId);
  }

  function resetRows() {
    setRows([emptyRow()]);
  }

  function updateRow(index: number, patch: Partial<{ name: string; categoryId: string; unit: string; supplierId: string }>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((_, i) => i !== index)));
  }

  const validRows = rows.filter((r) => r.name.trim() && r.categoryId && r.unit.trim());

  async function handleAddAll() {
    if (validRows.length === 0) return;
    setSaving(true);
    try {
      // บันทึกทีละรายการตามลำดับ (ไม่ใช่พร้อมกัน) เพื่อให้ทำงานได้ถูกต้องทั้งโหมด mock (sync) และโหมด Supabase จริง (async)
      for (const r of validRows) {
        await store.createStockItem({
          name: r.name.trim(),
          categoryId: r.categoryId,
          unit: r.unit.trim(),
          supplierId: r.supplierId || null,
          // ไม่ใช้ระบบนับจำนวนคงเหลือแล้ว (ดูหน้า "สั่งสินค้า") — ค่าเหล่านี้เก็บไว้เพื่อความเข้ากันได้ของโครงสร้างข้อมูลเท่านั้น
          minQuantity: 0,
          parQuantity: 0,
          quantity: 0,
          actorId: employeeId,
        });
      }
      resetRows();
      setShowAddForm(false);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string, name: string) {
    if (typeof window !== 'undefined' && !window.confirm(`ลบวัตถุดิบ "${name}" ออกจากรายการสต๊อก?`)) return;
    store.deleteStockItem(id, employeeId);
  }

  const unassignedCount = stockItems.filter((it) => !it.supplierId).length;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <SectionTitle
        action={
          <button onClick={() => setShowAddForm((v) => !v)} className="text-xs font-semibold text-brand-600">
            {showAddForm ? 'ยกเลิก' : '+ เพิ่มวัตถุดิบ'}
          </button>
        }
      >
        รายชื่อวัตถุดิบ ({stockItems.length} รายการ)
      </SectionTitle>

      {unassignedCount > 0 && (
        <p className="mb-2 rounded-lg bg-status-warnBg px-2.5 py-1.5 text-[11px] font-medium text-status-warn">
          ⚠️ มี {unassignedCount} รายการที่ยังไม่ได้กำหนดผู้ขาย — พนักงานจะสั่งซื้อรายการเหล่านี้ไม่ได้จนกว่าจะกำหนดผู้ขายก่อน
        </p>
      )}

      {showAddForm && (
        <div className="mb-3 space-y-2 rounded-xl bg-gray-50 p-3">
          <p className="text-[11px] text-gray-400">เพิ่มได้ทีละหลายรายการ — กรอกทีละแถว แล้วกดบันทึกทั้งหมดรวดเดียว</p>
          <div className="space-y-2.5">
            {rows.map((row, i) => (
              <div key={i} className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-2.5">
                <div className="flex items-center gap-1.5">
                  <input
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    placeholder="ชื่อวัตถุดิบ"
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
                  />
                  {rows.length > 1 && (
                    <button
                      onClick={() => removeRow(i)}
                      title="ลบแถวนี้"
                      className="shrink-0 rounded-lg bg-status-dangerBg px-2 py-2 text-xs font-bold text-status-danger"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={row.categoryId}
                    onChange={(e) => updateRow(i, { categoryId: e.target.value })}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs outline-none"
                  >
                    {stockCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={row.unit}
                    onChange={(e) => updateRow(i, { unit: e.target.value })}
                    placeholder="หน่วย เช่น ขวด, กก."
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-brand-400"
                  />
                </div>
                <select
                  value={row.supplierId}
                  onChange={(e) => updateRow(i, { supplierId: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs outline-none"
                >
                  <option value="">— ยังไม่ระบุผู้ขาย —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button onClick={addRow} className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-semibold text-gray-500">
            + เพิ่มอีกแถว
          </button>
          <button
            onClick={handleAddAll}
            disabled={validRows.length === 0 || saving}
            className="w-full rounded-lg bg-brand-600 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            {saving ? 'กำลังบันทึก...' : `บันทึกวัตถุดิบทั้งหมด (${validRows.length} รายการ)`}
          </button>
        </div>
      )}

      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[11px] font-bold text-gray-400">หมวดหมู่วัตถุดิบ (แตะชื่อเพื่อแก้ไข)</p>
          <button onClick={() => setShowAddCategory((v) => !v)} className="text-[11px] font-semibold text-brand-600">
            {showAddCategory ? 'ยกเลิก' : '+ เพิ่มหมวดหมู่'}
          </button>
        </div>
        {showAddCategory && (
          <div className="mb-2 flex items-center gap-1.5">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="ชื่อหมวดหมู่ใหม่ เช่น ของแช่แข็ง"
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-brand-400"
            />
            <button
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim() || savingCategory}
              className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              {savingCategory ? '...' : 'บันทึก'}
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {stockCategories.map((cat) => (
            <StockCategoryChip key={cat.id} category={cat} employeeId={employeeId} onDelete={() => handleDeleteCategory(cat)} />
          ))}
        </div>
      </div>

      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {stockCategories.map((cat) => {
          const items = stockItems.filter((it) => it.categoryId === cat.id);
          if (items.length === 0) return null;
          return (
            <div key={cat.id}>
              <p className="mt-2 text-[11px] font-bold text-gray-400">{cat.name}</p>
              {items.map((it) => (
                <StockItemRow
                  key={it.id}
                  item={it}
                  stockCategories={stockCategories}
                  suppliers={suppliers}
                  employeeId={employeeId}
                  onDelete={() => handleDelete(it.id, it.name)}
                />
              ))}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        * ใช้จัดการรายชื่อวัตถุดิบและกำหนดผู้ขายล่วงหน้า — พนักงานจะเลือกผู้ขายเองตอนสั่งสินค้าไม่ได้แล้ว ต้องกำหนดไว้ที่นี่ก่อน
      </p>
    </section>
  );
}

function StockItemRow({
  item,
  stockCategories,
  suppliers,
  employeeId,
  onDelete,
}: {
  item: StockItem;
  stockCategories: StockCategory[];
  suppliers: Supplier[];
  employeeId: string;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [unit, setUnit] = useState(item.unit);
  const [supplierId, setSupplierId] = useState(item.supplierId ?? '');

  function handleSave() {
    if (!name.trim() || !unit.trim()) return;
    store.updateStockItemDetails(
      item.id,
      {
        name: name.trim(),
        categoryId,
        unit: unit.trim(),
        supplierId: supplierId || null,
      },
      employeeId
    );
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-1.5 border-b border-gray-50 py-2 text-xs">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none"
          >
            {stockCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="หน่วย"
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
          />
        </div>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none"
        >
          <option value="">— ยังไม่ระบุผู้ขาย —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5 pt-0.5">
          <button onClick={handleSave} className="flex-1 rounded-lg bg-brand-600 py-1.5 text-[11px] font-bold text-white">
            บันทึก
          </button>
          <button
            onClick={() => setEditing(false)}
            className="flex-1 rounded-lg bg-gray-100 py-1.5 text-[11px] font-semibold text-gray-500"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  const supplierName = suppliers.find((s) => s.id === item.supplierId)?.name;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-50 py-1.5 text-xs">
      <div className="min-w-0 flex-1">
        <span className="text-gray-700">{item.name}</span>
        <span className="ml-1.5 text-gray-400">{item.unit}</span>
        <span className={`ml-1.5 ${supplierName ? 'text-gray-400' : 'font-semibold text-status-warn'}`}>
          {supplierName ? `· ${supplierName}` : '· ยังไม่ระบุผู้ขาย'}
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        <button onClick={() => setEditing(true)} className="rounded-md bg-gray-100 px-1.5 py-1 text-[10px] font-semibold text-gray-600">
          แก้ไข
        </button>
        <button onClick={onDelete} className="rounded-md bg-status-dangerBg px-1.5 py-1 text-[10px] font-semibold text-status-danger">
          ลบ
        </button>
      </div>
    </div>
  );
}

// แก้ไขชื่อหมวดหมู่วัตถุดิบ (เช่น "ของสด", "จิปาถะ") — owner/manager เท่านั้น (จำกัดสิทธิ์ที่การ์ด StockItemsSection ด้านบน + RLS)
// ชื่อหมวดหมู่ต้องไม่ซ้ำกัน (unique constraint ในฐานข้อมูล) — ถ้าตั้งชื่อซ้ำจะบันทึกไม่สำเร็จ
function StockCategoryChip({
  category,
  employeeId,
  onDelete,
}: {
  category: StockCategory;
  employeeId: string;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
      setName(category.name);
      setEditing(false);
      return;
    }
    store.updateStockCategoryName(category.id, trimmed, employeeId);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded-full border border-brand-300 bg-white py-0.5 pl-2 pr-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') {
              setName(category.name);
              setEditing(false);
            }
          }}
          autoFocus
          className="w-20 min-w-0 border-none bg-transparent text-[11px] outline-none"
        />
        <button onClick={handleSave} className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
          บันทึก
        </button>
        <button
          onClick={() => {
            setName(category.name);
            setEditing(false);
          }}
          className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-500"
        >
          ยกเลิก
        </button>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center overflow-hidden rounded-full bg-gray-100">
      <button
        onClick={() => setEditing(true)}
        title="แก้ไขชื่อหมวดหมู่"
        className="py-1 pl-2.5 pr-1.5 text-[11px] font-semibold text-gray-600 active:bg-gray-200"
      >
      {category.name} <span className="text-gray-400">✎</span>
    </button>
      <button
        onClick={onDelete}
        title="ลบหมวดหมู่"
        className="py-1 pl-1 pr-2.5 text-[11px] font-bold text-status-danger active:bg-status-dangerBg"
      >
        ✕
      </button>
    </span>
  );
}

// ============================================================================
// จัดการผู้ขาย/ซัพพลายเออร์ + ประวัติราคาต่อรายการ (owner/manager เท่านั้น) — เฟส 2
// ประวัติราคาเป็นแบบเพิ่มได้อย่างเดียว (append-only) ห้ามแก้ไข/ลบของเดิม ตาม SRS "ห้ามลบประวัติ"
// ============================================================================
function SuppliersSection({
  suppliers,
  supplierItemPrices,
  stockItems,
  employeeId,
}: {
  suppliers: Supplier[];
  supplierItemPrices: SupplierItemPrice[];
  stockItems: StockItem[];
  employeeId: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  function handleAdd() {
    if (!name.trim()) return;
    store.createSupplier({
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      address: address.trim(),
      note: '',
      actorId: employeeId,
    });
    setName('');
    setContactPerson('');
    setPhone('');
    setAddress('');
    setShowAdd(false);
  }

  function handleDelete(id: string, label: string) {
    if (typeof window !== 'undefined' && !window.confirm(`ลบผู้ขาย "${label}" ออกจากรายการ?`)) return;
    store.deleteSupplier(id, employeeId);
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <SectionTitle>ผู้ขาย/ซัพพลายเออร์ ({suppliers.length} ราย)</SectionTitle>
        <button onClick={() => setShowAdd((v) => !v)} className="mb-3 text-[11px] font-semibold text-brand-600">
          {showAdd ? 'ยกเลิก' : '+ เพิ่มผู้ขาย'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-3 space-y-1.5 rounded-xl bg-gray-50 p-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อผู้ขาย/ร้านค้า"
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <input
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            placeholder="ชื่อผู้ติดต่อ"
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="เบอร์โทร"
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
            />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ที่อยู่"
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            เพิ่มผู้ขาย
          </button>
        </div>
      )}
      <div className="space-y-3">
        {suppliers.length === 0 && <p className="text-xs text-gray-300">ยังไม่มีผู้ขายในระบบ</p>}
        {suppliers.map((s) => (
          <SupplierBlock
            key={s.id}
            supplier={s}
            prices={supplierItemPrices.filter((p) => p.supplierId === s.id)}
            stockItems={stockItems}
            employeeId={employeeId}
            onDelete={() => handleDelete(s.id, s.name)}
          />
        ))}
      </div>
    </section>
  );
}

function SupplierBlock({
  supplier,
  prices,
  stockItems,
  employeeId,
  onDelete,
}: {
  supplier: Supplier;
  prices: SupplierItemPrice[];
  stockItems: StockItem[];
  employeeId: string;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(supplier.name);
  const [contactPerson, setContactPerson] = useState(supplier.contactPerson);
  const [phone, setPhone] = useState(supplier.phone);
  const [address, setAddress] = useState(supplier.address);
  const [showPrices, setShowPrices] = useState(false);

  function handleSave() {
    if (!name.trim()) return;
    store.updateSupplier(
      supplier.id,
      { name: name.trim(), contactPerson: contactPerson.trim(), phone: phone.trim(), address: address.trim() },
      employeeId
    );
    setEditing(false);
  }

  // เอาราคาล่าสุดต่อรายการ (เรียงจากใหม่ไปเก่า) มาแสดงเป็นสรุปด้านบน
  const latestByItem = new Map<string, SupplierItemPrice>();
  for (const p of [...prices].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    latestByItem.set(p.stockItemId, p);
  }
  const latestList = Array.from(latestByItem.values());

  if (editing) {
    return (
      <div className="space-y-1.5 rounded-xl bg-gray-50 p-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
        />
        <input
          value={contactPerson}
          onChange={(e) => setContactPerson(e.target.value)}
          placeholder="ชื่อผู้ติดต่อ"
          className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="เบอร์โทร"
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="ที่อยู่"
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
          />
        </div>
        <div className="flex gap-1.5">
          <button onClick={handleSave} className="flex-1 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-bold text-white">
            บันทึก
          </button>
          <button
            onClick={() => {
              setName(supplier.name);
              setContactPerson(supplier.contactPerson);
              setPhone(supplier.phone);
              setAddress(supplier.address);
              setEditing(false);
            }}
            className="flex-1 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-gray-700">{supplier.name}</p>
          {(supplier.contactPerson || supplier.phone) && (
            <p className="truncate text-[11px] text-gray-400">
              {supplier.contactPerson}
              {supplier.contactPerson && supplier.phone ? ' · ' : ''}
              {supplier.phone}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={() => setEditing(true)} className="rounded-md bg-gray-100 px-1.5 py-1 text-[10px] font-semibold text-gray-600">
            แก้ไข
          </button>
          <button onClick={onDelete} className="rounded-md bg-status-dangerBg px-1.5 py-1 text-[10px] font-semibold text-status-danger">
            ลบ
          </button>
        </div>
      </div>
      <button onClick={() => setShowPrices((v) => !v)} className="mt-1.5 text-[11px] font-semibold text-brand-600">
        {showPrices ? 'ซ่อนราคา' : `ดูราคา (${latestList.length} รายการ)`}
      </button>
      {showPrices && (
        <div className="mt-1.5 space-y-1.5 border-t border-gray-50 pt-1.5">
          {latestList.length === 0 && <p className="text-[11px] text-gray-300">ยังไม่มีประวัติราคาของผู้ขายรายนี้</p>}
          <ul className="space-y-0.5">
            {latestList.map((p) => {
              const item = stockItems.find((it) => it.id === p.stockItemId);
              return (
                <li key={p.stockItemId} className="flex items-center justify-between text-[11px] text-gray-600">
                  <span className="truncate">{item?.name ?? p.stockItemId}</span>
                  <span className="shrink-0 font-semibold text-gray-700">
                    {p.price.toLocaleString()} บาท/{p.unit}
                  </span>
                </li>
              );
            })}
          </ul>
          <AddSupplierPriceForm supplierId={supplier.id} stockItems={stockItems} employeeId={employeeId} />
        </div>
      )}
    </div>
  );
}

function AddSupplierPriceForm({
  supplierId,
  stockItems,
  employeeId,
}: {
  supplierId: string;
  stockItems: StockItem[];
  employeeId: string;
}) {
  const [stockItemId, setStockItemId] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');

  function handleAdd() {
    if (!stockItemId || !price.trim()) return;
    const item = stockItems.find((it) => it.id === stockItemId);
    store.addSupplierItemPrice({
      supplierId,
      stockItemId,
      unit: unit.trim() || item?.unit || '',
      price: Number(price) || 0,
      note: '',
      actorId: employeeId,
    });
    setStockItemId('');
    setUnit('');
    setPrice('');
  }

  return (
    <div className="space-y-1.5 rounded-lg bg-gray-50 p-2">
      <select
        value={stockItemId}
        onChange={(e) => {
          setStockItemId(e.target.value);
          const item = stockItems.find((it) => it.id === e.target.value);
          if (item) setUnit(item.unit);
        }}
        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-brand-400"
      >
        <option value="">— เลือกรายการวัตถุดิบ —</option>
        {stockItems.map((it) => (
          <option key={it.id} value={it.id}>
            {it.name}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="ราคา (บาท)"
          className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] outline-none focus:border-brand-400"
        />
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="หน่วย"
          className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] outline-none focus:border-brand-400"
        />
      </div>
      <button
        onClick={handleAdd}
        disabled={!stockItemId || !price.trim()}
        className="w-full rounded-lg bg-brand-600 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
      >
        + บันทึกราคาใหม่
      </button>
      <p className="text-[10px] text-gray-400">* ราคาที่บันทึกใหม่จะไม่ลบราคาเก่า — เก็บเป็นประวัติราคาทั้งหมด</p>
    </div>
  );
}

// ============================================================================
// วันหยุดร้าน — วันที่ระบุจะข้ามการแจ้งเตือน "ยังไม่ได้ทำเช็กลิสต์"/"เลยเวลา" และสรุปปิดร้าน (owner/manager เท่านั้น) — เฟส 4
// ============================================================================
function StoreHolidaysSection({ storeHolidays, employeeId }: { storeHolidays: StoreHoliday[]; employeeId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');

  const upcoming = [...storeHolidays].sort((a, b) => a.date.localeCompare(b.date));

  function handleAdd() {
    if (!date) return;
    store.addStoreHoliday({ date, label: label.trim(), actorId: employeeId });
    setDate('');
    setLabel('');
    setShowAdd(false);
  }

  function handleRemove(id: string, label: string) {
    if (typeof window !== 'undefined' && !window.confirm(`ลบวันหยุดร้าน "${label}" ออกจากรายการ?`)) return;
    store.removeStoreHoliday(id, employeeId);
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <SectionTitle>วันหยุดร้าน ({upcoming.length} วัน)</SectionTitle>
        <button onClick={() => setShowAdd((v) => !v)} className="mb-3 text-[11px] font-semibold text-brand-600">
          {showAdd ? 'ยกเลิก' : '+ เพิ่มวันหยุด'}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-gray-400">วันที่ระบุจะข้ามการแจ้งเตือน &quot;ยังไม่ได้ทำเช็กลิสต์&quot;/&quot;เลยเวลา&quot; และสรุปปิดร้านของวันนั้น</p>
      {showAdd && (
        <div className="mb-3 space-y-1.5 rounded-xl bg-gray-50 p-2.5">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ชื่อวันหยุด เช่น วันสงกรานต์"
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <button
            onClick={handleAdd}
            disabled={!date}
            className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            เพิ่มวันหยุด
          </button>
        </div>
      )}
      <ul className="space-y-1">
        {upcoming.length === 0 && <li className="py-1 text-xs text-gray-300">ยังไม่มีวันหยุดร้านที่ตั้งไว้</li>}
        {upcoming.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2 border-b border-gray-50 py-1.5 text-xs last:border-0">
            <span className="min-w-0 flex-1 truncate text-gray-700">
              {formatThaiDate(h.date)}
              {h.label ? <span className="text-gray-400"> · {h.label}</span> : null}
            </span>
            <button
              onClick={() => handleRemove(h.id, h.label || formatThaiDate(h.date))}
              className="shrink-0 rounded-md bg-status-dangerBg px-1.5 py-0.5 text-[10px] font-semibold text-status-danger"
            >
              ลบ
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
