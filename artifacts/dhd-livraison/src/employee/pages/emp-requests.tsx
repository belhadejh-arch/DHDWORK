import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/context/i18n';
import { empFetch } from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { HandCoins, CalendarOff, Palmtree } from 'lucide-react';

type Kind = 'advance' | 'leave' | 'vacation';

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const cls = status === 'approved'
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
    : status === 'rejected'
      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{t(`emp.req.status.${status}` as any)}</span>;
}

export default function EmpRequests() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Kind | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [leaveType, setLeaveType] = useState('personal');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['employee', 'requests'],
    queryFn: () => empFetch<{ advances: any[]; leaveRequests: any[]; vacationRequests: any[] }>('/employee/requests'),
    refetchInterval: 5_000,
  });

  const items = [
    ...(data?.advances ?? []).map(a => ({ kind: 'advance' as Kind, id: `a${a.id}`, title: `${t('emp.req.advance')} — ${a.amount} دج`, sub: a.reason, status: a.status, date: a.requestedAt })),
    ...(data?.leaveRequests ?? []).map(l => ({ kind: 'leave' as Kind, id: `l${l.id}`, title: t('emp.req.leave'), sub: `${l.startDate} → ${l.endDate}`, status: l.status, date: l.createdAt })),
    ...(data?.vacationRequests ?? []).map(v => ({ kind: 'vacation' as Kind, id: `v${v.id}`, title: t('emp.req.vacation'), sub: `${v.startDate} → ${v.endDate}`, status: v.status, date: v.createdAt })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const reset = () => { setAmount(''); setReason(''); setStartDate(''); setEndDate(''); setLeaveType('sick'); };

  const submit = async () => {
    setBusy(true);
    try {
      if (open === 'advance') {
        await empFetch('/employee/requests/advance', { method: 'POST', body: { amount: Number(amount), reason: reason || undefined } });
      } else if (open === 'leave') {
        await empFetch('/employee/requests/leave', { method: 'POST', body: { leaveType, startDate, endDate, description: reason || undefined } });
      } else {
        await empFetch('/employee/requests/vacation', { method: 'POST', body: { startDate, endDate, description: reason || undefined } });
      }
      toast({ title: t('emp.req.submitted') });
      queryClient.invalidateQueries({ queryKey: ['employee', 'requests'] });
      setOpen(null);
      reset();
    } catch {
      toast({ variant: 'destructive', title: t('login.error') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('emp.req.title')}</h1>

      <div className="grid grid-cols-3 gap-3">
        <Button variant="outline" className="h-auto py-3 flex-col gap-2" onClick={() => { reset(); setOpen('advance'); }}>
          <HandCoins className="h-5 w-5 text-primary" />
          <span className="text-xs whitespace-normal leading-tight">{t('emp.req.new_advance')}</span>
        </Button>
        <Button variant="outline" className="h-auto py-3 flex-col gap-2" onClick={() => { reset(); setOpen('leave'); }}>
          <CalendarOff className="h-5 w-5 text-primary" />
          <span className="text-xs whitespace-normal leading-tight">{t('emp.req.new_leave')}</span>
        </Button>
        <Button variant="outline" className="h-auto py-3 flex-col gap-2" onClick={() => { reset(); setOpen('vacation'); }}>
          <Palmtree className="h-5 w-5 text-primary" />
          <span className="text-xs whitespace-normal leading-tight">{t('emp.req.new_vacation')}</span>
        </Button>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('action.loading')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t('emp.req.empty')}</p>
        ) : items.map(item => (
          <Card key={item.id} className="shadow-sm">
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{item.title}</p>
                {item.sub && <p className="text-xs text-muted-foreground truncate" dir="auto">{item.sub}</p>}
              </div>
              <StatusBadge status={item.status} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {open === 'advance' ? t('emp.req.new_advance') : open === 'leave' ? t('emp.req.new_leave') : t('emp.req.new_vacation')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {open === 'advance' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('emp.req.amount')}</label>
                <Input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" />
              </div>
            )}
            {open === 'leave' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('emp.req.type')}</label>
                <select className="w-full h-9 rounded-md border bg-background px-3 text-sm" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                  <option value="personal">{t('leave.type.personal')}</option>
                  <option value="annual">{t('leave.type.annual')}</option>
                  <option value="family">{t('leave.type.family')}</option>
                  <option value="sick">{t('leave.type.sick')}</option>
                  <option value="absence">{t('leave.type.absence')}</option>
                </select>
              </div>
            )}
            {(open === 'leave' || open === 'vacation') && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t('emp.req.start')}</label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t('emp.req.end')}</label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} dir="ltr" />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{open === 'advance' ? t('emp.req.reason') : t('emp.req.desc')}</label>
              <Input value={reason} onChange={e => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>{t('action.cancel')}</Button>
            <Button onClick={submit} disabled={busy || (open === 'advance' ? !amount : (!startDate || !endDate))}>
              {t('emp.req.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
