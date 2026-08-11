import React, { memo } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import {
  LayoutDashboard, Building2, Users, Clock, Banknote,
  Bell, Settings, LogOut, Moon, Sun, X,
  ShieldAlert, UserX, ClipboardList,
  BarChart3,
} from 'lucide-react';
import { useLogout } from '@workspace/api-client-react';
import { useTheme } from '@/components/theme-provider';
import logoPath from '@assets/1000034141-removebg-preview_1785699198526.png';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  onClose?: () => void;
}

const NAV_ITEMS = [
  { href: '/dashboard',        icon: LayoutDashboard, labelKey: 'nav.dashboard'        },
  { href: '/offices',          icon: Building2,       labelKey: 'nav.offices'           },
  { href: '/employees',        icon: Users,           labelKey: 'nav.employees'         },
  { href: '/former-employees', icon: UserX,           labelKey: 'nav.former_employees'  },
  { href: '/attendance',       icon: Clock,           labelKey: 'nav.attendance'        },
  { href: '/salaries',         icon: Banknote,        labelKey: 'nav.salaries'          },
  { href: '/requests',         icon: ClipboardList,   labelKey: 'nav.requests'          },
  { href: '/violations',       icon: ShieldAlert,     labelKey: 'nav.violations'        },
  { href: '/statistics',       icon: BarChart3,       labelKey: 'nav.statistics'        },
  { href: '/notifications',    icon: Bell,            labelKey: 'nav.notifications'     },
  { href: '/settings',         icon: Settings,        labelKey: 'nav.settings'          },
] as const;

export const Sidebar = memo(function Sidebar({ onClose }: SidebarProps) {
  const [location] = useLocation();
  const { logout: authLogout, admin } = useAuth();
  const { t, language, setLanguage, dir } = useI18n();
  const logoutMutation = useLogout();
  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => authLogout() });
  };

  const adminName = admin
    ? `${(admin as any).firstName || ''} ${(admin as any).lastName || ''}`.trim() || admin.username
    : '';

  return (
    <div dir={dir} className="w-[272px] bg-sidebar border-s border-sidebar-border flex flex-col h-full flex-shrink-0 text-sidebar-foreground shadow-[10px_0_30px_rgba(15,23,42,.04)]">

      {/* ── Header ── */}
      <div className="relative border-b border-sidebar-border px-5 py-6">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 end-3 p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
         <div className="flex w-full items-center gap-3">
           <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
            <img src={logoPath} alt="DHD Livraison" className="h-8 w-8 object-contain brightness-0 invert" />
          </div>
          <div className="text-start leading-tight">
             <p className="text-base font-bold tracking-tight">DHD Livraison</p>
             <p className="mt-0.5 text-[10px] text-sidebar-foreground/55">إدارة الموارد البشرية</p>
          </div>
        </div>
        {adminName && (
           <p className="mt-4 max-w-full truncate border-t border-sidebar-border pt-3 text-xs text-sidebar-foreground/60">
            {adminName}
          </p>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/35">القائمة الرئيسية</p>
        {NAV_ITEMS.map(({ href, icon: Icon, labelKey }) => {
          const active = location.startsWith(href);
          return (
            <Link key={href} href={href} onClick={onClose} className="block">
              <div
                className={cn(
                   'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 select-none',
                  active
                    ? 'bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20'
                     : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                   <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors', active ? 'bg-white/15' : 'bg-sidebar-accent/70 group-hover:bg-sidebar-accent')}><Icon className={cn('h-[17px] w-[17px] flex-shrink-0', active ? 'opacity-100' : 'opacity-65')} /></span>
                <span>{t(labelKey as any)}</span>
                {active && (
                    <div className="ms-auto w-1.5 h-1.5 rounded-full bg-primary-foreground opacity-80" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-3">
        {/* Language + theme row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 bg-sidebar-accent/60 p-1 rounded-xl flex-1">
            {(['ar', 'fr', 'en'] as const).map((lang) => (
              <Button
                key={lang}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 flex-1 px-0 text-xs font-medium rounded-md transition-all',
                  language === lang
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-background/50',
                )}
                onClick={() => setLanguage(lang)}
              >
                {lang.toUpperCase()}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-xl h-9 w-9 flex-shrink-0 hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-destructive/10 text-destructive/80 hover:text-destructive transition-all duration-150 text-sm font-medium disabled:opacity-50"
        >
          <LogOut className="h-[18px] w-[18px]" />
          <span>{t('nav.logout')}</span>
        </button>
      </div>
    </div>
  );
});
