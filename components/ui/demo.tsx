'use client';

import { useEffect, useState } from 'react';
import { Calculator, CircleHelp, HomeIcon, ListChecks, Mail, Moon, ScanLine, Sun } from 'lucide-react';
import { Dock, DockIcon, DockItem, DockLabel } from '@/components/ui/dock';

type Theme = 'light' | 'dark';

function useCompactDock() {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return compact;
}

export function AppleStyleDock() {
  const compact = useCompactDock();
  const [hash, setHash] = useState(() => window.location.hash || '#home');
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');

  useEffect(() => {
    const update = () => setHash(window.location.hash || '#home');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171717' : '#ffffff');
    try { localStorage.setItem('zeramaill.theme', theme); } catch { /* Theme still works when storage is unavailable. */ }
  }, [theme]);

  const items = [
    { title: 'หน้าแรก', Icon: HomeIcon, href: '#home' },
    { title: 'ส่งอีเมล', Icon: Mail, onClick: () => document.querySelector<HTMLButtonElement>('.hero-actions [data-open-submit]')?.click(), primary: true },
    { title: 'รายการของฉัน', Icon: ListChecks, href: '#orders' },
    { title: 'วิธีขายอีเมล', Icon: ScanLine, href: '#how-it-works' },
    { title: 'ราคาประเมิน', Icon: Calculator, href: '#pricing' },
    { title: 'คำถามที่พบบ่อย', Icon: CircleHelp, href: '#faq' },
    { title: theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด', Icon: theme === 'dark' ? Sun : Moon, onClick: () => setTheme(current => current === 'dark' ? 'light' : 'dark') },
  ];

  return (
    <nav className="zera-dock-position fixed bottom-2 left-1/2 max-w-full -translate-x-1/2" aria-label="ทางลัด Zeramaill">
      <Dock className="zera-dock-panel items-end pb-3" magnification={compact ? 54 : 76} baseItemSize={compact ? 36 : 42} distance={compact ? 90 : 150} panelHeight={compact ? 60 : 68} ariaLabel="เมนูลัด Zeramaill">
        {items.map(item => (
          <DockItem key={item.href ?? (item.primary ? 'send' : 'theme')} href={item.href} onClick={item.onClick} label={item.title} active={!!item.href && item.href === hash} className={`zera-dock-item aspect-square rounded-md bg-secondary${item.primary ? ' zera-dock-primary' : ''}`}>
            <DockLabel>{item.title}</DockLabel>
            <DockIcon><item.Icon className="h-full w-full" strokeWidth={1.65} /></DockIcon>
          </DockItem>
        ))}
      </Dock>
    </nav>
  );
}
