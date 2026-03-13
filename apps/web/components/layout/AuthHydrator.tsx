'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@homebase/store';
import type { Household, Member } from '@homebase/types';

export function AuthHydrator({
  member,
  household,
}: {
  member: Member;
  household: Household;
}) {
  const { setMember, setHousehold } = useAuthStore();

  useEffect(() => {
    setMember(member);
    setHousehold(household);
  }, [member, household, setMember, setHousehold]);

  return null;
}
