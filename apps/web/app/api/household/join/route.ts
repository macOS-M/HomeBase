import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const inviteCode = String(body?.inviteCode ?? '').trim().toUpperCase();
  const memberName = String(body?.memberName ?? '').trim();

  if (!inviteCode || !memberName || !user.email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { error: joinError } = await supabase.rpc('join_household_with_invite', {
    p_invite_code: inviteCode,
    p_member_name: memberName,
    p_member_email: user.email,
  });

  if (joinError) {
    if (joinError.message.includes('INVALID_INVITE_CODE')) {
      return NextResponse.json(
        { error: 'Invalid invite code. Check with your household admin.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: joinError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
