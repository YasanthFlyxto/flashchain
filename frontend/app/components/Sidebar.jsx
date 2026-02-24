'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Database,
  Settings2,
  BarChart3,
  Zap
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',           label: 'Dashboard',          icon: LayoutDashboard },
  { href: '/shipments',  label: 'Shipments',          icon: Package },
  { href: '/cache',      label: 'Cache Intelligence', icon: Database },
  { href: '/policy',     label: 'Policy Studio',      icon: Settings2 },
  { href: '/analytics',  label: 'Analytics',          icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-64 min-h-screen flex flex-col flex-shrink-0"
      style={{ backgroundColor: '#1e3a5f' }}
    >
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Zap size={22} className="text-cyan-400" />
          <span className="text-white font-semibold text-lg tracking-tight">FlashChain</span>
        </div>
        <p className="text-white/40 text-xs mt-1">Supply Chain Manager</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150
                ${active
                  ? 'text-white font-medium'
                  : 'text-white/60 hover:text-white'
                }`}
              style={active ? { backgroundColor: 'rgba(255,255,255,0.15)' } : undefined}
            >
              <Icon size={18} className={active ? 'text-cyan-400' : ''} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/10">
        <p className="text-white/30 text-xs">FlashChain SCM · w1954076</p>
      </div>
    </aside>
  );
}
