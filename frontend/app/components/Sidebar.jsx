'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Database,
  Settings2,
  FlaskConical,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',            label: 'Dashboard',          icon: LayoutDashboard },
  { href: '/shipments',   label: 'Shipments',          icon: Package },
  { href: '/cache',       label: 'Cache Intelligence', icon: Database },
  { href: '/policy',      label: 'Policy Studio',      icon: Settings2 },
  { href: '/benchmark',   label: 'Benchmark',          icon: FlaskConical },
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
          <Image src="/flashchain-logo.png" alt="FlashChain" width={120} height={32} className="rounded" />
        </div>
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
