import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home, Building2, Users, UserCheck, Wrench, PoundSterling, LogOut, Menu, X, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/properties', label: 'Properties', icon: Building2 },
    { path: '/landlords', label: 'Landlords', icon: UserCheck },
    { path: '/tenants', label: 'Tenants', icon: Users },
    { path: '/maintenance', label: 'Maintenance', icon: Wrench },
    { path: '/transactions', label: 'Transactions', icon: PoundSterling },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy-900 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gold-500 rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-navy-900" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-white">Fleming Lettings</h1>
              </div>
            </div>
            
            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    location.pathname === item.path
                      ? 'bg-white/10 text-white'
                      : 'text-navy-200 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-white">{user?.name}</p>
                  <p className="text-xs text-navy-300 capitalize">{user?.role}</p>
                </div>
                <div className="w-9 h-9 bg-navy-700 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold text-gold-500">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              
              <button
                onClick={handleLogout}
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-navy-300 hover:text-white hover:bg-white/5 rounded-lg transition-all text-sm"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 text-white hover:bg-white/10 rounded-lg"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-navy-900/95 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div className="pt-20 px-4">
            <div className="bg-white rounded-2xl shadow-2xl p-4 space-y-1">
              <div className="px-4 py-3 border-b border-gray-100 mb-2">
                <p className="font-semibold text-navy-900">{user?.name}</p>
                <p className="text-sm text-gray-500 capitalize">{user?.role}</p>
              </div>
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                    location.pathname === item.path
                      ? 'bg-navy-900 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-50" />
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl w-full mt-2"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
