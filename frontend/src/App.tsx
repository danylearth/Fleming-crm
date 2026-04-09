import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Properties = lazy(() => import('./pages/Properties'));
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'));
const Landlords = lazy(() => import('./pages/Landlords'));
const LandlordDetail = lazy(() => import('./pages/LandlordDetail'));
const Tenants = lazy(() => import('./pages/Tenants'));
const TenantDetail = lazy(() => import('./pages/TenantDetail'));
const Enquiries = lazy(() => import('./pages/Enquiries'));
const EnquiryDetail = lazy(() => import('./pages/EnquiryDetail'));
const EnquiriesKanban = lazy(() => import('./pages/EnquiriesKanban'));
const BDM = lazy(() => import('./pages/BDM'));
const BDMDetail = lazy(() => import('./pages/BDMDetail'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Tasks = lazy(() => import('./pages/Tasks'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Settings = lazy(() => import('./pages/Settings'));
const Users = lazy(() => import('./pages/Users'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-navy-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900">
        <div className="w-8 h-8 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function V3Redirect() {
  const { '*': rest } = useParams();
  return <Navigate to={`/${rest || ''}`} replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <div className="w-8 h-8 border-2 border-[var(--border-color)] border-t-gold-500 rounded-full animate-spin" />
      </div>
    }>
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/v3/*" element={<V3Redirect />} />

      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/properties" element={<ProtectedRoute><Properties /></ProtectedRoute>} />
      <Route path="/properties/:id" element={<ProtectedRoute><PropertyDetail /></ProtectedRoute>} />
      <Route path="/landlords" element={<ProtectedRoute><Landlords /></ProtectedRoute>} />
      <Route path="/landlords/:id" element={<ProtectedRoute><LandlordDetail /></ProtectedRoute>} />
      <Route path="/tenants" element={<ProtectedRoute><Tenants /></ProtectedRoute>} />
      <Route path="/tenants/:id" element={<ProtectedRoute><TenantDetail /></ProtectedRoute>} />
      <Route path="/enquiries" element={<ProtectedRoute><Enquiries /></ProtectedRoute>} />
      <Route path="/enquiries/kanban" element={<ProtectedRoute><EnquiriesKanban /></ProtectedRoute>} />
      <Route path="/enquiries/:id" element={<ProtectedRoute><EnquiryDetail /></ProtectedRoute>} />
      <Route path="/bdm" element={<ProtectedRoute><BDM /></ProtectedRoute>} />
      <Route path="/bdm/:id" element={<ProtectedRoute><BDMDetail /></ProtectedRoute>} />
      <Route path="/maintenance" element={<ProtectedRoute><Maintenance /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/tasks/:id" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
      <Route path="/financials" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    </Routes>
    </Suspense>
  );
}
import { PortfolioProvider } from './context/PortfolioContext';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <PortfolioProvider>
            <AppRoutes />
          </PortfolioProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
