import React, { useState } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserX, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useI18n } from '@/context/i18n';
import { API_BASE } from '@/lib/api-base';

interface FormerEmployee {
  id: number;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  officeName: string | null;
  deletedAt: string | null;
  deletionReason: string | null;
  serialNumber: string | null;
  baseSalary: number | null;
  phone: string | null;
  email: string | null;
}

/** Mirrors the same auth pattern used by main.tsx → customFetch internally. */
async function adminFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = localStorage.getItem('dhd_admin_token') ?? '';
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  // 204 No Content — nothing to parse
  if (res.status === 204) return undefined as unknown as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data as T;
}

function getInitials(first: string | null, last: string | null): string {
  return ((first ?? '?')[0] ?? '?').toUpperCase() + ((last ?? '')[0] ?? '').toUpperCase();
}

function getFullName(emp: FormerEmployee): string {
  return [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '—';
}

export default function FormerEmployees() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [confirmPermanent, setConfirmPermanent] = useState<{ id: number; name: string } | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: formerEmployees = [], isLoading, error } = useQuery<FormerEmployee[]>({
    queryKey: ['employees-former'],
    queryFn: () => adminFetch<FormerEmployee[]>('/employees/former'),
    refetchOnWindowFocus: false,
  });

  // ── Restore ───────────────────────────────────────────────────────────────
  const restoreMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch<FormerEmployee>(`/employees/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees-former'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: t('former.toast.restored') });
    },
    onError: () => toast({ variant: 'destructive', title: t('former.toast.restore_failed') }),
  });

  // ── Permanent delete ──────────────────────────────────────────────────────
  const permanentDeleteMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch<void>(`/employees/${id}/permanent`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees-former'] });
      setConfirmPermanent(null);
      toast({ title: t('former.toast.permanently_deleted') });
    },
    onError: () => toast({ variant: 'destructive', title: t('former.toast.delete_failed') }),
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center">
          <UserX className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('nav.former_employees')}</h1>
          <p className="text-muted-foreground mt-0.5">{t('former.subtitle')}</p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-medium">
              {(error as Error)?.message ?? t('action.loading')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('employees.col.name')}</TableHead>
                  <TableHead>{t('employees.col.position')}</TableHead>
                  <TableHead>{t('employees.col.office')}</TableHead>
                  <TableHead>{t('former.col.deleted_at')}</TableHead>
                  <TableHead>{t('former.col.reason')}</TableHead>
                  <TableHead className="text-right">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t('action.loading')}
                    </TableCell>
                  </TableRow>
                ) : formerEmployees.length === 0 && !error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <UserX className="h-8 w-8 opacity-30" />
                        <p>{t('former.empty')}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  formerEmployees.map((emp) => (
                    <TableRow key={emp.id} className="hover:bg-muted/30 transition-colors">
                      {/* Name */}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center text-xs font-bold flex-shrink-0 select-none">
                            {getInitials(emp.firstName, emp.lastName)}
                          </div>
                          <div>
                            <p>{getFullName(emp)}</p>
                            {emp.serialNumber && (
                              <span className="font-mono text-xs text-muted-foreground">{emp.serialNumber}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Position */}
                      <TableCell>
                        {emp.position ? (
                          <Badge variant="secondary" className="font-normal">{emp.position}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Office */}
                      <TableCell>{emp.officeName ?? '—'}</TableCell>

                      {/* Deleted at */}
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {emp.deletedAt
                          ? format(new Date(emp.deletedAt), 'dd MMM yyyy')
                          : '—'}
                      </TableCell>

                      {/* Reason */}
                      <TableCell>
                        {emp.deletionReason ? (
                          <span className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                            {emp.deletionReason}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">{t('former.no_reason')}</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            onClick={() => restoreMutation.mutate(emp.id)}
                            disabled={restoreMutation.isPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {t('former.restore')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmPermanent({ id: emp.id, name: getFullName(emp) })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog
        open={!!confirmPermanent}
        onOpenChange={(open) => { if (!open) setConfirmPermanent(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t('former.permanent_delete_title')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('former.permanent_delete_desc')}
            </p>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="font-semibold text-center">{confirmPermanent?.name}</p>
            </div>
            <p className="text-xs text-destructive font-medium">
              {t('former.permanent_delete_warning')}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmPermanent(null)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmPermanent && permanentDeleteMutation.mutate(confirmPermanent.id)}
              disabled={permanentDeleteMutation.isPending}
            >
              {t('former.permanent_delete_confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
