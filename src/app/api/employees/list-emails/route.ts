/**
 * API route (ฝั่งเซิร์ฟเวอร์เท่านั้น) — เจ้าของร้านดูอีเมลที่พนักงานแต่ละคนใช้ล็อกอิน (โหมด Supabase เท่านั้น)
 *
 * เหตุผลที่ต้องทำฝั่งเซิร์ฟเวอร์: อีเมลของบัญชี Supabase Auth ("คนอื่น") ไม่ได้เก็บซ้ำไว้ใน
 * ตาราง public.employees (มีแค่ auth_user_id ผูกไว้) การจะอ่านอีเมลจริงต้องใช้
 * supabase.auth.admin.listUsers() ซึ่งใช้ได้เฉพาะกับ service role key เท่านั้น
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
    return NextResponse.json({ error: 'เฉพาะเจ้าของร้านเท่านั้นที่ดูอีเมลพนักงานคนอื่นได้' }, { status: 403 });
  }

  const { data: emps, error: empsErr } = await admin.from('employees').select('id, auth_user_id');
  if (empsErr) {
    return NextResponse.json({ error: empsErr.message ?? 'ดึงรายชื่อพนักงานไม่สำเร็จ' }, { status: 500 });
  }

  // รวบรวมอีเมลของทุกบัญชี Supabase Auth ในโปรเจกต์ (แบ่งหน้า) แล้วจับคู่กับ auth_user_id ของแต่ละพนักงาน
  const emailByAuthUserId = new Map<string, string>();
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 10; i += 1) {
    const { data: page_data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
    if (listErr) {
      return NextResponse.json({ error: listErr.message ?? 'ดึงรายชื่ออีเมลไม่สำเร็จ' }, { status: 500 });
    }
    for (const u of page_data.users) {
      if (u.email) emailByAuthUserId.set(u.id, u.email);
    }
    if (page_data.users.length < perPage) break;
    page += 1;
  }

  const emails: Record<string, string> = {};
  for (const emp of emps ?? []) {
    if (emp.auth_user_id && emailByAuthUserId.has(emp.auth_user_id)) {
      emails[emp.id] = emailByAuthUserId.get(emp.auth_user_id)!;
    }
  }

  return NextResponse.json({ emails });
}
