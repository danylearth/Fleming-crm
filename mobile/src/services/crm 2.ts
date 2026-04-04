import api from './api';

export interface DashboardStats {
  properties: number;
  active_tenancies: number;
  open_maintenance: number;
  active_enquiries: number;
  overdue_tasks: number;
}

export interface MaintenanceRequest {
  id: number;
  property_id: number;
  property_address?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  reported_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  due_date?: string;
  assigned_to?: number;
  assigned_to_name?: string;
  entity_type?: string;
  entity_id?: number;
  task_type?: string;
  created_at: string;
}

export interface TenantSummary {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  property_address?: string;
  status?: string;
  move_in_date?: string;
}

export const crmService = {
  async getDashboard(): Promise<DashboardStats> {
    const response = await api.get('/api/dashboard');
    return response.data;
  },

  async getTenants(): Promise<TenantSummary[]> {
    const response = await api.get('/api/tenants');
    return response.data;
  },

  async getMaintenance(): Promise<MaintenanceRequest[]> {
    const response = await api.get('/api/maintenance');
    return response.data;
  },

  async getTasks(): Promise<Task[]> {
    const response = await api.get('/api/tasks');
    return response.data;
  },
};
