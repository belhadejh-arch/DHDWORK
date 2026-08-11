import React, { useState } from 'react';
import {
  useListAdvances, useApproveAdvance, useRejectAdvance, getListAdvancesQueryKey,
  useListLeaveRequests, useApproveLeaveRequest, useRejectLeaveRequest, getListLeaveRequestsQueryKey,
  useListVacationRequests, useApproveVacationRequest, useRejectVacationRequest, getListVacationRequestsQueryKey,
  getGetDashboardStatsQueryKey,
} from '@workspace/api-client-react';
import { useI18n } from '@/context/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Wallet, CalendarClock, Palmtree, ClipboardList, MessageSquare } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInDays } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
type TabType = 'advances' | 'leave' | 'vacation';

const statusClass = (s: string) =>
  s === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-0' :
  s === 'rejected'  ? 'bg-rose-500/10 text-rose-600 border-0' :
                      'bg-amber-500/10 text-amber-600 border-0';

export default function Requests() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabType>('advances');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Reject dialogs
  const [rejectingAdvance, setRejectingAdvance] = useState<number | null>(null);
  const [rejectingLeave, setRejectingLeave] = useState<number | null>(null);
  const [rejectingVacation, setRejectingVacation] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Approve dialogs (with optional admin note)
  const [approvingAdvance, setApprovingAdvance] = useState<number | null>(null);
  const [approvingLeave, setApprovingLeave] = useState<number | null>(null);
  const [approvingVacation, setApprovingVacation] = useState<number | null>(null);
  const [approveNote, setApproveNote] = useState('');

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: advances = [], isLoading: loadingAdv } = useListAdvances(
    { status: statusFilter === 'all' ? undefined : statusFilter },
    { query: { queryKey: getListAdvancesQueryKey({ status: statusFilter === 'all' ? undefined : statusFilter }), refetchInterval: 5_000 } },
  );
  const { data: leaveReqs = [], isLoading: loadingLeave } = useListLeaveRequests(
    { status: statusFilter === 'all' ? undefined : statusFilter },
    { query: { queryKey: getListLeaveRequestsQueryKey({ status: statusFilter === 'all' ? undefined : statusFilter }), refetchInterval: 5_000 } },
  );
  const { data: vacReqs = [], isLoading: loadingVac } = useListVacationRequests(
    { status: statusFilter === 'all' ? undefined : statusFilter },
    { query: { queryKey: getListVacationRequestsQueryKey({ status: statusFilter === 'all' ? undefined : statusFilter }), refetchInterval: 5_000 } },
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const appAdv  = useApproveAdvance();
  const rejAdv  = useRejectAdvance();
  const appLeave = useApproveLeaveRequest();
  const rejLeave = useRejectLeaveRequest();
  const appVac  = useApproveVacationRequest();
  const rejVac  = useRejectVacationRequest();

  // Advances
  const handleApproveAdv = () => {
    if (!approvingAdvance) return;
    appAdv.mutate({ id: approvingAdvance, data: { adminNote: approveNote || undefined } }, {
       onSuccess: () => { qc.invalidateQueries({ queryKey: getListAdvancesQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); setApprovingAdvance(null); setApproveNote(''); toast({ title: t('advances.toast.approved') }); }
    });
  };
  const handleRejectAdv = () => {
    if (!rejectingAdvance) return;
    rejAdv.mutate({ id: rejectingAdvance, data: { reason: rejectReason } }, {
       onSuccess: () => { qc.invalidateQueries({ queryKey: getListAdvancesQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); setRejectingAdvance(null); setRejectReason(''); toast({ title: t('advances.toast.rejected') }); }
    });
  };

  // Leave
  const handleApproveLeave = () => {
    if (!approvingLeave) return;
    appLeave.mutate({ id: approvingLeave, data: { adminNote: approveNote || undefined } }, {
       onSuccess: () => { qc.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); setApprovingLeave(null); setApproveNote(''); toast({ title: t('leave.toast.approved') }); }
    });
  };
  const handleRejectLeave = () => {
    if (!rejectingLeave) return;
    rejLeave.mutate({ id: rejectingLeave, data: { reason: rejectReason } }, {
       onSuccess: () => { qc.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); setRejectingLeave(null); setRejectReason(''); toast({ title: t('leave.toast.rejected') }); }
    });
  };

  // Vacation
  const handleApproveVac = () => {
    if (!approvingVacation) return;
    appVac.mutate({ id: approvingVacation, data: { adminNote: approveNote || undefined } }, {
       onSuccess: () => { qc.invalidateQueries({ queryKey: getListVacationRequestsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); setApprovingVacation(null); setApproveNote(''); toast({ title: t('vacation.toast.approved') }); }
    });
  };
  const handleRejectVac = () => {
    if (!rejectingVacation) return;
    rejVac.mutate({ id: rejectingVacation, data: { reason: rejectReason } }, {
       onSuccess: () => { qc.invalidateQueries({ queryKey: getListVacationRequestsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); setRejectingVacation(null); setRejectReason(''); toast({ title: t('vacation.toast.rejected') }); }
    });
  };

  // ── Pending counts ────────────────────────────────────────────────────────
  const { data: pendingAdv = [] }   = useListAdvances({ status: 'pending' }, { query: { queryKey: getListAdvancesQueryKey({ status: 'pending' }), refetchInterval: 5_000 } });
  const { data: pendingLeave = [] } = useListLeaveRequests({ status: 'pending' }, { query: { queryKey: getListLeaveRequestsQueryKey({ status: 'pending' }), refetchInterval: 5_000 } });
  const { data: pendingVac = [] }   = useListVacationRequests({ status: 'pending' }, { query: { queryKey: getListVacationRequestsQueryKey({ status: 'pending' }), refetchInterval: 5_000 } });

  const tabs: { key: TabType; icon: React.ReactNode; label: string; count: number }[] = [
    { key: 'advances',  icon: <Wallet className="h-4 w-4" />,      label: t('nav.advances'),          count: pendingAdv.length },
    { key: 'leave',     icon: <CalendarClock className="h-4 w-4" />, label: t('nav.leave_requests'),   count: pendingLeave.length },
    { key: 'vacation',  icon: <Palmtree className="h-4 w-4" />,    label: t('nav.vacation_requests'),  count: pendingVac.length },
  ];

  const openReject = (type: TabType, id: number) => {
    setRejectReason('');
    if (type === 'advances') setRejectingAdvance(id);
    if (type === 'leave')    setRejectingLeave(id);
    if (type === 'vacation') setRejectingVacation(id);
  };

  const openApprove = (type: TabType, id: number) => {
    setApproveNote('');
    if (type === 'advances') setApprovingAdvance(id);
    if (type === 'leave')    setApprovingLeave(id);
    if (type === 'vacation') setApprovingVacation(id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-7 w-7" />
          {t('nav.requests')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('requests.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              tab === tb.key
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {tb.icon}
            {tb.label}
            {tb.count > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold ${
                tab === tb.key ? 'bg-primary-foreground/20' : 'bg-amber-500/20 text-amber-700'
              }`}>
                {tb.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-6">
          {/* Status filter tabs */}
          <div className="mb-6 flex gap-2 border-b pb-3">
            {[
              { key: 'all', label: 'الكل' },
              { key: 'pending', label: 'قيد المراجعة' },
              { key: 'approved', label: 'المقبولة' },
              { key: 'rejected', label: 'المرفوضة' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key as StatusFilter)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  statusFilter === f.key
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* ── Advances tab ──────────────────────────────────────────────── */}
          {tab === 'advances' && (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>{t('advances.col.employee')}</TableHead>
                    <TableHead>{t('advances.col.requested')}</TableHead>
                    <TableHead>{t('advances.col.amount')}</TableHead>
                    <TableHead>{t('advances.col.reason')}</TableHead>
                    <TableHead>{t('advances.col.status')}</TableHead>
                    <TableHead className="text-right">{t('table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAdv ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8">{t('action.loading')}</TableCell></TableRow>
                  ) : advances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Wallet className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                        <p>{t('advances.empty')}</p>
                      </TableCell>
                    </TableRow>
                  ) : advances.map(a => (
                    <TableRow key={a.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">
                        {a.employeeName}
                        <div className="text-xs text-muted-foreground">{a.officeName}</div>
                      </TableCell>
                      <TableCell className="text-sm">{format(new Date(a.requestedAt), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="font-bold text-primary font-mono">{a.amount.toLocaleString()} DZD</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {a.reason ? <span className="flex items-center gap-1.5 text-muted-foreground"><MessageSquare className="h-3 w-3" /> {a.reason}</span> : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClass(a.status)}>{t(`status.${a.status}`)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {a.status === 'pending' && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => openReject('advances', a.id)}>
                              <X className="h-4 w-4 me-1" /> {t('action.reject')}
                            </Button>
                            <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openApprove('advances', a.id)}>
                              <Check className="h-4 w-4 me-1" /> {t('action.approve')}
                            </Button>
                          </div>
                        )}
                        {a.status === 'rejected' && a.rejectionReason && (
                          <span className="text-xs text-muted-foreground">{a.rejectionReason}</span>
                        )}
                        {a.status === 'approved' && (a as any).adminNote && (
                          <span className="text-xs text-emerald-600 flex items-center gap-1 justify-end"><MessageSquare className="h-3 w-3" />{(a as any).adminNote}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── Leave tab ─────────────────────────────────────────────────── */}
          {tab === 'leave' && (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>{t('leave.col.employee')}</TableHead>
                    <TableHead>{t('leave.col.type')}</TableHead>
                    <TableHead>{t('leave.col.dates')}</TableHead>
                    <TableHead>{t('leave.col.description')}</TableHead>
                    <TableHead>{t('leave.col.status')}</TableHead>
                    <TableHead className="text-right">{t('table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLeave ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8">{t('action.loading')}</TableCell></TableRow>
                  ) : leaveReqs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <CalendarClock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                        <p>{t('leave.empty')}</p>
                      </TableCell>
                    </TableRow>
                  ) : leaveReqs.map(r => (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">
                        {r.employeeName}
                        <div className="text-xs text-muted-foreground">{r.officeName}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {t(`leave.type.${r.leaveType}`) !== `leave.type.${r.leaveType}` ? t(`leave.type.${r.leaveType}`) : r.leaveType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <div>{format(new Date(r.startDate), 'dd MMM yyyy')}</div>
                        <div className="text-xs text-muted-foreground">{t('leave.to')} {format(new Date(r.endDate), 'dd MMM yyyy')}</div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{r.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClass(r.status)}>{t(`status.${r.status}`)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === 'pending' && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => openReject('leave', r.id)}>
                              <X className="h-4 w-4 me-1" /> {t('action.reject')}
                            </Button>
                            <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openApprove('leave', r.id)}>
                              <Check className="h-4 w-4 me-1" /> {t('action.approve')}
                            </Button>
                          </div>
                        )}
                        {r.status === 'rejected' && r.rejectionReason && (
                          <span className="text-xs text-muted-foreground">{r.rejectionReason}</span>
                        )}
                        {r.status === 'approved' && (r as any).adminNote && (
                          <span className="text-xs text-emerald-600 flex items-center gap-1 justify-end"><MessageSquare className="h-3 w-3" />{(r as any).adminNote}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── Vacation tab ──────────────────────────────────────────────── */}
          {tab === 'vacation' && (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>{t('vacation.col.employee')}</TableHead>
                    <TableHead>{t('vacation.col.dates')}</TableHead>
                    <TableHead>{t('vacation.col.duration')}</TableHead>
                    <TableHead>{t('vacation.col.description')}</TableHead>
                    <TableHead>{t('vacation.col.status')}</TableHead>
                    <TableHead className="text-right">{t('table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingVac ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8">{t('action.loading')}</TableCell></TableRow>
                  ) : vacReqs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Palmtree className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                        <p>{t('vacation.empty')}</p>
                      </TableCell>
                    </TableRow>
                  ) : vacReqs.map(r => {
                    const days = differenceInDays(new Date(r.endDate), new Date(r.startDate)) + 1;
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">
                          {r.employeeName}
                          <div className="text-xs text-muted-foreground">{r.officeName}</div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          <div>{format(new Date(r.startDate), 'dd MMM yyyy')}</div>
                          <div className="text-xs text-muted-foreground">{t('vacation.to')} {format(new Date(r.endDate), 'dd MMM yyyy')}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-primary/10 text-primary">{days} {t('vacation.days')}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{r.description || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusClass(r.status)}>{t(`status.${r.status}`)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status === 'pending' && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" className="h-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => openReject('vacation', r.id)}>
                                <X className="h-4 w-4 me-1" /> {t('action.reject')}
                              </Button>
                              <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openApprove('vacation', r.id)}>
                                <Check className="h-4 w-4 me-1" /> {t('action.approve')}
                              </Button>
                            </div>
                          )}
                          {r.status === 'rejected' && r.rejectionReason && (
                            <span className="text-xs text-muted-foreground">{r.rejectionReason}</span>
                          )}
                          {r.status === 'approved' && (r as any).adminNote && (
                            <span className="text-xs text-emerald-600 flex items-center gap-1 justify-end"><MessageSquare className="h-3 w-3" />{(r as any).adminNote}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve dialogs */}
      {[
        { open: approvingAdvance !== null, onClose: () => setApprovingAdvance(null), onConfirm: handleApproveAdv, pending: appAdv.isPending },
        { open: approvingLeave !== null,   onClose: () => setApprovingLeave(null),   onConfirm: handleApproveLeave, pending: appLeave.isPending },
        { open: approvingVacation !== null, onClose: () => setApprovingVacation(null), onConfirm: handleApproveVac, pending: appVac.isPending },
      ].map((d, i) => (
        <Dialog key={`approve-${i}`} open={d.open} onOpenChange={open => !open && d.onClose()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-600" />
                {t('requests.approve_title')}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <Label className="text-muted-foreground text-sm">{t('requests.approve_note')}</Label>
              <Textarea
                value={approveNote}
                onChange={e => setApproveNote(e.target.value)}
                placeholder={t('requests.approve_placeholder')}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={d.onClose}>{t('action.cancel')}</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={d.onConfirm} disabled={d.pending}>{t('requests.approve_confirm')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}

      {/* Reject dialogs */}
      {[
        { open: rejectingAdvance !== null, onClose: () => setRejectingAdvance(null), onConfirm: handleRejectAdv, pending: rejAdv.isPending },
        { open: rejectingLeave !== null,   onClose: () => setRejectingLeave(null),   onConfirm: handleRejectLeave, pending: rejLeave.isPending },
        { open: rejectingVacation !== null, onClose: () => setRejectingVacation(null), onConfirm: handleRejectVac, pending: rejVac.isPending },
      ].map((d, i) => (
        <Dialog key={`reject-${i}`} open={d.open} onOpenChange={open => !open && d.onClose()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('requests.reject_title')}</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <Label>{t('requests.reject_reason')}</Label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder={t('requests.reject_placeholder')}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={d.onClose}>{t('action.cancel')}</Button>
              <Button variant="destructive" onClick={d.onConfirm} disabled={d.pending}>{t('requests.reject_confirm')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
