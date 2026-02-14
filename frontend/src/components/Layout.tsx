import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Home, Building2, Users, UserCheck, Wrench, PoundSterling, LogOut,
  ClipboardList, Briefcase, CheckSquare, ChevronLeft, Search, Bell, Settings
} from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navSections = [
    {
      items: [
        { path: '/', label: 'Overview', icon: Home },
      ],
    },
    {
      label: 'Contacts',
      items: [
        { path: '/tenant-enquiries', label: 'Enquiries', icon: ClipboardList },
        { path: '/tenants', label: 'Tenants', icon: Users },
        { path: '/landlords', label: 'Landlords', icon: UserCheck },
        { path: '/landlords-bdm', label: 'BDM', icon: Briefcase },
      ],
    },
    {
      label: 'Property',
      items: [
        { path: '/properties', label: 'Properties', icon: Building2 },
        { path: '/maintenance', label: 'Maintenance', icon: Wrench },
      ],
    },
    {
      items: [
        { path: '/tasks', label: 'Tasks', icon: CheckSquare },
        { path: '/transactions', label: 'Financials', icon: PoundSterling },
      ],
    },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="h-screen flex bg-white overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-gray-200 bg-white transition-all duration-200 flex-shrink-0 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 bg-navy-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Home className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="font-bold text-gray-900 text-sm tracking-tight">Fleming</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navSections.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-4' : ''}>
              {section.label && !collapsed && (
                <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {section.label}
                </div>
              )}
              {section.items.map(item => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors mb-0.5 ${
                      active
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    } ${collapsed ? 'justify-center' : ''}`}
                  >
                    <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-gray-900' : ''}`} />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-gray-100 px-2 py-3 space-y-0.5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 w-full transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <ChevronLeft className={`w-[18px] h-[18px] transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            {!collapsed && 'Collapse'}
          </button>
          <button
            onClick={handleLogout}
            title="Sign out"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-gray-400 hover:text-red-600 hover:bg-red-50 w-full transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut className="w-[18px] h-[18px]" />
            {!collapsed && 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-6 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search or type a command"
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-400"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell className="w-[18px] h-[18px]" />
            </button>
            <div className="w-8 h-8 bg-navy-600 rounded-full flex items-center justify-center">
              <span className="text-xs font-semibold text-white">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
