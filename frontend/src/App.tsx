import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
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
import AILayout from './components/AILayout';
import DashboardV2 from './pages/DashboardV2';
import EnquiriesV2 from './pages/EnquiriesV2';
import EnquiriesListV2 from './pages/EnquiriesListV2';
import TenantsV2 from './pages/TenantsV2';
import BDMV2 from './pages/BDMV2';
import MaintenanceV2 from './pages/MaintenanceV2';
import TasksV2 from './pages/TasksV2';
import TransactionsV2 from './pages/TransactionsV2';
import PropertiesV2 from './pages/PropertiesV2';
import LandlordsV2 from './pages/LandlordsV2';

// V3
import LoginV3 from './pages/LoginV3';
import DashboardV3 from './pages/DashboardV3';
import PropertiesV3 from './pages/PropertiesV3';
import PropertyDetailV3 from './pages/PropertyDetailV3';
import LandlordsV3 from './pages/LandlordsV3';
import LandlordDetailV3 from './pages/LandlordDetailV3';
import TenantsV3 from './pages/TenantsV3';
import TenantDetailV3 from './pages/TenantDetailV3';
import EnquiriesV3 from './pages/EnquiriesV3';
import BDMV3 from './pages/BDMV3';
import MaintenanceV3 from './pages/MaintenanceV3';
import TasksV3 from './pages/TasksV3';
import TransactionsV3 from './pages/TransactionsV3';
import SettingsV3 from './pages/SettingsV3';

function ProtectedRoute({ children, bare }: { children: React.ReactNode; bare?: boolean }) {
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
  
  if (bare) return <>{children}</>;
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
    return <Navigate to="/v3" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginV3 /></PublicRoute>} />
      <Route path="/" element={<Navigate to="/v3" replace />} />
      
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
      
      {/* V2 — AI-first design */}
      <Route path="/v2" element={<ProtectedRoute bare><AILayout><DashboardV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/enquiries" element={<ProtectedRoute bare><AILayout><EnquiriesV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/enquiries/list" element={<ProtectedRoute bare><EnquiriesListV2 /></ProtectedRoute>} />
      <Route path="/v2/tenants" element={<ProtectedRoute bare><TenantsV2 /></ProtectedRoute>} />
      <Route path="/v2/bdm" element={<ProtectedRoute bare><AILayout><BDMV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/maintenance" element={<ProtectedRoute bare><AILayout><MaintenanceV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/tasks" element={<ProtectedRoute bare><AILayout><TasksV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/transactions" element={<ProtectedRoute bare><AILayout><TransactionsV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/properties" element={<ProtectedRoute bare><PropertiesV2 /></ProtectedRoute>} />
      <Route path="/v2/landlords" element={<ProtectedRoute bare><LandlordsV2 /></ProtectedRoute>} />
      
      <Route path="/applicant-concept" element={<ProtectedRoute bare><ApplicantConcept /></ProtectedRoute>} />

      {/* V3 — Dark mode redesign */}
      <Route path="/v3" element={<ProtectedRoute bare><DashboardV3 /></ProtectedRoute>} />
      <Route path="/v3/properties" element={<ProtectedRoute bare><PropertiesV3 /></ProtectedRoute>} />
      <Route path="/v3/properties/:id" element={<ProtectedRoute bare><PropertyDetailV3 /></ProtectedRoute>} />
      <Route path="/v3/landlords" element={<ProtectedRoute bare><LandlordsV3 /></ProtectedRoute>} />
      <Route path="/v3/landlords/:id" element={<ProtectedRoute bare><LandlordDetailV3 /></ProtectedRoute>} />
      <Route path="/v3/tenants" element={<ProtectedRoute bare><TenantsV3 /></ProtectedRoute>} />
      <Route path="/v3/tenants/:id" element={<ProtectedRoute bare><TenantDetailV3 /></ProtectedRoute>} />
      <Route path="/v3/enquiries" element={<ProtectedRoute bare><EnquiriesV3 /></ProtectedRoute>} />
      <Route path="/v3/bdm" element={<ProtectedRoute bare><BDMV3 /></ProtectedRoute>} />
      <Route path="/v3/maintenance" element={<ProtectedRoute bare><MaintenanceV3 /></ProtectedRoute>} />
      <Route path="/v3/tasks" element={<ProtectedRoute bare><TasksV3 /></ProtectedRoute>} />
      <Route path="/v3/financials" element={<ProtectedRoute bare><TransactionsV3 /></ProtectedRoute>} />
      <Route path="/v3/settings" element={<ProtectedRoute bare><SettingsV3 /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
