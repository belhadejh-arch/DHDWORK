import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/context/i18n';
import { empFetch } from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function EmpStats() {
  const { t } = useI18n();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['employee', 'attendance', month],
    queryFn: () => empFetch<any[]>(`/employee/attendance?month=${month}`),
    refetchInterval: 15_000,
  });

  const present = records.filter(r => r.checkInTime).length;
  const absent = records.filter(r => r.isAbsent).length;
  const late = records.filter(r => (r.lateMinutes ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('emp.stats.title')}</h1>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" dir="ltr" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-emerald-600">{present}</p><p className="text-xs text-muted-foreground">{t('emp.stats.present')}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-destructive">{absent}</p><p className="text-xs text-muted-foreground">{t('emp.stats.absent')}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-amber-600">{late}</p><p className="text-xs text-muted-foreground">{t('emp.stats.late')}</p></CardContent></Card>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t('action.loading')}</p>
        ) : records.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">{t('emp.stats.no_records')}</p>
        ) : (
          records.map(r => (
            <Card key={r.id} className="shadow-sm">
              <CardContent className="p-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium" dir="ltr">{r.date}</p>
                  {r.isAbsent ? (
                    <p className="text-destructive text-xs mt-0.5">{t('emp.stats.absent')}</p>
                  ) : (
                    <p className="text-muted-foreground text-xs mt-0.5" dir="ltr">
                      {r.checkInTime ?? '—'} → {r.checkOutTime ?? '—'}
                    </p>
                  )}
                </div>
                <div className="text-right space-y-0.5">
                  {(r.lateMinutes ?? 0) > 0 && (
                    <p className="text-amber-600 text-xs">{t('emp.stats.late')}: <span dir="ltr">{r.lateMinutes}</span> {t('emp.stats.minutes')}</p>
                  )}
                  {r.checkInTime && !r.isAbsent && (r.lateMinutes ?? 0) === 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">{t('emp.stats.present')}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
