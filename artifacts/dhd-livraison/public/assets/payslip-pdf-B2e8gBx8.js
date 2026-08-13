function a(i){return i==null?"0":i.toLocaleString("ar-DZ")}function $(i){if(!i)return"-";const t=Math.floor(i/60),s=i%60;return t>0?`${t}س ${s}د`:`${s}د`}function o(i){return{"01":"يناير","02":"فبراير","03":"مارس","04":"أبريل","05":"مايو","06":"يونيو","07":"يوليو","08":"أغسطس","09":"سبتمبر",10:"أكتوبر",11:"نوفمبر",12:"ديسمبر"}[i]??i}function w(i){if(i?.pdfUrl){const t=window.open(i.pdfUrl,"_blank");if(!t)window.location.assign(i.pdfUrl);return}const{salary:t,employee:s,companyName:g,attendanceRecords:p=[],advances:b=[],violations:m=[],leaveRequests:d=[],vacationRequests:n=[],bonuses:v=[]}=i,l=p.filter(e=>!e.isAbsent&&e.checkInTime),r=p.filter(e=>e.isAbsent),f=(t.lateDeductions||0)+(t.advanceDeductions||0)+(t.violationDeductions||0)+(t.otherDeductions||0),h=`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>كشف راتب — ${s.firstName} ${s.lastName} — ${o(t.month)} ${t.year}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #f5f5f5; color: #1a1a2e; direction: rtl; }
  .page { max-width: 800px; margin: 0 auto; background: white; padding: 0; }
  
  /* Header */
  .header { background: linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%); color: white; padding: 28px 36px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .company-name { font-size: 26px; font-weight: 800; letter-spacing: 1px; }
  .company-sub { font-size: 12px; opacity: 0.7; margin-top: 4px; }
  .payslip-title { text-align: left; }
  .payslip-title h2 { font-size: 18px; font-weight: 700; opacity: 0.9; }
  .payslip-title .period { font-size: 14px; opacity: 0.65; margin-top: 4px; }
  .header-info { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .info-item label { font-size: 10px; opacity: 0.55; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-item span { display: block; font-size: 14px; font-weight: 600; margin-top: 2px; }
  
  /* Salary Summary */
  .summary { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border-bottom: 3px solid #e2e8f0; }
  .summary-item { padding: 18px 24px; border-left: 1px solid #e2e8f0; text-align: center; }
  .summary-item:last-child { border-left: none; }
  .summary-item.highlight { background: #f0fdf4; }
  .summary-item.deduct { background: #fff5f5; }
  .summary-item.net { background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; }
  .sum-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .sum-label.white { color: rgba(255,255,255,0.7); }
  .sum-value { font-size: 22px; font-weight: 800; margin-top: 6px; color: #1a1a2e; }
  .sum-value.green { color: #16a34a; }
  .sum-value.red { color: #dc2626; }
  .sum-value.white { color: white; }
  .sum-currency { font-size: 12px; font-weight: 500; opacity: 0.6; }
  
  /* Body */
  .body { padding: 24px 36px; }
  
  /* Section */
  .section { margin-bottom: 28px; }
  .section-title { font-size: 14px; font-weight: 700; color: #1e3a5f; padding: 8px 14px; background: #f1f5f9; border-right: 4px solid #2563eb; border-radius: 4px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
  .section-badge { background: #2563eb; color: white; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
  
  /* Table */
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f8fafc; padding: 8px 10px; text-align: right; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; font-size: 11px; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
  .badge-present { background: #dcfce7; color: #166534; }
  .badge-absent { background: #fee2e2; color: #991b1b; }
  .badge-late { background: #fef9c3; color: #854d0e; }
  .mono { font-family: monospace; }
  .amount-positive { color: #16a34a; font-weight: 700; }
  .amount-negative { color: #dc2626; font-weight: 700; }
  
  /* Breakdown table */
  .breakdown-table { width: 100%; border-collapse: collapse; }
  .breakdown-table td { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .breakdown-table .label { color: #475569; }
  .breakdown-table .amount { text-align: left; font-weight: 700; font-size: 14px; font-family: monospace; }
  .breakdown-table tr:last-child td { border-bottom: 2px solid #e2e8f0; font-weight: 800; font-size: 15px; }
  
  /* Footer */
  .footer { border-top: 2px solid #e2e8f0; padding: 20px 36px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; font-size: 11px; color: #94a3b8; }
  .sign-box { border: 1px dashed #cbd5e1; padding: 12px 36px; border-radius: 8px; text-align: center; color: #94a3b8; font-size: 11px; }
  
  .empty-msg { text-align: center; color: #94a3b8; font-size: 12px; padding: 12px; font-style: italic; }
  
  @media print {
    body { background: white; }
    .page { max-width: 100%; }
    @page { margin: 10mm; size: A4; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <div>
        <div class="company-name">🚚 ${g}</div>
        <div class="company-sub">نظام إدارة الموارد البشرية</div>
      </div>
      <div class="payslip-title">
        <h2>كشف الراتب</h2>
        <div class="period">${o(t.month)} ${t.year}</div>
      </div>
    </div>
    <div class="header-info">
      <div class="info-item">
        <label>اسم الموظف</label>
        <span>${s.firstName} ${s.lastName}</span>
      </div>
      <div class="info-item">
        <label>المنصب</label>
        <span>${s.position||"-"}</span>
      </div>
      <div class="info-item">
        <label>المكتب</label>
        <span>${s.officeName||"-"}</span>
      </div>
      <div class="info-item">
        <label>أيام العمل</label>
        <span>${Array.isArray(s.workDays)&&s.workDays.length>0?s.workDays.join("، "):"الأحد، الإثنين، الثلاثاء، الأربعاء، الخميس"}</span>
      </div>
      ${s.serialNumber?`<div class="info-item"><label>الرقم التسلسلي</label><span>${s.serialNumber}</span></div>`:""}
      <div class="info-item">
        <label>فترة الراتب</label>
        <span>${o(t.month)} ${t.year}</span>
      </div>
      ${t.paidAt?`<div class="info-item"><label>تاريخ الصرف</label><span>${new Date(t.paidAt).toLocaleDateString("ar-DZ")}</span></div>`:""}
    </div>
  </div>
  
  <!-- Summary Cards -->
  <div class="summary">
    <div class="summary-item">
      <div class="sum-label">الراتب الأساسي</div>
      <div class="sum-value">${a(t.baseSalary)}</div>
      <div class="sum-currency">دج</div>
    </div>
    <div class="summary-item deduct">
      <div class="sum-label">إجمالي الخصومات</div>
      <div class="sum-value red">- ${a(f)}</div>
      <div class="sum-currency">دج</div>
    </div>
    <div class="summary-item net">
      <div class="sum-label white">صافي الراتب</div>
      <div class="sum-value white">${a(t.finalSalary)}</div>
      <div class="sum-currency white">دج</div>
    </div>
  </div>
  
  <div class="body">
  
    <!-- Payroll Breakdown -->
    <div class="section">
      <div class="section-title">ملخص الراتب التفصيلي</div>
      <table class="breakdown-table">
        <tr><td class="label">الراتب الأساسي</td><td class="amount amount-positive">${a(t.baseSalary)} دج</td></tr>
        ${t.overtimeBonus>0?`<tr><td class="label">➕ مكافأة الوقت الإضافي (${t.overtimeHours?.toFixed(1)}س)</td><td class="amount amount-positive">+ ${a(t.overtimeBonus)} دج</td></tr>`:""}
        ${t.bonuses>0?`<tr><td class="label">➕ المكافآت الإدارية</td><td class="amount amount-positive">+ ${a(t.bonuses)} دج</td></tr>`:""}
        ${t.lateDeductions>0?`<tr><td class="label">➖ خصم التأخر</td><td class="amount amount-negative">- ${a(t.lateDeductions)} دج</td></tr>`:""}
        ${t.advanceDeductions>0?`<tr><td class="label">➖ استرداد السلف</td><td class="amount amount-negative">- ${a(t.advanceDeductions)} دج</td></tr>`:""}
        ${t.violationDeductions>0?`<tr><td class="label">➖ خصم المخالفات</td><td class="amount amount-negative">- ${a(t.violationDeductions)} دج</td></tr>`:""}
        ${t.otherDeductions>0?`<tr><td class="label">➖ خصومات أخرى</td><td class="amount amount-negative">- ${a(t.otherDeductions)} دج</td></tr>`:""}
        <tr style="background:#f0fdf4"><td class="label" style="font-weight:800;color:#166534">💰 صافي الراتب</td><td class="amount" style="color:#16a34a;font-size:18px">${a(t.finalSalary)} دج</td></tr>
      </table>
    </div>
    
    <!-- Attendance Stats -->
    <div class="section">
      <div class="section-title">
        <span>إحصائيات الحضور — ${o(t.month)} ${t.year}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
        <div style="background:#f0fdf4;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#16a34a">${t.presentDays}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px">أيام الحضور</div>
        </div>
        <div style="background:#fff5f5;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#dc2626">${t.absentDays}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px">أيام الغياب</div>
        </div>
        <div style="background:#fffbeb;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#d97706">${t.workedHours?.toFixed(1)||0}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px">ساعات العمل</div>
        </div>
        <div style="background:#eff6ff;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#2563eb">${t.overtimeHours?.toFixed(1)||0}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px">ساعات إضافية</div>
        </div>
      </div>
    </div>
    
    <!-- Attendance Details -->
    ${l.length>0?`
    <div class="section">
      <div class="section-title">
        <span>تفاصيل الحضور اليومي</span>
        <span class="section-badge">${l.length} يوم</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>وقت الدخول</th>
            <th>وقت الخروج</th>
            <th>ساعات العمل</th>
            <th>التأخر</th>
            <th>وقت إضافي</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${l.map(e=>`
          <tr>
            <td class="mono">${e.date}</td>
            <td class="mono">${e.checkInTime||"-"}</td>
            <td class="mono">${e.checkOutTime||"-"}</td>
            <td>${$(e.workedMinutes)}</td>
            <td>${(e.lateMinutes??0)>0?`<span style="color:#d97706">${e.lateMinutes} د</span>`:"-"}</td>
            <td>${(e.overtimeMinutes??0)>0?`<span class="amount-positive">${e.overtimeMinutes} د</span>`:"-"}</td>
            <td>${(e.lateMinutes??0)>0?'<span class="badge badge-late">متأخر</span>':'<span class="badge badge-present">حاضر</span>'}</td>
          </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    `:""}
    
    <!-- Absences -->
    ${r.length>0?`
    <div class="section">
      <div class="section-title">
        <span>أيام الغياب</span>
        <span class="section-badge" style="background:#dc2626">${r.length} يوم</span>
      </div>
      <table>
        <thead>
          <tr><th>التاريخ</th><th>السبب</th><th>الحالة</th></tr>
        </thead>
        <tbody>
          ${r.map(e=>`
          <tr>
            <td class="mono">${e.date}</td>
            <td>${e.notes||"غياب"}</td>
            <td><span class="badge badge-absent">غائب</span></td>
          </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    `:""}
    
    <!-- Leave Requests -->
    ${d.length>0?`
    <div class="section">
      <div class="section-title">
        <span>الإجازات المعتمدة</span>
        <span class="section-badge">${d.length}</span>
      </div>
      <table>
        <thead>
          <tr><th>من</th><th>إلى</th><th>النوع</th><th>الوصف</th></tr>
        </thead>
        <tbody>
          ${d.map(e=>`
          <tr>
            <td class="mono">${e.startDate}</td>
            <td class="mono">${e.endDate}</td>
            <td>${e.leaveType}</td>
            <td>${e.description||"-"}</td>
          </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    `:""}
    
    <!-- Vacation Requests -->
    ${n.length>0?`
    <div class="section">
      <div class="section-title">
        <span>العطل المعتمدة</span>
        <span class="section-badge">${n.length}</span>
      </div>
      <table>
        <thead>
          <tr><th>من</th><th>إلى</th><th>عدد الأيام</th><th>الوصف</th></tr>
        </thead>
        <tbody>
          ${n.map(e=>{const u=new Date(e.startDate),x=new Date(e.endDate),y=Math.ceil((x.getTime()-u.getTime())/(1e3*60*60*24))+1;return`
          <tr>
            <td class="mono">${e.startDate}</td>
            <td class="mono">${e.endDate}</td>
            <td>${y} أيام</td>
            <td>${e.description||"-"}</td>
          </tr>`}).join("")}
        </tbody>
      </table>
    </div>
    `:""}
    
    <!-- Bonuses -->
    ${v.length>0?`
    <div class="section">
      <div class="section-title">
        <span>🎁 المكافآت الإدارية</span>
        <span class="section-badge" style="background:#d97706">${a(t.bonuses)} دج</span>
      </div>
      <table>
        <thead>
          <tr><th>التاريخ</th><th>السبب</th><th>ملاحظات</th><th>المبلغ</th></tr>
        </thead>
        <tbody>
          ${v.map(e=>`
          <tr>
            <td class="mono">${e.date}</td>
            <td>${e.reason}</td>
            <td>${e.notes||"-"}</td>
            <td class="amount-positive mono">+ ${a(e.amount)} دج</td>
          </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    `:""}

    <!-- Advances -->
    ${b.length>0?`
    <div class="section">
      <div class="section-title">
        <span>السلف المستردة</span>
        <span class="section-badge">${a(t.advanceDeductions)} دج</span>
      </div>
      <table>
        <thead>
          <tr><th>المبلغ</th><th>السبب</th><th>تاريخ الطلب</th></tr>
        </thead>
        <tbody>
          ${b.map(e=>`
          <tr>
            <td class="amount-negative mono">${a(e.amount)} دج</td>
            <td>${e.reason||"-"}</td>
            <td class="mono">${new Date(e.requestedAt).toLocaleDateString("ar-DZ")}</td>
          </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    `:""}
    
    <!-- Violations -->
    ${m.length>0?`
    <div class="section">
      <div class="section-title">
        <span>المخالفات المخصومة</span>
        <span class="section-badge" style="background:#dc2626">${a(t.violationDeductions)} دج</span>
      </div>
      <table>
        <thead>
          <tr><th>السبب</th><th>النوع</th><th>التاريخ</th><th>مبلغ الخصم</th></tr>
        </thead>
        <tbody>
          ${m.map(e=>`
          <tr>
            <td>${e.reason}</td>
            <td>${e.violationType||"-"}</td>
            <td class="mono">${e.violationDate||"-"}</td>
            <td class="amount-negative mono">${a(e.amount)} دج</td>
          </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    `:""}

  </div><!-- /body -->
  
  <!-- Footer -->
  <div class="footer">
    <div>
      <div style="font-weight:600;color:#475569">تم إنشاؤه بواسطة نظام DHD Livraison</div>
      <div>تاريخ الطباعة: ${new Date().toLocaleDateString("ar-DZ")}</div>
    </div>
    <div class="sign-box">
      <div>توقيع المسؤول</div>
      <div style="margin-top:24px;border-top:1px solid #cbd5e1;padding-top:4px">................................</div>
    </div>
  </div>
  
</div><!-- /page -->
<script>
  window.onload = function() {
    window.print();
  };
<\/script>
</body>
</html>`,c=window.open("","_blank","width=900,height=700");if(!c){alert("يرجى السماح بفتح النوافذ المنبثقة لطباعة كشف الراتب");return}c.document.write(h),c.document.close()}export{w as g};
