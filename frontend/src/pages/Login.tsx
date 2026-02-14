import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home, Mail, Lock, User, ArrowRight } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`)
      .then(res => {
        if (res.status === 401) {
          return fetch(`${API_URL}/api/auth/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        }
        return res;
      })
      .then(res => {
        if (res.status === 400) setIsSetup(false);
        else if (res.status === 500 || res.status === 200) setIsSetup(true);
      })
      .catch(() => setIsSetup(false))
      .finally(() => setCheckingSetup(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSetup) {
        const res = await fetch(`${API_URL}/api/auth/setup`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name })
        });
        if (!res.ok) throw new Error('Setup failed');
        setIsSetup(false);
      }
      await login(email, password);
      navigate('/');
    } catch (err: any) { setError(err.message || 'Login failed'); }
    finally { setLoading(false); }
  };

  if (checkingSetup) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
              <Home className="w-7 h-7 text-gray-900" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-white">Fleming Lettings</h1>
              <p className="text-gray-400 text-sm">Property Management System</p>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-lg p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {isSetup ? 'Create Admin Account' : 'Staff Login'}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {isSetup ? 'Set up your first admin account to get started' : 'Sign in to access the management portal'}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSetup && (
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-200 focus:outline-none focus:bg-white transition-all text-sm" required />
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" placeholder="you@fleminglettings.co.uk" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-200 focus:outline-none focus:bg-white transition-all text-sm" required />
              </div>
            </div>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-200 focus:outline-none focus:bg-white transition-all text-sm" required />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-6">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>{isSetup ? 'Create Account' : 'Sign In'}<ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>
        
        <p className="text-center text-gray-500 text-sm mt-6">Internal use only • © 2026 Fleming Lettings</p>
      </div>
    </div>
  );
}
