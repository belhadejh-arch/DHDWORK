import React, { useState } from 'react';
import { useListAdvances, useApproveAdvance, useRejectAdvance, getListAdvancesQueryKey } from '@workspace/api-client-react';
import { useI18n } from '@/context/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Wallet, MessageSquare } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function Advances() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: advances = [], isLoading } = useListAdvances({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const approveMutation = useApproveAdvance();
  const rejectMutation = useRejectAdvance();

  const handleApprove = (id: number) => {
    approveMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAdvancesQueryKey() });
        toast({ title: t('advances.toast.approved') });
      }
    });
  };

  const handleReject = () => {
    if (!rejectingId) return;
    rejectMutation.mutate({ id: rejectingId, data: { reason: rejectReason } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAdvancesQueryKey() });
        setRejectingId(null);
        setRejectReason('');
        toast({ title: t('advances.toast.rejected') });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.advances')}</h1>
        <p className="text-muted-foreground mt-1">{t('advances.subtitle')}</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-6 flex gap-2 border-b pb-3">
            {[
              { id: 'all', label: 'جميع السلف' },
              { id: 'pending', label: 'قيد الانتظار' },
              { id: 'approved', label: 'المعتمدة' },
              { id: 'rejected', label: 'المرفوضة' },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={statusFilter === tab.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter(tab.id as any)}
                className="text-xs font-medium"
              >
                {tab.label}
              </Button>
            ))}
          </div>

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
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">{t('action.loading')}</TableCell></TableRow>
                ) : advances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Wallet className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p>{t('advances.empty')}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  advances.map((a) => (
                    <TableRow key={a.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">
                        {a.employeeName}
                        <div className="text-xs text-muted-foreground">{a.officeName}</div>
                      </TableCell>
                      <TableCell className="text-sm">{format(new Date(a.requestedAt), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="font-bold text-primary font-mono">{a.amount.toLocaleString()} DZD</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm" title={a.reason || ''}>
                        {a.reason ? (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <MessageSquare className="h-3 w-3" /> {a.reason}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          a.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-0' :
                          a.status === 'rejected' ? 'bg-rose-500/10 text-rose-600 border-0' :
                          'bg-amber-500/10 text-amber-600 border-0'
                        }>
                          {t(`status.${a.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {a.status === 'pending' && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setRejectingId(a.id)}>
                              <X className="h-4 w-4 mr-1" /> {t('action.reject')}
                            </Button>
                            <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(a.id)} disabled={approveMutation.isPending}>
                              <Check className="h-4 w-4 mr-1" /> {t('action.approve')}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!rejectingId} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('advances.reject_modal.title')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('advances.reject_modal.reason')}</label>
              <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder={t('advances.reject_modal.placeholder')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>{t('action.cancel')}</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectMutation.isPending}>{t('advances.reject_modal.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
