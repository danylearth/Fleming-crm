import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, MessageSquare, Building2, Users, UserCheck,
  Briefcase, Wrench, CheckSquare, PoundSterling, Settings,
  Menu, LogOut, ChevronRight, X
} from 'lucide-react';
import FloatingAI from './v3/FloatingAI';

const navItems = [
  { to: '/v3', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/v3/enquiries', icon: MessageSquare, label: 'Enquiries' },
  { to: '/v3/properties', icon: Building2, label: 'Properties' },
  { to: '/v3/landlords', icon: Users, label: 'Landlords' },
  { to: '/v3/tenants', icon: UserCheck, label: 'Tenants' },
  { to: '/v3/bdm', icon: Briefcase, label: 'BDM' },
  { to: '/v3/maintenance', icon: Wrench, label: 'Maintenance' },
  { to: '/v3/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/v3/financials', icon: PoundSterling, label: 'Financials' },
  { to: '/v3/settings', icon: Settings, label: 'Settings' },
];

interface V3LayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumb?: { label: string; to?: string }[];
  hideTopBar?: boolean;
}

export default function V3Layout({ children, title, breadcrumb, hideTopBar }: V3LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-[#1a1a1a] font-[Lufga] text-white overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex flex-col bg-[#1a1a1a] border-r border-white/[0.06] transition-all duration-200
        ${mobileOpen ? 'translate-x-0 w-52' : '-translate-x-full w-52'}
        md:static md:translate-x-0 ${collapsed ? 'md:w-16' : 'md:w-52'} shrink-0
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-xs font-bold shrink-0">
            F
          </div>
          {(!collapsed || mobileOpen) && <span className="font-semibold text-sm md:block">Fleming</span>}
          {/* Close on mobile */}
          <button onClick={() => setMobileOpen(false)} className="ml-auto text-white/40 hover:text-white/70 md:hidden">
            <X size={18} />
          </button>
          {/* Collapse on desktop */}
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-white/40 hover:text-white/70 hidden md:block">
            <Menu size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/v3'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`
              }
            >
              <item.icon size={18} className="shrink-0" />
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-xs font-bold shrink-0">
              {user?.name?.[0] || 'U'}
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
                <p className="text-xs text-white/40 truncate">{user?.email || ''}</p>
              </div>
            )}
            {(!collapsed || mobileOpen) && (
              <button onClick={() => { logout(); navigate('/login'); }} className="text-white/30 hover:text-white/60">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        {!hideTopBar && (
          <header className="flex items-center justify-between px-4 md:px-8 h-14 md:h-16 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-3">
              {/* Hamburger on mobile */}
              <button onClick={() => setMobileOpen(true)} className="text-white/50 hover:text-white md:hidden mr-1">
                <Menu size={22} />
              </button>
              {breadcrumb && breadcrumb.map((crumb, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight size={14} className="text-white/30" />}
                  {crumb.to ? (
                    <button onClick={() => navigate(crumb.to!)} className="text-white/60 hover:text-white underline text-sm">
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="text-white/40 text-sm">{crumb.label}</span>
                  )}
                </span>
              ))}
              {title && <h1 className="text-xl md:text-2xl font-bold">{title}</h1>}
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-xs font-bold">
                {user?.name?.[0] || 'U'}
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user?.name || 'User'}</p>
                <p className="text-xs text-white/40">{user?.email || ''}</p>
              </div>
            </div>
          </header>
        )}

        {/* Content – when hideTopBar, add mobile hamburger */}
        {hideTopBar && (
          <button onClick={() => setMobileOpen(true)} className="fixed top-4 left-4 z-30 text-white/50 hover:text-white md:hidden bg-[#232323] rounded-lg p-2 border border-white/[0.1]">
            <Menu size={20} />
          </button>
        )}

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Floating AI */}
      <FloatingAI />
    </div>
  );
}
