'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@homebase/store';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/dashboard',   icon: '🏠', label: 'Dashboard'    },
  { href: '/expenses',    icon: '📋', label: 'Expenses'     },
  { href: '/categories',  icon: '🏷️', label: 'Categories'   },
  { href: '/grocery',     icon: '🛒', label: 'Grocery'      },
  { href: '/bills',       icon: '⚡', label: 'Bills'        },
  { href: '/balances',    icon: '⚖️', label: 'Balances'     },
  { href: '/wallet',      icon: '💰', label: 'Wallet'       },
  { href: '/members',     icon: '👥', label: 'Members'      },
  { href: '/settings',    icon: '⚙️', label: 'Settings'     },
];

const mobileNavItems = [
  { href: '/dashboard', icon: '🏠', label: 'Home' },
  { href: '/expenses', icon: '📋', label: 'Expenses' },
  { href: '/bills', icon: '⚡', label: 'Bills' },
  { href: '/balances', icon: '⚖️', label: 'Balances' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { household, member, reset } = useAuthStore();

  async function handleSignOut(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
    }
    reset();
    window.location.href = '/auth/login';
  }

  return (
    <>
      <input id="mobile-nav-toggle" type="checkbox" className="peer sr-only" />

      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#1A1714] border-b border-white/8 z-[120] flex items-center justify-between px-4">
        <label
          htmlFor="mobile-nav-toggle"
          className="w-9 h-9 rounded-lg border border-white/15 text-white/80 hover:text-white hover:border-white/30"
          aria-label="Toggle navigation"
          role="button"
        >
          <span className="w-full h-full flex items-center justify-center">☰</span>
        </label>
        <h1 className="font-serif text-lg text-white tracking-tight">HomeBase</h1>
        <div className="w-9 h-9" />
      </div>

      <label
        htmlFor="mobile-nav-toggle"
        aria-label="Close navigation"
        className="md:hidden fixed inset-0 bg-black/45 z-[110] opacity-0 pointer-events-none peer-checked:opacity-100 peer-checked:pointer-events-auto"
      />

      <aside
        className="fixed top-0 left-0 bottom-0 w-60 bg-[#1A1714] flex flex-col z-[130] transform transition-transform duration-200 -translate-x-full pointer-events-none peer-checked:translate-x-0 peer-checked:pointer-events-auto md:translate-x-0 md:pointer-events-auto"
      >
      {/* Logo */}
      <div className="px-6 py-7 border-b border-white/8">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-xl text-white tracking-tight">HomeBase</h1>
          <label
            htmlFor="mobile-nav-toggle"
            className="md:hidden w-8 h-8 rounded-lg border border-white/15 text-white/70"
            aria-label="Close menu"
            role="button"
          >
            <span className="w-full h-full flex items-center justify-center">✕</span>
          </label>
        </div>
        <span className="text-[11px] text-white/40 mt-0.5 block">Household Budget</span>
      </div>

      {/* Household badge */}
      {household && (
        <div className="mx-4 mt-4 bg-white/7 rounded-xl p-3">
          <p className="text-[13px] text-white/80 font-medium truncate">{household.name}</p>
          <p className="text-[11px] text-white/35 mt-0.5">Invite: {household.invite_code}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <p className="text-[10px] uppercase tracking-widest text-white/25 px-6 pt-4 pb-1.5 font-semibold">Overview</p>
        {navItems.slice(0, 2).map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}

        <p className="text-[10px] uppercase tracking-widest text-white/25 px-6 pt-5 pb-1.5 font-semibold">Budget</p>
        {navItems.slice(2, 4).map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}

        <p className="text-[10px] uppercase tracking-widest text-white/25 px-6 pt-5 pb-1.5 font-semibold">Bills & Money</p>
        {navItems.slice(4, 7).map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}

        <p className="text-[10px] uppercase tracking-widest text-white/25 px-6 pt-5 pb-1.5 font-semibold">Settings</p>
        {navItems.slice(7).map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-white/8">
        <div className="flex items-center gap-2 px-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-[#2D5F3F] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {member?.name?.[0] ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-white/80 font-medium truncate">{member?.name ?? 'You'}</p>
            <p className="text-[11px] text-white/35 capitalize">{member?.role}</p>
          </div>
        </div>
        <Link
          href="/auth/login"
          onClick={handleSignOut}
          className="block w-full text-center text-[13px] text-white/40 hover:text-white/70 transition-colors py-1"
        >
          Sign out
        </Link>
      </div>
    </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100] border-t border-white/10 bg-[#1A1714] px-1 py-1.5 flex items-center justify-between">
        {mobileNavItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 mx-0.5 rounded-lg py-1.5 text-center text-[11px] transition-colors ${
                active ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white/85'
              }`}
            >
              <span className="block text-sm leading-4">{item.icon}</span>
              <span className="block mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-5 py-2.5 mx-0 text-sm transition-all border-l-[3px] ${
        active
          ? 'text-white bg-white/8 border-l-[#E8A020] font-medium'
          : 'text-white/50 border-transparent hover:text-white/85 hover:bg-white/4'
      }`}
    >
      <span className="w-5 text-center">{icon}</span>
      {label}
    </Link>
  );
}
