import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import PropertyDetail from './pages/PropertyDetail';
import Landlords from './pages/Landlords';
import LandlordDetail from './pages/LandlordDetail';
import Tenants from './pages/Tenants';
import TenantDetail from './pages/TenantDetail';
import Enquiries from './pages/Enquiries';
import EnquiryDetail from './pages/EnquiryDetail';
import EnquiriesKanban from './pages/EnquiriesKanban';
import BDM from './pages/BDM';
import BDMDetail from './pages/BDMDetail';
import Maintenance from './pages/Maintenance';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import Users from './pages/Users';

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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

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
