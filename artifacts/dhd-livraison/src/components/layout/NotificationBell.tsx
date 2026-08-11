import React from 'react';
import { Bell, CheckCircle2, Wallet, CalendarClock, Palmtree, Banknote, ClockAlert, ShieldAlert, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
  type Notification,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'wouter';
import { useI18n } from '@/context/i18n';

function getNotificationPath(n: Notification): string {
  if (n.type === 'advance_request' || n.type === 'leave_request' || n.type === 'vacation_request') {
    return '/requests';
  }
  if (n.type === 'violation_added') {
    return '/violations';
  }
  if (n.type === 'attendance_alert' || n.type === 'late_alert') {
    return '/attendance';
  }
  if (n.type === 'salary_due') {
    return n.referenceId ? `/employees/${n.referenceId}` : '/salaries';
  }
  if ((n as any).recipientEmployeeId) {
    return `/employees/${(n as any).recipientEmployeeId}`;
  }
  return '/notifications';
}

function notifIcon(type: string) {
  switch (type) {
    case 'advance_request':   return <Wallet className="h-4 w-4 text-amber-500" />;
    case 'leave_request':     return <CalendarClock className="h-4 w-4 text-emerald-500" />;
    case 'vacation_request':  return <Palmtree className="h-4 w-4 text-teal-500" />;
    case 'salary_due':        return <Banknote className="h-4 w-4 text-primary" />;
    case 'attendance_alert':  return <ClockAlert className="h-4 w-4 text-rose-500" />;
    case 'late_alert':        return <ClockAlert className="h-4 w-4 text-orange-500" />;
    case 'violation_added':   return <ShieldAlert className="h-4 w-4 text-red-500" />;
    default:                  return <Info className="h-4 w-4 text-slate-500" />;
  }
}

export function NotificationBell() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: all = [] } = useListNotifications(
    {},
    { query: { queryKey: getListNotificationsQueryKey({}), refetchInterval: 30_000 } }
  );
  const { data: unreadList = [] } = useListNotifications(
    { unreadOnly: true },
    { query: { queryKey: getListNotificationsQueryKey({ unreadOnly: true }), refetchInterval: 30_000 } }
  );

  const unreadCount = unreadList.length;
  const hasAny = all.length > 0;
  const allRead = hasAny && unreadCount === 0;

  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({ unreadOnly: true }) });
  };

  const handleMarkRead = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    markRead.mutate({ id }, { onSuccess: invalidate });
  };

  const handleMarkAll = () => {
    markAll.mutate(undefined, { onSuccess: invalidate });
  };

  // Show latest 15 notifications in the panel
  const recent = all.slice(0, 15);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-testid="button-notification-bell"
          className="relative h-10 w-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Notifications"
        >
          {/* Bell colour: red when unread, green when all read, muted when empty */}
          <Bell
            className={cn(
              'h-5 w-5 transition-colors',
              unreadCount > 0 ? 'text-primary' : allRead ? 'text-emerald-500' : 'text-muted-foreground'
            )}
          />

          {/* Badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm ring-2 ring-background">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
           {allRead && (
             <span className="absolute -top-0.5 -right-0.5 h-[14px] w-[14px] bg-emerald-500 rounded-full flex items-center justify-center ring-2 ring-background">
              <CheckCircle2 className="h-3 w-3 text-white" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] p-0 shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{t('nav.notifications')}</span>
            {unreadCount > 0 && (
             <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs text-primary hover:underline font-medium"
              >
                {t('notifications.mark_all')}
              </button>
            )}
            <Link href="/notifications" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              {t('notifications.view_all') || 'عرض الكل'}
            </Link>
          </div>
        </div>

        {/* Notifications list */}
        <ScrollArea className="max-h-[380px]">
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
                       ? 'bg-primary/5 hover:bg-primary/10'
                      : 'hover:bg-muted/40'
                  )}
                  onClick={(e) => {
                    if (!n.isRead) {
                      handleMarkRead(n.id, e);
                    }
                    setLocation(getNotificationPath(n));
                  }}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      'mt-0.5 h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0',
                     !n.isRead ? 'bg-card shadow-sm' : 'bg-muted'
                    )}
                  >
                    {notifIcon(n.type)}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-xs leading-relaxed',
                        !n.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {isValid(new Date(n.createdAt)) ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : 'الآن'}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!n.isRead && (
                     <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  )}
                   {n.isRead && (
                     <div className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0 mt-1.5 opacity-60" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {all.length > 15 && (
          <div className="border-t border-border px-4 py-2.5 text-center">
            <Link href="/notifications" className="text-xs text-primary hover:underline font-medium">
              {t('notifications.view_all') || 'عرض جميع الإشعارات'}
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
