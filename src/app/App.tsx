import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@/shared/i18n';
import { AuthProvider, useAuth } from '@/shared/contexts/AuthContext';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { ConfirmDialogProvider } from '@/shared/ui/confirm-dialog';
import DashboardLayout from '../layouts/DashboardLayout';
import Dashboard from '../pages/Dashboard';
import Project from '../pages/Project';
import Settings from '../pages/Settings';
import TasksPage from '../pages/TasksPage';
import LoginForm from '@/pages/components/LoginForm';

// Reports uses recharts (~524 KB gzipped as `charts-*.js`) — lazy so the
// Dashboard / Tasks / Project routes don't pay the cost. Gantt + Admin
// already lazy for the same reason.
const Reports = lazy(() => import('../pages/Reports'));
const Gantt = lazy(() => import('@/pages/Gantt'));
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

export default function App() {
 return (
 <QueryClientProvider client={queryClient}>
 <I18nextProvider i18n={i18n}>
 <AuthProvider>
 <TooltipProvider delayDuration={300}>
 <ConfirmDialogProvider>
 <Router>
 <Routes>
 <Route path="/login" element={<LoginForm />} />
 <Route path="/" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
 <Route index element={<Navigate to="/tasks" replace />} />
 <Route path="dashboard" element={<Dashboard />} />
 <Route
 path="reports"
 element={<Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading reports…</div>}><Reports /></Suspense>}
 />
 <Route path="project/:projectId" element={<Project />} />
 <Route path="project" element={<Project />} />
 <Route path="Project/:projectId" element={<Project />} />
 <Route path="Project" element={<Project />} />
 <Route path="tasks" element={<TasksPage />} />
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
 </I18nextProvider>
 </QueryClientProvider >
 );
}
