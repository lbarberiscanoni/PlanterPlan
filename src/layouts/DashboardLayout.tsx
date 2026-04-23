import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import Header from '@/features/navigation/components/Header';
import ProjectSidebarContainer from '@/features/navigation/components/ProjectSidebarContainer';
import { CommandPalette } from '@/shared/ui/CommandPalette';
import { useAuth } from '@/shared/contexts/AuthContext';
import MobileFAB from '@/features/mobile/components/MobileFAB';

export default function DashboardLayout({ sidebar, children }: { sidebar?: React.ReactNode, children?: React.ReactNode }) {
 const [sidebarOpen, setSidebarOpen] = useState(false);
 const { user, loading } = useAuth();
 const navigate = useNavigate();
 const { projectId } = useParams<{ projectId: string }>();

 useEffect(() => {
 if (!loading && !user) {
 navigate('/login');
 }
 }, [user, loading, navigate]);

 // Close the mobile sidebar on Escape — keyboard users can't tap the
 // backdrop, and the hamburger toggle may not be in their current tab
 // order. Only runs while the drawer is open.
 useEffect(() => {
 if (!sidebarOpen) return;
 const onKey = (e: KeyboardEvent) => {
 if (e.key === 'Escape') setSidebarOpen(false);
 };
 window.addEventListener('keydown', onKey);
 return () => window.removeEventListener('keydown', onKey);
 }, [sidebarOpen]);

 return (
 <>
 <div className="min-h-screen bg-background">
 <CommandPalette />
 <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} showMenuButton={true} />

 <aside
 className={cn(
 'fixed top-16 left-0 bottom-0 w-64 bg-card border-r border-border z-40 transition-transform duration-300 lg:translate-x-0 shadow-lg lg:shadow-none',
 sidebarOpen ? 'translate-x-0' : '-translate-x-full'
 )}
 >
 {sidebar ? (
 // If custom sidebar passed (e.g. ProjectSidebar with logic), render it
 sidebar
 ) : (
 // Default Sidebar for static pages
 <ProjectSidebarContainer
 onNavClick={() => setSidebarOpen(false)}
 selectedTaskId={projectId}
 />
 )}
 </aside>
 {/* Mobile overlay for sidebar — aria-hidden so SRs don't announce it
   * (it's a purely visual backdrop; the sidebar itself carries the
   * semantics). Keyboard users close the drawer via Escape (handled
   * at layout level) — the overlay is mouse/touch-only by design.
   * `tabIndex={-1}` ensures it's not reached via Tab either. */}
 {sidebarOpen && (
 <div
 className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
 onClick={() => setSidebarOpen(false)}
 aria-hidden="true"
 tabIndex={-1}
 />
 )}

 <main id="main-content" className="lg:pl-64 pt-6 h-[calc(100vh-4rem)] w-full overflow-x-hidden">{children || <Outlet />}</main>
 <MobileFAB />
 </div>
 </>
 );
}
