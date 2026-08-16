/**
 * API route (ฝั่งเซิร์ฟเวอร์เท่านั้น) — เพิ่มพนักงานใหม่พร้อมบัญชีล็อกอิน (Supabase Auth: email/password)
 *
 * ต้องทำฝั่งเซิร์ฟเวอร์เพราะการสร้างบัญชี Auth ให้ "คนอื่น" (ไม่ใช่ตัวเอง) ต้องใช้
 * supabase.auth.admin.createUser() ซึ่งใช้ได้เฉพาะกับ service role key เท่านั้น
 * (ห้ามใส่ service role key ฝั่ง client เด็ดขาด เพราะมีสิทธิ์เต็มข้ามทุกตาราง/RLS)
 *
 * ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน .env.local (หาได้จาก Supabase Dashboard
 * > Project Settings > API > service_role key) — ค่านี้ต่างจาก NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const AVATAR_PALETTE = ['#EA580C', '#0EA5E9', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6'];

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

  // ใช้ service role client ตรวจสอบตัวตนผู้เรียก + ทำการเขียนข้อมูล (bypass RLS แต่ตรวจสิทธิ์เองในโค้ดนี้แทน)
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
    return NextResponse.json({ error: 'เฉพาะเจ้าของร้านเท่านั้นที่เพิ่มพนักงานใหม่ได้' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, { status: 400 });
  }

  const name = String(body?.name ?? '').trim();
  const nickname = String(body?.nickname ?? '').trim();
  const role = String(body?.role ?? '');
  const stationId = body?.stationId ? String(body.stationId) : null;
  const email = String(body?.email ?? '').trim();
  const password = String(body?.password ?? '');

  if (!name || !nickname || !email || !password) {
    return NextResponse.json({ error: 'กรอกข้อมูลไม่ครบ' }, { status: 400 });
  }
  if (!['owner', 'manager', 'staff'].includes(role)) {
    return NextResponse.json({ error: 'สิทธิ์ไม่ถูกต้อง' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // ยืนยันบัญชีทันที — เจ้าของกำหนดอีเมล/รหัสผ่านให้พนักงานโดยตรง ไม่ต้องรอพนักงานกดยืนยันอีเมล
  });
  if (createErr || !created.user) {
    const msg = createErr?.message?.toLowerCase().includes('already registered')
      ? 'อีเมลนี้มีบัญชีอยู่แล้วในระบบ'
      : createErr?.message ?? 'สร้างบัญชีไม่สำเร็จ';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { count } = await admin.from('employees').select('id', { count: 'exact', head: true });
  const avatarColor = AVATAR_PALETTE[(count ?? 0) % AVATAR_PALETTE.length];

  const { data: empRow, error: empErr } = await admin
    .from('employees')
    .insert({
      auth_user_id: created.user.id,
      name,
      nickname,
      role,
      station_id: stationId,
      active: true,
      avatar_color: avatarColor,
    })
    .select()
    .single();

  if (empErr) {
    // rollback บัญชี auth ที่สร้างไว้ ไม่ให้ค้างเป็นบัญชีกำพร้า (ไม่ผูกกับพนักงานคนไหน)
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: `สร้างพนักงานไม่สำเร็จ: ${empErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, employee: empRow });
}
