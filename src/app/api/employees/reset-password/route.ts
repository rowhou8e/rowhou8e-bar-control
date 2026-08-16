/**
 * API route (ฝั่งเซิร์ฟเวอร์เท่านั้น) — เจ้าของร้านตั้งรหัสผ่านใหม่ให้พนักงานคนอื่น (โหมด Supabase เท่านั้น)
 *
 * เหตุผลที่ต้องทำฝั่งเซิร์ฟเวอร์: การเปลี่ยนรหัสผ่านบัญชี "คนอื่น" (ไม่ใช่ตัวเอง) ต้องใช้
 * supabase.auth.admin.updateUserById() ซึ่งใช้ได้เฉพาะกับ service role key เท่านั้น
 * (ห้ามใส่ service role key ฝั่ง client เด็ดขาด เพราะมีสิทธิ์เต็มข้ามทุกตาราง/RLS)
 *
 * ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน .env.local (เหมือนกับ /api/employees/create)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — กรุณาติดต่อผู้ดูแลระบบให้ใส่ค่านี้ใน .env.local' },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });
  }

  const { data: callerEmp } = await admin
    .from('employees')
    .select('role, active')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!callerEmp || callerEmp.role !== 'owner' || !callerEmp.active) {
    return NextResponse.json({ error: 'เฉพาะเจ้าของร้านเท่านั้นที่รีเซ็ตรหัสผ่านพนักงานได้' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, { status: 400 });
  }

  const employeeId = String(body?.employeeId ?? '');
  const newPassword = String(body?.newPassword ?? '');
  if (!employeeId || !newPassword) {
    return NextResponse.json({ error: 'กรอกข้อมูลไม่ครบ' }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  }

  const { data: targetEmp, error: targetErr } = await admin
    .from('employees')
    .select('id, name, auth_user_id')
    .eq('id', employeeId)
    .maybeSingle();
  if (targetErr || !targetEmp) {
    return NextResponse.json({ error: 'ไม่พบพนักงานคนนี้' }, { status: 404 });
  }
  if (!targetEmp.auth_user_id) {
    return NextResponse.json({ error: 'พนักงานคนนี้ยังไม่มีบัญชีล็อกอิน (auth) ผูกอยู่ — รีเซ็ตรหัสผ่านไม่ได้' }, { status: 400 });
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(targetEmp.auth_user_id, {
    password: newPassword,
  });
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message ?? 'รีเซ็ตรหัสผ่านไม่สำเร็จ' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
