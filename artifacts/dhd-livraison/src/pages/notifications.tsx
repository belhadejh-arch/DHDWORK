import React, { useState } from 'react';
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey } from '@workspace/api-client-react';
import { useI18n } from '@/context/i18n';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Wallet, CalendarClock, Palmtree, Banknote, ClockAlert, Info, CheckCircle2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'wouter';

export default function Notifications() {
  const { t } = useI18n();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useListNotifications({
    unreadOnly: unreadOnly ? true : undefined,
  });

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const handleMarkRead = (id: number) => {
    markReadMutation.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
    });
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
    });
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'advance_request': return <Wallet className="h-5 w-5 text-amber-500" />;
      case 'leave_request': return <CalendarClock className="h-5 w-5 text-emerald-500" />;
      case 'vacation_request': return <Palmtree className="h-5 w-5 text-teal-500" />;
      case 'salary_due': return <Banknote className="h-5 w-5 text-primary" />;
      case 'attendance_alert': return <ClockAlert className="h-5 w-5 text-rose-500" />;
      default: return <Info className="h-5 w-5 text-slate-500" />;
    }
  };

  const getLink = (n: any) => {
    switch(n.type) {
      case 'advance_request':
      case 'leave_request':
      case 'vacation_request': return '/requests';
      case 'violation_added': return '/violations';
      case 'salary_due': return n.referenceId ? `/employees/${n.referenceId}` : '/salaries';
      case 'attendance_alert':
      case 'late_alert': return '/attendance';
      default: return '/dashboard';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('nav.notifications')}</h1>
          <p className="text-muted-foreground mt-1">{t('notifications.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={handleMarkAllRead} disabled={markAllReadMutation.isPending || notifications.every(n => n.isRead)}>
          <CheckCircle2 className="h-4 w-4 mr-2" /> {t('notifications.mark_all')}
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        <Button variant={!unreadOnly ? "default" : "secondary"} size="sm" onClick={() => setUnreadOnly(false)}>
          {t('notifications.filter.all')}
        </Button>
        <Button variant={unreadOnly ? "default" : "secondary"} size="sm" onClick={() => setUnreadOnly(true)}>
          {t('notifications.filter.unread')}
        </Button>
      </div>

      <Card className="shadow-sm overflow-hidden border-border/50">
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">{t('action.loading')}</div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p>{t('notifications.empty')}</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div 
                key={n.id} 
                className={cn("p-4 transition-colors hover:bg-muted/30 flex gap-4 items-start", !n.isRead ? "bg-primary/5" : "")}
                onClick={() => !n.isRead && handleMarkRead(n.id)}
              >
                <div className={cn("p-2 rounded-full mt-1 flex-shrink-0", !n.isRead ? "bg-background shadow-sm" : "bg-muted")}>
                  {getIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-4 mb-1">
                    <p className={cn("text-sm", !n.isRead ? "font-semibold" : "font-medium text-muted-foreground")}>
                      {n.message}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {isValid(new Date(n.createdAt)) ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : 'الآن'}
                    </span>
                  </div>
                  <div className="flex gap-3 items-center mt-2">
                    <Link href={getLink(n)} className="text-xs text-primary hover:underline font-medium">
                      {t('notifications.view')}
                    </Link>
                    {!n.isRead && (
                      <button className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}>
                        {t('notifications.mark_read')}
                      </button>
                    )}
                  </div>
                </div>
                {!n.isRead && <div className="h-2 w-2 bg-primary rounded-full flex-shrink-0 mt-3" />}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
