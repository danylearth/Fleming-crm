import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
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
import EnquiryDetailV3 from './pages/EnquiryDetailV3';
import EnquiriesKanbanV3 from './pages/EnquiriesKanbanV3';
import BDMV3 from './pages/BDMV3';
import BDMDetailV3 from './pages/BDMDetailV3';
import MaintenanceV3 from './pages/MaintenanceV3';
import TasksV3 from './pages/TasksV3';
import TaskDetailV3 from './pages/TaskDetailV3';
import TransactionsV3 from './pages/TransactionsV3';
import SettingsV3 from './pages/SettingsV3';
import UsersV3 from './pages/UsersV3';

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
    return <Navigate to="/v3" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginV3 /></PublicRoute>} />
      <Route path="/" element={<Navigate to="/v3" replace />} />

      {/* V2 — AI-first design */}
      <Route path="/v2" element={<ProtectedRoute><AILayout><DashboardV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/enquiries" element={<ProtectedRoute><AILayout><EnquiriesV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/enquiries/list" element={<ProtectedRoute><EnquiriesListV2 /></ProtectedRoute>} />
      <Route path="/v2/tenants" element={<ProtectedRoute><TenantsV2 /></ProtectedRoute>} />
      <Route path="/v2/bdm" element={<ProtectedRoute><AILayout><BDMV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/maintenance" element={<ProtectedRoute><AILayout><MaintenanceV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/tasks" element={<ProtectedRoute><AILayout><TasksV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/transactions" element={<ProtectedRoute><AILayout><TransactionsV2 /></AILayout></ProtectedRoute>} />
      <Route path="/v2/properties" element={<ProtectedRoute><PropertiesV2 /></ProtectedRoute>} />
      <Route path="/v2/landlords" element={<ProtectedRoute><LandlordsV2 /></ProtectedRoute>} />

      {/* V3 — Dark mode redesign */}
      <Route path="/v3" element={<ProtectedRoute><DashboardV3 /></ProtectedRoute>} />
      <Route path="/v3/properties" element={<ProtectedRoute><PropertiesV3 /></ProtectedRoute>} />
      <Route path="/v3/properties/:id" element={<ProtectedRoute><PropertyDetailV3 /></ProtectedRoute>} />
      <Route path="/v3/landlords" element={<ProtectedRoute><LandlordsV3 /></ProtectedRoute>} />
      <Route path="/v3/landlords/:id" element={<ProtectedRoute><LandlordDetailV3 /></ProtectedRoute>} />
      <Route path="/v3/tenants" element={<ProtectedRoute><TenantsV3 /></ProtectedRoute>} />
      <Route path="/v3/tenants/:id" element={<ProtectedRoute><TenantDetailV3 /></ProtectedRoute>} />
      <Route path="/v3/enquiries" element={<ProtectedRoute><EnquiriesV3 /></ProtectedRoute>} />
      <Route path="/v3/enquiries/kanban" element={<ProtectedRoute><EnquiriesKanbanV3 /></ProtectedRoute>} />
      <Route path="/v3/enquiries/:id" element={<ProtectedRoute><EnquiryDetailV3 /></ProtectedRoute>} />
      <Route path="/v3/bdm" element={<ProtectedRoute><BDMV3 /></ProtectedRoute>} />
      <Route path="/v3/bdm/:id" element={<ProtectedRoute><BDMDetailV3 /></ProtectedRoute>} />
      <Route path="/v3/maintenance" element={<ProtectedRoute><MaintenanceV3 /></ProtectedRoute>} />
      <Route path="/v3/tasks" element={<ProtectedRoute><TasksV3 /></ProtectedRoute>} />
      <Route path="/v3/tasks/:id" element={<ProtectedRoute><TaskDetailV3 /></ProtectedRoute>} />
      <Route path="/v3/financials" element={<ProtectedRoute><TransactionsV3 /></ProtectedRoute>} />
      <Route path="/v3/users" element={<ProtectedRoute><UsersV3 /></ProtectedRoute>} />
      <Route path="/v3/settings" element={<ProtectedRoute><SettingsV3 /></ProtectedRoute>} />
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
