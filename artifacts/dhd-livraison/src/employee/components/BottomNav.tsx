import { Link, useLocation } from "wouter";
import { Home, BarChart3, FileText, User } from "lucide-react";
import { useI18n } from "@/context/i18n";
import { cn } from "@/lib/utils";

const items = [
  { href: "/portal",            icon: Home,         key: "emp.nav.home",       exact: true },
  { href: "/portal/stats",      icon: BarChart3,    key: "emp.nav.stats"                   },
  { href: "/portal/requests",   icon: FileText,     key: "emp.nav.requests"                },
  { href: "/portal/account",    icon: User,         key: "emp.nav.account"                 },
] as const;

export function BottomNav() {
  const { t } = useI18n();
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 safe-bottom">
      <div className="mx-auto grid max-w-lg grid-cols-4 px-2">
        {items.map((item) => {
          const { href, icon: Icon, key } = item;
          const active = ('exact' in item && item.exact) ? location === href : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-[4.25rem] flex-col items-center gap-1 pt-2.5 pb-2 text-[10px] sm:text-[11px] font-medium transition-all relative",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {/* Active indicator dot */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
              )}
              {/* Icon with background when active */}
              <span
                className={cn(
                  "flex items-center justify-center w-10 h-8 rounded-2xl transition-all duration-200",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "",
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "stroke-[2.5]" : "stroke-2")} />
              </span>
              <span className={cn("leading-none", active ? "font-semibold" : "")}>{t(key as any)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
