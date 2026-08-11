import React, { useState } from 'react';
import { useGetAttendanceChart, useGetSalaryChart, useGetOfficeStats, useGetDashboardStats } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const shell = 'rounded-2xl border-0 shadow-[0_2px_12px_rgba(0,0,0,0.08)]';

export default function Statistics() {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: summary } = useGetDashboardStats({});
  const { data: attendance = [] } = useGetAttendanceChart({ period });
  const { data: salaries = [] } = useGetSalaryChart({ year });
  const { data: offices = [] } = useGetOfficeStats({} as any);
  return <div className="space-y-6" dir="rtl">
    <div><h1 className="text-2xl sm:text-3xl font-bold">الإحصائيات</h1><p className="text-muted-foreground mt-1">قراءة واضحة لأداء الفريق والعمليات</p></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[['الموظفون', summary?.totalEmployees ?? 0], ['الحاضرون اليوم', summary?.presentToday ?? 0], ['الغائبون اليوم', summary?.absentToday ?? 0], ['المتأخرون اليوم', summary?.lateToday ?? 0]].map(([label, value]) => <Card className={shell} key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-bold mt-2">{value}</p></CardContent></Card>)}
    </div>
    <div className="grid lg:grid-cols-2 gap-5">
      <Card className={shell}><CardHeader className="flex-row justify-between items-center"><CardTitle>الحضور والانصراف</CardTitle><div className="flex gap-1 bg-muted rounded-xl p-1">{(['7d','30d'] as const).map(p => <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded-lg text-xs ${period === p ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}>{p}</button>)}</div></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={attendance as any}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis /><Tooltip /><Line dataKey="present" stroke="#16a34a" strokeWidth={2.5} dot={false} /><Line dataKey="absent" stroke="#ef4444" strokeWidth={2.5} dot={false} /><Line dataKey="late" stroke="#f59e0b" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div></CardContent></Card>
      <Card className={shell}><CardHeader className="flex-row justify-between items-center"><CardTitle>الرواتب الشهرية</CardTitle><select value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-xl border bg-background px-3 py-1.5 text-sm">{[year-1, year, year+1].map(y => <option key={y}>{y}</option>)}</select></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={salaries as any}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis /><Tooltip /><Bar dataKey="totalSalaries" fill="hsl(var(--primary))" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
    </div>
    <Card className={shell}><CardHeader><CardTitle>أداء المكاتب</CardTitle></CardHeader><CardContent><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{(offices as any[]).map((office: any) => <div key={office.officeId} className="rounded-xl bg-muted/50 p-4"><p className="font-semibold">{office.officeName}</p><div className="flex justify-between text-sm mt-3"><span className="text-emerald-600">حاضر {office.presentToday}</span><span className="text-rose-600">غائب {office.absentToday}</span></div><div className="mt-3 h-2 rounded-full bg-rose-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${office.totalEmployees ? office.presentToday / office.totalEmployees * 100 : 0}%` }} /></div></div>)}</div></CardContent></Card>
  </div>;
}