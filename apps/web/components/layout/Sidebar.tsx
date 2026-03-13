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
];

export function Sidebar() {
  const pathname = usePathname();
  const supabase = createClient();
  const { household, member, reset } = useAuthStore();

  async function handleSignOut(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    await supabase.auth.signOut();
    reset();
    window.location.href = '/auth/login';
  }

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-60 bg-[#1A1714] flex flex-col z-50">
      {/* Logo */}
      <div className="px-6 py-7 border-b border-white/8">
        <h1 className="font-serif text-xl text-white tracking-tight">HomeBase</h1>
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
      <nav className="flex-1 py-3">
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
