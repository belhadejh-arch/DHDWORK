import React, { useState } from 'react';
import {
  useListViolations, useCreateViolation, useUpdateViolation, useDeleteViolation,
  getListViolationsQueryKey, useListEmployees,
} from '@workspace/api-client-react';
import { useI18n } from '@/context/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ShieldAlert, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { EmployeeSelector } from '@/components/EmployeeSelector';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type StatusFilter = 'all' | 'pending' | 'deducted';

const VIOLATION_TYPES = [
  { value: 'tardiness', labelKey: 'violations.type.tardiness' },
  { value: 'absence', labelKey: 'violations.type.absence' },
  { value: 'early_departure', labelKey: 'violations.type.early_departure' },
  { value: 'manual', labelKey: 'violations.type.manual' },
  { value: 'other', labelKey: 'violations.type.other' },
];

const TYPE_BADGE_COLORS: Record<string, string> = {
  tardiness: 'bg-amber-500/10 text-amber-700 border-0',
  absence: 'bg-red-500/10 text-red-700 border-0',
  early_departure: 'bg-orange-500/10 text-orange-700 border-0',
  manual: 'bg-purple-500/10 text-purple-700 border-0',
  other: 'bg-gray-500/10 text-gray-700 border-0',
};

export default function Violations() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    employeeId: '',
    violationType: 'manual',
    violationDate: '',
    violationTime: '',
    reason: '',
    amount: '',
    notes: '',
  });

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    violationType: 'manual',
    violationDate: '',
    violationTime: '',
    reason: '',
    amount: '',
    notes: '',
  });

  // Delete dialog
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: violations = [], isLoading } = useListViolations({
    status: statusFilter === 'all' ? undefined : statusFilter,
    employeeId: employeeFilter !== 'all' ? Number(employeeFilter) : undefined,
  });

  const { data: employees = [] } = useListEmployees();

  const createMutation = useCreateViolation();
  const updateMutation = useUpdateViolation();
  const deleteMutation = useDeleteViolation();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListViolationsQueryKey() });

  const handleCreate = () => {
    if (!createForm.employeeId || !createForm.reason.trim()) return;
    createMutation.mutate({
      data: {
        employeeId: Number(createForm.employeeId),
        violationType: createForm.violationType as any,
        violationDate: createForm.violationDate || null,
        violationTime: createForm.violationTime || null,
        reason: createForm.reason.trim(),
        ...(createForm.amount ? { amount: Number(createForm.amount) } : {}),
        ...(createForm.notes.trim() ? { notes: createForm.notes.trim() } : {}),
      } as any,
    }, {
      onSuccess: () => {
        invalidate();
        setCreateOpen(false);
        setCreateForm({ employeeId: '', violationType: 'manual', violationDate: '', violationTime: '', reason: '', amount: '', notes: '' });
        toast({ title: t('violations.toast.created') });
      },
    });
  };

  const openEdit = (v: (typeof violations)[0]) => {
    setEditId(v.id);
    setEditForm({
      violationType: (v as any).violationType ?? 'manual',
      violationDate: (v as any).violationDate ?? '',
      violationTime: (v as any).violationTime ?? '',
      reason: v.reason,
      amount: v.amount != null ? String(v.amount) : '',
      notes: v.notes ?? '',
    });
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editId || !editForm.reason.trim()) return;
    updateMutation.mutate({
      id: editId,
      data: {
        violationType: editForm.violationType as any,
        violationDate: editForm.violationDate || null,
        violationTime: editForm.violationTime || null,
        reason: editForm.reason.trim(),
        ...(editForm.amount ? { amount: Number(editForm.amount) } : {}),
        ...(editForm.notes.trim() ? { notes: editForm.notes.trim() } : {}),
      } as any,
    }, {
      onSuccess: () => {
        invalidate();
        setEditOpen(false);
        setEditId(null);
        toast({ title: t('violations.toast.updated') });
      },
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId }, {
      onSuccess: () => {
        invalidate();
        setDeleteId(null);
        toast({ title: t('violations.toast.deleted') });
      },
    });
  };

  const statusBadge = (status: string) => {
    if (status === 'deducted') return 'bg-emerald-500/10 text-emerald-600 border-0';
    return 'bg-amber-500/10 text-amber-600 border-0';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.violations')}</h1>
        <p className="text-muted-foreground mt-1">{t('violations.subtitle')}</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-6">
          {/* Filters + Add */}
          <div className="mb-5 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3">
              <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('notifications.filter.all')}</SelectItem>
                  <SelectItem value="pending">{t('violations.status.pending')}</SelectItem>
                  <SelectItem value="deducted">{t('violations.status.deducted')}</SelectItem>
                </SelectContent>
              </Select>

              <EmployeeSelector
                value={employeeFilter === 'all' ? '' : employeeFilter}
                onChange={(v) => setEmployeeFilter(v || 'all')}
                employees={employees}
                placeholder="جميع الموظفين"
                className="w-[200px]"
              />
            </div>

            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> {t('violations.add')}
            </Button>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>{t('violations.col.employee')}</TableHead>
                  <TableHead>{t('violations.col.type')}</TableHead>
                  <TableHead>{t('violations.col.date')}</TableHead>
                  <TableHead>{t('violations.col.reason')}</TableHead>
                  <TableHead>{t('violations.col.amount')}</TableHead>
                  <TableHead>{t('violations.col.notes')}</TableHead>
                  <TableHead>{t('violations.col.status')}</TableHead>
                  <TableHead className="text-right">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">{t('action.loading')}</TableCell>
                  </TableRow>
                ) : violations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <ShieldAlert className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p>{t('violations.empty')}</p>
                    </TableCell>
                  </TableRow>
                ) : violations.map(v => (
                  <TableRow key={v.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">
                      {v.employeeName}
                      {v.officeName && <div className="text-xs text-muted-foreground">{v.officeName}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TYPE_BADGE_COLORS[(v as any).violationType ?? 'manual'] ?? ''}>
                        {t(`violations.type.${(v as any).violationType ?? 'manual'}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {(v as any).violationDate
                        ? <div>
                            <div>{(v as any).violationDate}</div>
                            {(v as any).violationTime && <div className="text-xs text-muted-foreground">{(v as any).violationTime}</div>}
                          </div>
                        : format(new Date(v.createdAt), 'dd MMM yyyy')
                      }
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-sm line-clamp-2">{v.reason}</span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {v.amount != null
                        ? <span className="font-bold text-destructive">{v.amount.toLocaleString()} DZD</span>
                        : <span className="text-muted-foreground text-xs italic">{t('violations.amount_open')}</span>
                      }
                    </TableCell>
                    <TableCell className="max-w-[150px]">
                      {v.notes
                        ? <span className="text-xs text-muted-foreground line-clamp-2">{v.notes}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadge(v.status)}>
                        {t(`violations.status.${v.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {v.status === 'pending' && (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(v)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(v.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              {t('violations.add')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('violations.form.employee')}</Label>
              <EmployeeSelector
                value={createForm.employeeId}
                onChange={v => setCreateForm(f => ({ ...f, employeeId: v }))}
                employees={employees}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('violations.form.type')}</Label>
              <Select value={createForm.violationType} onValueChange={v => setCreateForm(f => ({ ...f, violationType: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIOLATION_TYPES.map(vt => (
                    <SelectItem key={vt.value} value={vt.value}>{t(vt.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('violations.form.date')}</Label>
                <Input
                  type="date"
                  value={createForm.violationDate}
                  onChange={e => setCreateForm(f => ({ ...f, violationDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('violations.form.time')}</Label>
                <Input
                  type="time"
                  value={createForm.violationTime}
                  onChange={e => setCreateForm(f => ({ ...f, violationTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('violations.form.reason')}</Label>
              <Textarea
                value={createForm.reason}
                onChange={e => setCreateForm(f => ({ ...f, reason: e.target.value }))}
                placeholder={t('violations.form.reason_placeholder')}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('violations.form.amount')}</Label>
              <Input
                type="number"
                min="0"
                value={createForm.amount}
                onChange={e => setCreateForm(f => ({ ...f, amount: e.target.value }))}
                placeholder={t('violations.form.amount_placeholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('violations.form.notes')}</Label>
              <Input
                value={createForm.notes}
                onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('violations.form.notes_placeholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('action.cancel')}</Button>
            <Button
              onClick={handleCreate}
              disabled={!createForm.employeeId || !createForm.reason.trim() || createMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('violations.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('violations.edit')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('violations.form.type')}</Label>
              <Select value={editForm.violationType} onValueChange={v => setEditForm(f => ({ ...f, violationType: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIOLATION_TYPES.map(vt => (
                    <SelectItem key={vt.value} value={vt.value}>{t(vt.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('violations.form.date')}</Label>
                <Input
                  type="date"
                  value={editForm.violationDate}
                  onChange={e => setEditForm(f => ({ ...f, violationDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('violations.form.time')}</Label>
                <Input
                  type="time"
                  value={editForm.violationTime}
                  onChange={e => setEditForm(f => ({ ...f, violationTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('violations.form.reason')}</Label>
              <Textarea
                value={editForm.reason}
                onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))}
                placeholder={t('violations.form.reason_placeholder')}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('violations.form.amount')}</Label>
              <Input
                type="number"
                min="0"
                value={editForm.amount}
                onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                placeholder={t('violations.form.amount_placeholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('violations.form.notes')}</Label>
              <Input
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('violations.form.notes_placeholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t('action.cancel')}</Button>
            <Button
              onClick={handleEdit}
              disabled={!editForm.reason.trim() || updateMutation.isPending}
            >
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('violations.delete_confirm')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('violations.delete_confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('action.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
