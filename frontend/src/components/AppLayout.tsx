import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Settings,
  Users,
  X,
} from 'lucide-react';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('menu') === '1') {
      setMobileMenuOpen(true);
      params.delete('menu');
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: true }
      );
    }
  }, [location.pathname, location.search, navigate]);

  const navItems = useMemo(
    () => [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
      { icon: Briefcase, label: 'Jobs', path: '/jobs' },
      { icon: Users, label: 'Candidates', path: '/candidates' },
      { icon: Calendar, label: 'Interviews', path: '/interviews' },
      { icon: BarChart3, label: 'Reports', path: '/reports' },
      { icon: Settings, label: 'Settings', path: '/settings' },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <aside
        className={`fixed left-0 top-0 h-full bg-[#8D5DF4] text-white border-r border-white/15 shadow-[inset_-1px_0_0_rgba(255,255,255,0.16),0_0_0_1px_rgba(255,255,255,0.06)] z-50 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'
          } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex flex-col h-full relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/[0.16] via-white/[0.06] to-transparent" />

          <div className="h-16 flex items-center justify-between px-4 border-b border-white/15 bg-gradient-to-b from-white/[0.10] to-transparent">
            <div className={`flex items-center gap-2 min-w-0 ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
              <img
                src="/assets/logo.png"
                alt="Amanzi ATS"
                className="h-5 w-auto object-contain brightness-0 invert"
              />
            </div>

            <div className="flex items-center gap-2">
              {!sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="hidden lg:block p-2 rounded-lg transition-colors hover:bg-card/10 focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="lg:hidden p-2 rounded-lg transition-colors hover:bg-card/10 focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                <X size={18} />
              </button>
            </div>

            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="absolute inset-0 w-full h-full opacity-0 z-10 lg:block hidden"
              />
            )}
          </div>

          <nav className="flex-1 p-4 space-y-1.5">
            {navItems.map((item) => {
              const pathNow = location.pathname || '';
              const isActive =
                item.path === '/dashboard'
                  ? pathNow === '/dashboard'
                  : pathNow === item.path || pathNow.startsWith(item.path + '/');

              return (
                <button
                  key={item.label}
                  onClick={() => {
                    navigate(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${sidebarCollapsed ? 'justify-center' : ''
                    } ${isActive
                      ? 'bg-gradient-to-r from-white/26 to-white/14 text-white ring-1 ring-white/30 shadow-[0_14px_28px_rgba(0,0,0,0.35)]'
                      : 'text-white/85 hover:text-white hover:bg-card/14'
                    }`}
                >
                  <span
                    className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full transition-opacity ${isActive
                      ? 'bg-card opacity-100 shadow-[0_0_12px_rgba(255,255,255,0.65)]'
                      : 'opacity-0 group-hover:opacity-70 bg-card/70'
                      }`}
                  />
                  <span className="relative inline-flex items-center justify-center">
                    <item.icon size={18} className="flex-shrink-0 opacity-90" />
                  </span>
                  {!sidebarCollapsed && (
                    <span className="text-[14px] font-medium whitespace-nowrap">{item.label}</span>
                  )}
                </button>
              );
            })}
          </nav>

        </div>
      </aside>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen`}>
        <Outlet />
      </div>
    </div>
  );
}
