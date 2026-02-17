import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, LogOut, ChevronRight, X, Sun, Moon } from 'lucide-react';
import {
  DashboardIcon, EnquiriesIcon, PropertiesIcon, LandlordsIcon, TenantsIcon,
  BdmIcon, MaintenanceIcon, TasksIcon, FinancialsIcon, SettingsIcon
} from './v3/icons/FlemingIcons';
import FloatingAI from './v3/FloatingAI';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { to: '/v3', icon: DashboardIcon, label: 'Dashboard' },
  { to: '/v3/enquiries', icon: EnquiriesIcon, label: 'Enquiries' },
  { to: '/v3/properties', icon: PropertiesIcon, label: 'Properties' },
  { to: '/v3/landlords', icon: LandlordsIcon, label: 'Landlords' },
  { to: '/v3/tenants', icon: TenantsIcon, label: 'Tenants' },
  { to: '/v3/bdm', icon: BdmIcon, label: 'BDM' },
  { to: '/v3/maintenance', icon: MaintenanceIcon, label: 'Maintenance' },
  { to: '/v3/tasks', icon: TasksIcon, label: 'Tasks' },
  { to: '/v3/financials', icon: FinancialsIcon, label: 'Financials' },
  { to: '/v3/settings', icon: SettingsIcon, label: 'Settings' },
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
  const { theme, toggleTheme } = useTheme();

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-[var(--bg-page)] font-[Lufga] text-[var(--text-primary)] overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-[var(--overlay-bg)] z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--bg-page)] border-r border-[var(--border-subtle)] transition-all duration-200
        ${mobileOpen ? 'translate-x-0 w-52' : '-translate-x-full w-52'}
        md:static md:translate-x-0 ${collapsed ? 'md:w-16' : 'md:w-52'} shrink-0
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-[var(--border-subtle)]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
            F
          </div>
          {(!collapsed || mobileOpen) && <span className="font-semibold text-sm md:block">Fleming</span>}
          {/* Close on mobile */}
          <button onClick={() => setMobileOpen(false)} className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-secondary)] md:hidden">
            <X size={18} />
          </button>
          {/* Collapse on desktop */}
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-secondary)] hidden md:block">
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
                    ? 'bg-[var(--bg-input)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                }`
              }
            >
              <item.icon size={18} className="shrink-0" />
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user?.name?.[0] || 'U'}
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{user?.email || ''}</p>
              </div>
            )}
            {(!collapsed || mobileOpen) && (
              <button onClick={() => { logout(); navigate('/login'); }} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
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
          <header className="flex items-center justify-between px-4 md:px-8 h-14 md:h-16 border-b border-[var(--border-subtle)] shrink-0">
            <div className="flex items-center gap-3">
              {/* Hamburger on mobile */}
              <button onClick={() => setMobileOpen(true)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:hidden mr-1">
                <Menu size={22} />
              </button>
              {breadcrumb && breadcrumb.map((crumb, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight size={14} className="text-[var(--text-muted)]" />}
                  {crumb.to ? (
                    <button onClick={() => navigate(crumb.to!)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline text-sm">
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="text-[var(--text-muted)] text-sm">{crumb.label}</span>
                  )}
                </span>
              ))}
              {title && <h1 className="text-xl md:text-2xl font-bold">{title}</h1>}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={toggleTheme} className="p-2 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] transition-colors text-[var(--text-primary)]">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-xs font-bold text-white">
                {user?.name?.[0] || 'U'}
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user?.name || 'User'}</p>
                <p className="text-xs text-[var(--text-muted)]">{user?.email || ''}</p>
              </div>
            </div>
          </header>
        )}

        {/* Content – when hideTopBar, add mobile hamburger */}
        {hideTopBar && (
          <button onClick={() => setMobileOpen(true)} className="fixed top-4 left-4 z-30 text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:hidden bg-[var(--bg-card)] rounded-lg p-2 border border-[var(--border-input)]">
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
