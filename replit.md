# DHD Livraison

نظام إدارة الموظفين والمكاتب والحضور لشركة DHD للتوصيل، مع حسابات الأدمن والموظفين وتسجيل الدخول والتحقق عبر QR.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (managed artifact port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Employee entry point: `/employee-login.html`; after login, the existing portal at `/portal` loads the employee's attendance, check-out, and violations.

## Render Deployment

- Build command: `pnpm install --frozen-lockfile --prod=false && pnpm run build`
- Start command: `pnpm start`
- Health check path: `/healthz`
- Required environment variable: `DATABASE_URL`
- The repository includes `render.yaml` with the same web-service configuration.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/dhd-livraison/` — الواجهة المستوردة الأصلية المبنية بـVite، وتشمل لوحة الأدمن وحساب الموظف وشاشة QR.
- `artifacts/api-server/src/app.ts` — مسارات المصادقة والموظفين والمكاتب والحضور والتحقق من QR.
- `artifacts/api-server/src/dbStore.ts` — الوصول إلى PostgreSQL وتنسيق السجلات؛ PostgreSQL هو مصدر الحقيقة.
- `lib/db/src/schema/index.ts` — مخطط جداول PostgreSQL الحالي.
- `artifacts/dhd-livraison/public/assets/` — ملفات الواجهة الأصلية المجمعة، بما فيها ماسح الكاميرا ومكونات QR.

## Architecture decisions

- لا توجد بيانات موظفين تجريبية أو مزروعة؛ قوائم الموظفين والمكاتب والأدمن تقرأ من PostgreSQL مباشرة مع الحفاظ على IDs والعلاقات.
- QR يُقبل للتحقق أو تسجيل الدخول فقط إذا طابق `qr_code_data` المحفوظ للسجل الصحيح؛ الرقم التسلسلي ليس بديلًا عن QR.
- مسارات QR القديمة والجديدة (`qrcode` و`qr-code`) مدعومة للحفاظ على توافق الواجهة المستوردة.
- خدمة الويب في `/` وخدمة API في `/api`، وتتم إدارة الخدمتين عبر workflows المملوكة للـartifacts.

## Product

لوحة لإدارة الموظفين والمكاتب والحضور والطلبات والرواتب والإشعارات، مع حساب موظف منفصل وتسجيل دخول بالتسلسل أو QR، وإنشاء/عرض/تحميل/طباعة QR للكيانات المدعومة.

## User preferences

- تنفيذ الإصلاحات داخل النظام الحالي فقط؛ لا حذف أو استبدال بيانات PostgreSQL ولا إنشاء موظفين بدلاء.
- الحفاظ على IDs وعلاقات الموظفين بالمكاتب.
- منع QR غير المسجل وربطه بالحساب أو المكتب الصحيح.

## Gotchas

- يجب توفير `DATABASE_URL` قبل تشغيل API، ثم تطبيق المخطط التطويري عبر `pnpm --filter @workspace/db run push` عند استيراد مشروع جديد.
- خدمة الموظفين تستخدم مسارات `/api/employee/*` عبر proxy الواجهة حتى يعمل الدخول والبوابة في المعاينة والإنتاج.
- بعد تعديل API أعد تشغيل `artifacts/api-server: API Server`، وبعد تعديل الواجهة أعد تشغيل `artifacts/dhd-livraison: web`.
- اختبر من خلال proxy على `localhost:80` (`/api/...`) وليس المنافذ المحلية مباشرة.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
