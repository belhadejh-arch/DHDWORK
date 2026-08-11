import React, { useState } from 'react';
import {
  useListAttendance, useUpdateAttendanceRecord, getListAttendanceQueryKey,
  getGetDashboardStatsQueryKey, getGetAttendanceChartQueryKey, type AttendanceRecord,
} from '@workspace/api-client-react';
import { useI18n } from '@/context/i18n';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Clock, Edit, CheckCircle2, XCircle, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export default function Attendance() {
  const { t } = useI18n();
  const [dateFilter, setDateFilter] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateAttendanceRecord();

  const { data: records = [], isLoading } = useListAttendance({ date: dateFilter });

  const [editForm, setEditForm] = useState({
    checkInTime: '', checkOutTime: '', isAbsent: false, notes: ''
  });

  const openEdit = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setEditForm({
      checkInTime: record.checkInTime || '',
      checkOutTime: record.checkOutTime || '',
      isAbsent: !!record.isAbsent,
      notes: record.notes || ''
    });
  };

  const handleUpdate = () => {
    if (!editingRecord) return;
    updateMutation.mutate(
      { 
        id: editingRecord.id, 
        data: {
          checkInTime: editForm.checkInTime || undefined,
          checkOutTime: editForm.checkOutTime || undefined,
          isAbsent: editForm.isAbsent,
          notes: editForm.notes
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAttendanceChartQueryKey() });
          setEditingRecord(null);
          toast({ title: t('attendance.toast.updated') });
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.attendance')}</h1>
        <p className="text-muted-foreground mt-1">{t('attendance.subtitle')}</p>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Input 
                type="date" 
                value={dateFilter} 
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-auto bg-muted/50"
              />
              <Button variant="outline" size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-emerald-500"></div> {t('attendance.status.present')}</div>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-rose-500"></div> {t('attendance.status.absent')}</div>
              <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-amber-500"></div> {t('attendance.status.late')}</div>
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>{t('attendance.col.employee')}</TableHead>
                  <TableHead>{t('attendance.col.office')}</TableHead>
                  <TableHead>{t('attendance.col.status')}</TableHead>
                  <TableHead>{t('attendance.col.checkin')}</TableHead>
                  <TableHead>{t('attendance.col.checkout')}</TableHead>
                  <TableHead>{t('attendance.col.duration')}</TableHead>
                  <TableHead className="text-right">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">{t('action.loading')}</TableCell></TableRow>
                ) : records.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">{t('attendance.empty')}</TableCell></TableRow>
                ) : (
                  records.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell>{r.officeName}</TableCell>
                      <TableCell>
                        {r.isAbsent ? (
                          <Badge variant="destructive" className="bg-rose-500/10 text-rose-600 border-0 hover:bg-rose-500/20"><XCircle className="w-3 h-3 mr-1"/>{t('attendance.status.absent')}</Badge>
                        ) : r.checkInTime ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-0 hover:bg-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1"/>{t('attendance.status.present')}</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-0">{t('status.pending')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.checkInTime ? <span className="font-mono">{r.checkInTime.slice(0,5)}</span> : '-'}
                      </TableCell>
                      <TableCell>
                        {r.checkOutTime ? <span className="font-mono">{r.checkOutTime.slice(0,5)}</span> : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          {r.workedMinutes != null && <div>{t('attendance.worked')} {Math.floor(r.workedMinutes/60)}h {r.workedMinutes%60}m</div>}
                          {r.lateMinutes ? <div className="text-amber-600 font-medium flex items-center"><Clock className="w-3 h-3 mr-1"/>{t('attendance.late')} {r.lateMinutes}m</div> : null}
                          {r.overtimeMinutes ? <div className="text-primary font-medium">{t('attendance.overtime')} {r.overtimeMinutes}m</div> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                          <Edit className="h-4 w-4 mr-2" /> {t('attendance.correct')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('attendance.modal.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('attendance.modal.checkin')}</label>
                <Input 
                  type="time" 
                  value={editForm.checkInTime} 
                  onChange={e => setEditForm({...editForm, checkInTime: e.target.value})} 
                  disabled={editForm.isAbsent}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('attendance.modal.checkout')}</label>
                <Input 
                  type="time" 
                  value={editForm.checkOutTime} 
                  onChange={e => setEditForm({...editForm, checkOutTime: e.target.value})}
                  disabled={editForm.isAbsent}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
              <input 
                type="checkbox" 
                checked={editForm.isAbsent} 
                onChange={e => setEditForm({...editForm, isAbsent: e.target.checked, checkInTime: '', checkOutTime: ''})}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">{t('attendance.modal.absent')}</span>
            </label>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('attendance.modal.notes')}</label>
              <Input 
                value={editForm.notes} 
                onChange={e => setEditForm({...editForm, notes: e.target.value})} 
                placeholder={t('attendance.modal.notes_placeholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRecord(null)}>{t('action.cancel')}</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>{t('attendance.modal.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
