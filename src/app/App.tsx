import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { i18n } from '@/shared/i18n';
import { AuthProvider } from '@/shared/contexts/AuthContext';
import { useAuth } from '@/shared/contexts/auth-context';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { ConfirmDialogProvider } from '@/shared/ui/confirm-dialog';
import { publicEnvValidation, type PublicEnvValidation } from '@/shared/config/public-env';
import AppShellLayout from '@/layouts/AppShellLayout';
import Project from '@/pages/Project';
import Settings from '@/pages/Settings';
import TasksPage from '@/pages/TasksPage';
import LoginForm from '@/pages/components/LoginForm';
import ResetPassword from '@/pages/ResetPassword';

// Reports uses recharts (~524 KB gzipped as `charts-*.js`) — lazy so the
// primary Tasks / Project routes don't pay the cost. Gantt + Admin are already
// lazy for the same reason.
const Reports = lazy(() => import('@/pages/Reports'));
const Gantt = lazy(() => import('@/pages/Gantt'));
const Team = lazy(() => import('@/pages/Team'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminHome = lazy(() => import('@/pages/admin/AdminHome'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminAnalytics = lazy(() => import('@/pages/admin/AdminAnalytics'));
const AdminTemplates = lazy(() => import('@/pages/admin/AdminTemplates'));

const queryClient = new QueryClient();

function PrivateRoute({ children }: { children: React.ReactNode }) {
 const { user, loading } = useAuth();
 if (loading) return null;
 return user ? <>{children}</> : <Navigate to="/login" />;
}

export function BootConfigGate({
 children,
 validation = publicEnvValidation,
}: {
 children: React.ReactNode;
 validation?: PublicEnvValidation;
}) {
 const { t } = useTranslation();

 if (validation.isValid) return <>{children}</>;

 return (
 <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6" data-testid="boot-config-error">
 <section
 className="w-full max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-sm"
 role="alert"
 aria-labelledby="boot-error-title"
 >
 <h1 id="boot-error-title" className="text-xl font-semibold text-slate-900">{t('errors.boot_config_title')}</h1>
 <p className="mt-2 text-sm text-slate-600">{t('errors.boot_config_description')}</p>
 <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
 <p className="text-xs font-medium uppercase text-slate-500">{t('errors.boot_config_missing_label')}</p>
 <code className="mt-1 block break-all text-sm text-slate-900">
 {validation.missingKeys.join(', ')}
 </code>
 </div>
 <p className="mt-4 text-sm text-slate-600">{t('errors.boot_config_help')}</p>
 <p className="mt-2 text-xs text-slate-500">{t('errors.boot_config_no_values')}</p>
 </section>
 </main>
 );
}

export default function App() {
 return (
 <QueryClientProvider client={queryClient}>
 <I18nextProvider i18n={i18n}>
 <BootConfigGate>
 <AuthProvider>
 <TooltipProvider delayDuration={300}>
 <ConfirmDialogProvider>
 <Router>
 <Routes>
 <Route path="/login" element={<LoginForm />} />
 <Route path="/reset-password" element={<ResetPassword />} />
 <Route path="/" element={<PrivateRoute><AppShellLayout /></PrivateRoute>}>
 <Route index element={<Navigate to="/tasks" replace />} />
 <Route path="dashboard" element={<Navigate to="/tasks" replace />} />
 <Route
 path="reports"
 element={<Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading reports…</div>}><Reports /></Suspense>}
 />
 <Route path="project/:projectId" element={<Project />} />
 <Route path="project" element={<Project />} />
 <Route path="Project/:projectId" element={<Project />} />
 <Route path="Project" element={<Project />} />
 <Route path="tasks" element={<TasksPage />} />
 <Route
 path="team"
 element={<Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading team…</div>}><Team /></Suspense>}
 />
 <Route path="daily" element={<Navigate to="/tasks" replace />} />
 <Route path="settings" element={<Settings />} />
 <Route
 path="gantt"
 element={<Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading gantt…</div>}><Gantt /></Suspense>}
 />
 <Route
 path="admin"
 element={<Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading admin…</div>}><AdminLayout /></Suspense>}
 >
 <Route index element={<Suspense fallback={null}><AdminHome /></Suspense>} />
 <Route path="users" element={<Suspense fallback={null}><AdminUsers /></Suspense>} />
 <Route path="users/:uid" element={<Suspense fallback={null}><AdminUsers /></Suspense>} />
 <Route path="analytics" element={<Suspense fallback={null}><AdminAnalytics /></Suspense>} />
 <Route path="templates" element={<Suspense fallback={null}><AdminTemplates /></Suspense>} />
 </Route>
 </Route>
 </Routes>
 </Router>
 <Toaster richColors position="top-right" />
 </ConfirmDialogProvider>
 </TooltipProvider>
 </AuthProvider>
 </BootConfigGate>
 </I18nextProvider>
 </QueryClientProvider >
 );
}
