import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/context/i18n';
import { empFetch } from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

interface Violation {
  id: number;
  reason: string;
  amount: number | null;
  notes: string | null;
  status: 'pending' | 'deducted';
  createdAt: string;
}

export default function EmpViolations() {
  const { t } = useI18n();

  const { data: violations = [], isLoading } = useQuery<Violation[]>({
    queryKey: ['employee', 'violations'],
    queryFn: () => empFetch<Violation[]>('/employee/violations'),
    refetchInterval: 5_000,
  });

  const pending = violations.filter(v => v.status === 'pending');
  const deducted = violations.filter(v => v.status === 'deducted');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('emp.violations.title')}</h1>
        {pending.length > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {pending.length}
          </Badge>
        )}
      </div>

      {/* Summary cards */}
      {violations.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('violations.status.pending')}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{deducted.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('violations.status.deducted')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-10">{t('action.loading')}</p>
      ) : violations.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <ShieldAlert className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm">{t('emp.violations.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {violations.map(v => (
            <Card key={v.id} className={`shadow-sm border-r-4 ${v.status === 'deducted' ? 'border-r-emerald-500' : 'border-r-amber-500'}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm leading-snug flex-1">{v.reason}</p>
                  <Badge
                    variant="outline"
                    className={v.status === 'deducted'
                      ? 'bg-emerald-500/10 text-emerald-600 border-0 whitespace-nowrap text-xs'
                      : 'bg-amber-500/10 text-amber-600 border-0 whitespace-nowrap text-xs'
                    }
                  >
                    {t(`emp.violations.status.${v.status}`)}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(v.createdAt), 'dd MMM yyyy')}
                  </span>
                  {v.amount != null ? (
                    <span className="font-bold font-mono text-destructive">
                      − {v.amount.toLocaleString()} DZD
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      {t('violations.amount_open')}
                    </span>
                  )}
                </div>

                {v.notes && (
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
                    {v.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
