import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { Menu, Search, MessageSquare, ChevronDown, Sun, Moon, Languages, Command } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useLogout } from '@workspace/api-client-react';
import logoPath from '@assets/1000034141-removebg-preview_1785699198526.png';
import { useI18n } from '@/context/i18n';
import { useTheme } from '@/components/theme-provider';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useLocation();
  const { admin, logout: authLogout } = useAuth();
  const logoutMutation = useLogout();
  const { language, setLanguage, dir } = useI18n();
  const { theme, setTheme } = useTheme();
  const adminName = `${admin?.firstName ?? ''} ${admin?.lastName ?? ''}`.trim() || admin?.username || 'Admin';
  const initials = adminName.slice(0, 2).toUpperCase();

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location]);
  useEffect(() => { setProfileOpen(false); }, [location]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const openDrawer  = useCallback(() => setDrawerOpen(true),  []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = search.trim();
    if (value) setLocation(`/search?q=${encodeURIComponent(value)}`);
  };

  return (
    <div dir={dir} className="flex h-[100dvh] w-full overflow-hidden bg-[hsl(var(--background))]">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col flex-shrink-0">
        <Sidebar />
      </aside>

      {/* ── Mobile Drawer ── */}
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={closeDrawer}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      </div>

      {/* Sliding panel */}
      <div
        className={`fixed top-0 end-0 h-full z-50 md:hidden transform transition-transform duration-300 ease-in-out shadow-2xl ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <Sidebar onClose={closeDrawer} />
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top header — all screen sizes */}
        <header className="flex h-[76px] flex-shrink-0 items-center gap-3 border-b border-border/70 bg-background/90 px-3 backdrop-blur-xl sm:px-6 md:px-8">
          <div className="flex items-center gap-2">
            {/* Hamburger — mobile only */}
            <button
              onClick={openDrawer}
              data-testid="button-open-menu"
               className="tap-target rounded-xl p-2 transition-colors hover:bg-muted active:bg-muted/80"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Logo — mobile only */}
            <img
              src={logoPath}
              alt="DHD Livraison"
              className="h-8 object-contain md:hidden"
            />
          </div>

           <div className="hidden min-w-[170px] items-center gap-2 md:flex">
             <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <span className="text-primary text-sm font-extrabold">D</span>
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-foreground">لوحة الإدارة</p>
              <p className="text-[10px] text-muted-foreground">DHD Livraison</p>
            </div>
          </div>
           <form onSubmit={submitSearch} className="relative mx-auto hidden max-w-xl flex-1 sm:flex">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <input data-testid="input-global-search" aria-label="بحث" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث في النظام..." className="h-11 w-full rounded-2xl border border-border/60 bg-muted/65 pe-14 ps-11 text-sm outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/25" />
            <span className="absolute end-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded-md px-1.5 py-0.5"><Command className="h-3 w-3" /> K</span>
          </form>
           <div className="ms-auto flex items-center gap-1.5">
            <NotificationBell />
            <button data-testid="button-messages" aria-label="الرسائل والإشعارات" onClick={() => setLocation('/notifications')} className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-colors"><MessageSquare className="h-4 w-4" /></button>
            <button data-testid="button-language" aria-label="تغيير اللغة" onClick={() => setLanguage(language === 'ar' ? 'fr' : language === 'fr' ? 'en' : 'ar')} className="hidden lg:flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-colors"><Languages className="h-4 w-4" /></button>
            <button data-testid="button-theme" aria-label="تبديل الوضع" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="hidden lg:flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-colors">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <div className="relative">
              <button data-testid="button-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)} className="flex items-center gap-2 rounded-2xl p-1.5 pe-2 hover:bg-muted transition-colors">
                 <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm">{initials}</span>
                <span className="hidden lg:block text-sm font-semibold max-w-28 truncate text-start">{adminName}</span>
                <ChevronDown className={`hidden lg:block h-4 w-4 text-muted-foreground transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>
              {profileOpen && <div className="absolute end-0 top-full mt-2 z-50 w-56 rounded-2xl bg-popover border border-border shadow-xl p-2 animate-in fade-in slide-in-from-top-2">
                <div className="px-3 py-2.5 mb-1 rounded-xl bg-muted/60"><p className="text-xs text-muted-foreground">مسجل الدخول باسم</p><p className="text-sm font-bold truncate">{adminName}</p></div>
                <Link data-testid="link-profile-settings" href="/settings" className="block rounded-xl px-3 py-2.5 text-sm hover:bg-muted">الإعدادات</Link>
                <button data-testid="button-logout" onClick={() => logoutMutation.mutate(undefined, { onSuccess: authLogout })} disabled={logoutMutation.isPending} className="w-full text-start rounded-xl px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">تسجيل الخروج</button>
              </div>}
            </div>
          </div>
        </header>

        {/* Page content */}
         <div className="flex-1 overflow-y-auto bg-[hsl(var(--background))] p-4 sm:p-5 md:p-7 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
