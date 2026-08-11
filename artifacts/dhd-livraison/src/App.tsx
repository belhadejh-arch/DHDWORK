import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider, useAuth } from '@/context/auth';
import { I18nProvider } from '@/context/i18n';
import { MainLayout } from '@/components/layout/MainLayout';
import { useEffect } from 'react';

// Lazy-loaded admin pages — only downloaded when navigated to
const Login = lazy(() => import('@/pages/login'));
const Dashboard = lazy(() => import('@/pages/dashboard'));
const Offices = lazy(() => import('@/pages/offices'));
const Employees = lazy(() => import('@/pages/employees'));
const EmployeeDetail = lazy(() => import('@/pages/employee-detail'));
const Attendance = lazy(() => import('@/pages/attendance'));
const Salaries = lazy(() => import('@/pages/salaries'));
const Notifications = lazy(() => import('@/pages/notifications'));
const Settings = lazy(() => import('@/pages/settings'));
const OfficeDetail = lazy(() => import('@/pages/office-detail'));
const Violations = lazy(() => import('@/pages/violations'));
const FormerEmployees = lazy(() => import('@/pages/former-employees'));
const Requests = lazy(() => import('@/pages/requests'));
const Advances = lazy(() => import('@/pages/advances'));
const LeaveRequests = lazy(() => import('@/pages/leave-requests'));
const VacationRequests = lazy(() => import('@/pages/vacation-requests'));
const Statistics = lazy(() => import('@/pages/statistics'));
const SearchPage = lazy(() => import('@/pages/search'));
const NotFound = lazy(() => import('@/pages/not-found'));

// Lazy-loaded employee portal pages
import { EmployeeAuthProvider } from '@/employee/auth';
import { EmployeeProtected } from '@/employee/EmployeeLayout';
const EmpLogin = lazy(() => import('@/employee/pages/emp-login'));
const EmpHome = lazy(() => import('@/employee/pages/emp-home'));
const EmpStats = lazy(() => import('@/employee/pages/emp-stats'));
const EmpRequests = lazy(() => import('@/employee/pages/emp-requests'));
const EmpViolations = lazy(() => import('@/employee/pages/emp-violations'));
const EmpAccount = lazy(() => import('@/employee/pages/emp-account'));

// Shared full-screen loading fallback
function PageLoader() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
      <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // don't refetch if data is < 30s old
      refetchOnWindowFocus: false,  // avoid cascade of requests on tab switch
      retry: 1,
      // 'always' ensures queries fire inside WebView / AppCreator where
      // navigator.onLine is often false, which would otherwise cause
      // TanStack Query to pause all fetches → infinite loading screens.
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

function ProtectedRoute({ component: Component, path }: { component: any, path: string }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) return null;

  return (
    <Route path={path}>
      <MainLayout>
        <Suspense fallback={<PageLoader />}>
          <Component />
        </Suspense>
      </MainLayout>
    </Route>
  );
}

function EmployeePortalRoute({ component: Component, path }: { component: any, path: string }) {
  return (
    <Route path={path}>
      <EmployeeProtected>
        <Suspense fallback={<PageLoader />}>
          <Component />
        </Suspense>
      </EmployeeProtected>
    </Route>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Suspense fallback={<PageLoader />}><Login /></Suspense>
      </Route>

      <Route path="/portal/login">
        <Suspense fallback={<PageLoader />}><EmpLogin /></Suspense>
      </Route>
      <EmployeePortalRoute path="/portal" component={EmpHome} />
      <EmployeePortalRoute path="/portal/stats" component={EmpStats} />
      <EmployeePortalRoute path="/portal/requests" component={EmpRequests} />
      <EmployeePortalRoute path="/portal/violations" component={EmpViolations} />
      <EmployeePortalRoute path="/portal/account" component={EmpAccount} />

      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/search" component={SearchPage} />
      <ProtectedRoute path="/offices" component={Offices} />
      <ProtectedRoute path="/offices/:id" component={OfficeDetail} />
      <ProtectedRoute path="/employees" component={Employees} />
      <ProtectedRoute path="/employees/:id" component={EmployeeDetail} />
      <ProtectedRoute path="/attendance" component={Attendance} />
      <ProtectedRoute path="/salaries" component={Salaries} />
      <ProtectedRoute path="/requests" component={Requests} />
      <ProtectedRoute path="/advances" component={Advances} />
      <ProtectedRoute path="/leave-requests" component={LeaveRequests} />
      <ProtectedRoute path="/vacation-requests" component={VacationRequests} />
      <ProtectedRoute path="/statistics" component={Statistics} />
      <ProtectedRoute path="/violations" component={Violations} />
      <ProtectedRoute path="/former-employees" component={FormerEmployees} />
      <ProtectedRoute path="/notifications" component={Notifications} />
      <ProtectedRoute path="/settings" component={Settings} />

      <Route>
        <MainLayout>
          <Suspense fallback={<PageLoader />}><NotFound /></Suspense>
        </MainLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <I18nProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <AuthProvider>
                <EmployeeAuthProvider>
                  <Router />
                </EmployeeAuthProvider>
              </AuthProvider>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
