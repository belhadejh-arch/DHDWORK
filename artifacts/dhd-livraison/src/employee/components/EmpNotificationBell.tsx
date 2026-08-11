import React, { useCallback } from 'react';
import { Bell, CheckCircle2, Info, CalendarClock, Palmtree, Wallet, ShieldAlert } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { empFetch } from '../api';
import { formatDistanceToNow, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { useI18n } from '@/context/i18n';

interface EmpNotif {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function notifIcon(type: string) {
  switch (type) {
    case 'advance_request':  return <Wallet className="h-4 w-4 text-amber-500" />;
    case 'leave_request':    return <CalendarClock className="h-4 w-4 text-emerald-500" />;
    case 'vacation_request': return <Palmtree className="h-4 w-4 text-teal-500" />;
    case 'violation_added':  return <ShieldAlert className="h-4 w-4 text-red-500" />;
    default:                 return <Info className="h-4 w-4 text-slate-500" />;
  }
}

export function EmpNotificationBell() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery<EmpNotif[]>({
    queryKey: ['employee', 'notifications'],
    queryFn: () => empFetch<EmpNotif[]>('/employee/notifications'),
    refetchInterval: 5_000,
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const hasAny = notifications.length > 0;
  const allRead = hasAny && unreadCount === 0;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['employee', 'notifications'] });
  }, [queryClient]);

  const markRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await empFetch(`/employee/notifications/${id}/read`, { method: 'PATCH' });
    invalidate();
  };

  const markAll = async () => {
    await empFetch('/employee/notifications/read-all', { method: 'PATCH' });
    invalidate();
  };

  const recent = notifications.slice(0, 15);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Notifications"
        >
          <Bell
            className={cn(
              'h-5 w-5 transition-colors',
              unreadCount > 0 ? 'text-red-500' : allRead ? 'text-green-500' : 'text-muted-foreground'
            )}
          />

          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm ring-2 ring-background">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          {allRead && (
            <span className="absolute -top-0.5 -right-0.5 h-[14px] w-[14px] bg-green-500 rounded-full flex items-center justify-center ring-2 ring-background">
              <CheckCircle2 className="h-3 w-3 text-white" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[320px] p-0 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{t('nav.notifications')}</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAll}
              className="text-xs text-primary hover:underline font-medium"
            >
              {t('notifications.mark_all')}
            </button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[340px]">
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Bell className="h-8 w-8 opacity-30" />
              <p className="text-sm">{t('notifications.empty')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer',
                    !n.isRead
                      ? 'bg-red-50 dark:bg-red-950/20 hover:bg-red-100/60 dark:hover:bg-red-950/30'
                      : 'hover:bg-muted/40'
                  )}
                  onClick={(e) => !n.isRead && markRead(n.id, e)}
                >
                  <div className={cn('mt-0.5 h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0', !n.isRead ? 'bg-white dark:bg-background shadow-sm' : 'bg-muted')}>
                    {notifIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs leading-relaxed', !n.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {isValid(new Date(n.createdAt)) ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : 'الآن'}
                    </p>
                  </div>
                  <div className={cn('h-2 w-2 rounded-full flex-shrink-0 mt-1.5', !n.isRead ? 'bg-red-500' : 'bg-green-400 opacity-60')} />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
