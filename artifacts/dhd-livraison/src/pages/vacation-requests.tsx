import React, { useState } from 'react';
import { useListVacationRequests, useApproveVacationRequest, useRejectVacationRequest, getListVacationRequestsQueryKey } from '@workspace/api-client-react';
import { useI18n } from '@/context/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Palmtree } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInDays } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function VacationRequests() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: requests = [], isLoading } = useListVacationRequests({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const approveMutation = useApproveVacationRequest();
  const rejectMutation = useRejectVacationRequest();

  const handleApprove = (id: number) => {
    approveMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVacationRequestsQueryKey() });
        toast({ title: t('vacation.toast.approved') });
      }
    });
  };

  const handleReject = () => {
    if (!rejectingId) return;
    rejectMutation.mutate({ id: rejectingId, data: { reason: rejectReason } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVacationRequestsQueryKey() });
        setRejectingId(null);
        setRejectReason('');
        toast({ title: t('vacation.toast.rejected') });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.vacation_requests')}</h1>
        <p className="text-muted-foreground mt-1">{t('vacation.subtitle')}</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-6 flex">
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('vacation.filter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">{t('status.pending')}</SelectItem>
                <SelectItem value="approved">{t('status.approved')}</SelectItem>
                <SelectItem value="rejected">{t('status.rejected')}</SelectItem>
                <SelectItem value="all">{t('notifications.filter.all')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">{t('action.loading')}</TableCell></TableRow>
                ) : requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Palmtree className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p>{t('vacation.empty')}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((r) => {
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
                          <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                            {days} {t('vacation.days')}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{r.description || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            r.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-0' :
                            r.status === 'rejected' ? 'bg-rose-500/10 text-rose-600 border-0' :
                            'bg-amber-500/10 text-amber-600 border-0'
                          }>
                            {t(`status.${r.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status === 'pending' && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" className="h-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setRejectingId(r.id)}>
                                <X className="h-4 w-4 mr-1" /> {t('action.reject')}
                              </Button>
                              <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(r.id)} disabled={approveMutation.isPending}>
                                <Check className="h-4 w-4 mr-1" /> {t('action.approve')}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!rejectingId} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('vacation.reject_modal.title')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('vacation.reject_modal.reason')}</label>
              <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder={t('vacation.reject_modal.placeholder')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>{t('action.cancel')}</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectMutation.isPending}>{t('vacation.reject_modal.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
