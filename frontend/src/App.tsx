import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import PropertyDetail from './pages/PropertyDetail';
import Landlords from './pages/Landlords';
import LandlordDetail from './pages/LandlordDetail';
import LandlordsBDM from './pages/LandlordsBDM';
import LandlordBDMDetail from './pages/LandlordBDMDetail';
import Tenants from './pages/Tenants';
import TenantDetail from './pages/TenantDetail';
import TenantEnquiries from './pages/TenantEnquiries';
import TenantEnquiryDetail from './pages/TenantEnquiryDetail';
import Maintenance from './pages/Maintenance';
import Transactions from './pages/Transactions';
import Tasks from './pages/Tasks';
import ApplicantConcept from './pages/ApplicantConcept';

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
  
  return <Layout>{children}</Layout>;
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
      
      {/* Properties */}
      <Route path="/properties" element={<ProtectedRoute><Properties /></ProtectedRoute>} />
      <Route path="/properties/:id" element={<ProtectedRoute><PropertyDetail /></ProtectedRoute>} />
      
      {/* Landlords */}
      <Route path="/landlords" element={<ProtectedRoute><Landlords /></ProtectedRoute>} />
      <Route path="/landlords/:id" element={<ProtectedRoute><LandlordDetail /></ProtectedRoute>} />
      
      {/* Landlords BDM */}
      <Route path="/landlords-bdm" element={<ProtectedRoute><LandlordsBDM /></ProtectedRoute>} />
      <Route path="/landlords-bdm/:id" element={<ProtectedRoute><LandlordBDMDetail /></ProtectedRoute>} />
      
      {/* Tenants */}
      <Route path="/tenants" element={<ProtectedRoute><Tenants /></ProtectedRoute>} />
      <Route path="/tenants/:id" element={<ProtectedRoute><TenantDetail /></ProtectedRoute>} />
      
      {/* Tenant Enquiries */}
      <Route path="/tenant-enquiries" element={<ProtectedRoute><TenantEnquiries /></ProtectedRoute>} />
      <Route path="/tenant-enquiries/:id" element={<ProtectedRoute><TenantEnquiryDetail /></ProtectedRoute>} />
      
      {/* Maintenance */}
      <Route path="/maintenance" element={<ProtectedRoute><Maintenance /></ProtectedRoute>} />
      
      {/* Transactions */}
      <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
      
      {/* Tasks */}
      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      
      {/* Concept Pages */}
      <Route path="/applicant-concept" element={<ProtectedRoute><ApplicantConcept /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
