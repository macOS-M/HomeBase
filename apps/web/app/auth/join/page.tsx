'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'choose' | 'create' | 'join';

export default function JoinPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create form
  const [householdName, setHouseholdName] = useState('');
  const [yourName, setYourName] = useState('');

  // Join form
  const [inviteCode, setInviteCode] = useState('');
  const [joinName, setJoinName] = useState('');

  async function safeJson(response: Response) {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/household/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        householdName,
        memberName: yourName,
      }),
    });

    const result = await safeJson(response);

    if (!response.ok) {
      if (response.status === 401) {
        router.push('/auth/login');
        return;
      }

      setError((result as any)?.error ?? 'Unable to create household.');
      setLoading(false);
      return;
    }

    window.location.href = '/dashboard';
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/household/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteCode,
        memberName: joinName,
      }),
    });

    const result = await safeJson(response);

    if (!response.ok) {
      if (response.status === 401) {
        router.push('/auth/login');
        return;
      }

      setError((result as any)?.error ?? 'Unable to join household.');
      setLoading(false);
      return;
    }

    window.location.href = '/dashboard';
  }

  return (
    <div className="min-h-[100dvh] bg-[#F5F2EC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-serif text-[#1A1714] tracking-tight">HomeBase</h1>
          <p className="text-[#6B6560] text-sm mt-2">Set up your household</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2DDD6] shadow-sm p-8">
          {mode === 'choose' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-[#1A1714] text-lg mb-6">Get started</h2>
              <button
                onClick={() => setMode('create')}
                className="w-full p-4 border border-[#E2DDD6] rounded-xl text-left hover:border-[#2D5F3F] hover:bg-[#EAF2ED] transition-all group"
              >
                <div className="font-medium text-[#1A1714] flex items-center gap-2">
                  🏠 Create a household
                </div>
                <div className="text-xs text-[#9B9590] mt-1">Start fresh and invite your household members</div>
              </button>
              <button
                onClick={() => setMode('join')}
                className="w-full p-4 border border-[#E2DDD6] rounded-xl text-left hover:border-[#2D5F3F] hover:bg-[#EAF2ED] transition-all"
              >
                <div className="font-medium text-[#1A1714] flex items-center gap-2">
                  🔑 Join with invite code
                </div>
                <div className="text-xs text-[#9B9590] mt-1">Someone already set up a household for you</div>
              </button>
            </div>
          )}

          {mode === 'create' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex items-center gap-2 mb-6">
                <button type="button" onClick={() => setMode('choose')} className="text-[#9B9590] hover:text-[#1A1714]">←</button>
                <h2 className="font-semibold text-[#1A1714] text-lg">Create household</h2>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6560] mb-1.5">Household name</label>
                <input type="text" required value={householdName} onChange={e => setHouseholdName(e.target.value)}
                  placeholder="e.g. The Oak Street House"
                  className="w-full px-3.5 py-2.5 border border-[#E2DDD6] rounded-lg text-sm focus:outline-none focus:border-[#2D5F3F] transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6560] mb-1.5">Your name</label>
                <input type="text" required value={yourName} onChange={e => setYourName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full px-3.5 py-2.5 border border-[#E2DDD6] rounded-lg text-sm focus:outline-none focus:border-[#2D5F3F] transition-colors" />
              </div>
              {error && <p className="text-xs text-[#C84B31]">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-[#2D5F3F] text-white rounded-lg text-sm font-medium hover:bg-[#245234] transition-colors disabled:opacity-60">
                {loading ? 'Creating...' : 'Create household'}
              </button>
            </form>
          )}

          {mode === 'join' && (
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="flex items-center gap-2 mb-6">
                <button type="button" onClick={() => setMode('choose')} className="text-[#9B9590] hover:text-[#1A1714]">←</button>
                <h2 className="font-semibold text-[#1A1714] text-lg">Join household</h2>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6560] mb-1.5">Invite code</label>
                <input type="text" required value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                  placeholder="e.g. XK92BF" maxLength={6}
                  className="w-full px-3.5 py-2.5 border border-[#E2DDD6] rounded-lg text-sm font-mono uppercase focus:outline-none focus:border-[#2D5F3F] transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6560] mb-1.5">Your name</label>
                <input type="text" required value={joinName} onChange={e => setJoinName(e.target.value)}
                  placeholder="e.g. Jordan"
                  className="w-full px-3.5 py-2.5 border border-[#E2DDD6] rounded-lg text-sm focus:outline-none focus:border-[#2D5F3F] transition-colors" />
              </div>
              {error && <p className="text-xs text-[#C84B31]">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-[#2D5F3F] text-white rounded-lg text-sm font-medium hover:bg-[#245234] transition-colors disabled:opacity-60">
                {loading ? 'Joining...' : 'Join household'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
