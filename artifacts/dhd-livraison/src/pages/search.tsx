import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Search, Users, ArrowRight } from 'lucide-react';
import { useListEmployees, getListEmployeesQueryKey } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function SearchPage() {
  const [location, navigate] = useLocation();
  const initial = new URLSearchParams(location.split('?')[1] ?? '').get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const { data: employees = [], isLoading } = useListEmployees(
    { search: query.trim() || undefined },
    { query: { queryKey: getListEmployeesQueryKey({ search: query.trim() || undefined }), enabled: query.trim().length > 0, staleTime: 15_000 } },
  );

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" aria-label="العودة" onClick={() => navigate('/dashboard')} className="rounded-xl p-2 hover:bg-muted">
          <ArrowRight className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">البحث</h1>
          <p className="mt-1 text-muted-foreground">ابحث عن موظف بالاسم أو الرقم التسلسلي</p>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اكتب اسم الموظف أو الرقم التسلسلي..." className="h-12 rounded-2xl ps-11" />
      </div>
      <Card>
        <CardContent className="p-0">
          {!query.trim() ? (
            <div className="p-12 text-center text-muted-foreground"><Search className="mx-auto mb-3 h-10 w-10 opacity-30" /><p>ابدأ بكتابة كلمة للبحث</p></div>
          ) : isLoading ? (
            <div className="p-12 text-center text-muted-foreground">جارٍ البحث...</div>
          ) : employees.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground"><Users className="mx-auto mb-3 h-10 w-10 opacity-30" /><p>لا توجد نتائج</p></div>
          ) : (
            <div className="divide-y">
              {employees.map((employee) => (
                <Link key={employee.id} href={`/employees/${employee.id}`} className="flex items-center justify-between p-4 transition-colors hover:bg-muted/40">
                  <div>
                    <p className="font-semibold">{employee.firstName} {employee.lastName}</p>
                    <p className="text-sm text-muted-foreground">{employee.position}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 rotate-180 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}