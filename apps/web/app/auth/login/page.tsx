'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function getCallbackUrl(nextPath: string) {
    const normalizedNext = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
    return `${location.origin}/auth/callback?next=${encodeURIComponent(normalizedNext)}`;
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getCallbackUrl('/dashboard') },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getCallbackUrl('/dashboard') },
    });

    if (error) {
      const message = error.message?.toLowerCase() ?? '';

      if (message.includes('provider is not enabled')) {
        setError('Google sign-in is not enabled for this project yet. Use email magic link or enable Google in Supabase Auth Providers.');
      } else if (message.includes('missing oauth secret')) {
        setError('Google sign-in is missing its OAuth client secret in Supabase. Add the Google Client ID and Client Secret in Supabase Auth Providers.');
      } else {
        setError(error.message);
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F2EC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-serif text-[#1A1714] tracking-tight">HomeBase</h1>
          <p className="text-[#6B6560] text-sm mt-2">Shared budgeting for your household</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#E2DDD6] shadow-sm p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">📬</div>
              <h2 className="font-semibold text-[#1A1714] mb-2">Check your email</h2>
              <p className="text-[#6B6560] text-sm">
                We sent a magic link to <strong>{email}</strong>. Click it to sign in.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-6 text-sm text-[#2D5F3F] font-medium hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-semibold text-[#1A1714] text-lg mb-6">Sign in</h2>

              {/* Google */}
              <button
                onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-3 py-2.5 border border-[#E2DDD6] rounded-lg text-sm font-medium text-[#1A1714] hover:bg-[#F5F2EC] transition-colors mb-5"
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-[#E2DDD6]" />
                <span className="text-xs text-[#9B9590]">or</span>
                <div className="flex-1 h-px bg-[#E2DDD6]" />
              </div>

              {/* Magic link */}
              <form onSubmit={handleMagicLink} className="space-y-4">
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

                {error && (
                  <p className="text-xs text-[#C84B31]">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-[#2D5F3F] text-white rounded-lg text-sm font-medium hover:bg-[#245234] transition-colors disabled:opacity-60"
                >
                  {loading ? 'Sending...' : 'Send magic link'}
                </button>
              </form>

              <p className="text-center text-xs text-[#9B9590] mt-5">
                No account yet?{' '}
                <a href="/auth/join" className="text-[#2D5F3F] font-medium hover:underline">
                  Join a household
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
