'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const supabase = createClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  function getCallbackUrl(nextPath: string) {
    const normalizedNext = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
    return `${location.origin}/auth/callback?next=${encodeURIComponent(normalizedNext)}`;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getCallbackUrl('/auth/join'),
        data: {
          full_name: name,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      window.location.href = '/auth/join';
      return;
    }

    setSuccessMessage('Account created. Check your email to confirm your account, then sign in.');
    setLoading(false);
  }

  return (
    <div className="min-h-[100dvh] bg-[#F5F2EC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-serif text-[#1A1714] tracking-tight">HomeBase</h1>
          <p className="text-[#6B6560] text-sm mt-2">Create your account</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2DDD6] shadow-sm p-8">
          <h2 className="font-semibold text-[#1A1714] text-lg mb-6">Register</h2>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#6B6560] mb-1.5">
                Your name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full px-3.5 py-2.5 border border-[#E2DDD6] rounded-lg text-sm text-[#1A1714] placeholder-[#9B9590] focus:outline-none focus:border-[#2D5F3F] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6560] mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 border border-[#E2DDD6] rounded-lg text-sm text-[#1A1714] placeholder-[#9B9590] focus:outline-none focus:border-[#2D5F3F] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6560] mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3.5 py-2.5 border border-[#E2DDD6] rounded-lg text-sm text-[#1A1714] placeholder-[#9B9590] focus:outline-none focus:border-[#2D5F3F] transition-colors"
              />
            </div>

            {error && <p className="text-xs text-[#C84B31]">{error}</p>}
            {successMessage && <p className="text-xs text-[#2D5F3F]">{successMessage}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#2D5F3F] text-white rounded-lg text-sm font-medium hover:bg-[#245234] transition-colors disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-xs text-[#9B9590] mt-5">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-[#2D5F3F] font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
