// User & Auth Types
export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'staff' | 'viewer';
}

export interface AuthResponse {
  user: User;
  token: string;
}

// Property Types
export interface Property {
  id: number;
  landlord_id: number;
  address: string;
  postcode: string;
  property_type: string;
  bedrooms: number;
  status: string;
  landlord_name?: string;
  current_tenant?: string;
  created_at: string;
  updated_at: string;
}

// Tenant Types
export interface Tenant {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  property_id?: number;
  property_address?: string;
  created_at: string;
}

// Inventory Types
export interface Inventory {
  id: number;
  property_id: number;
  tenant_id?: number;
  inventory_type: 'check_in' | 'check_out' | 'periodic' | 'mid_term';
  inspection_date: string;
  conducted_by: number;
  status: 'in_progress' | 'completed' | 'approved' | 'disputed';
  overall_condition?: 'excellent' | 'good' | 'fair' | 'poor';
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  // Joined data
  property_address?: string;
  tenant_name?: string;
  conducted_by_name?: string;
}

export interface InventoryRoom {
  id: number;
  inventory_id: number;
  room_name: string;
  room_type: 'bedroom' | 'living_room' | 'kitchen' | 'bathroom' | 'hallway' | 'garden' | 'other';
  condition?: 'excellent' | 'good' | 'fair' | 'poor';
  notes?: string;
  created_at: string;
  photo_count?: number;
}

export interface InventoryItem {
  id: number;
  room_id: number;
  item_name: string;
  item_type?: string;
  quantity: number;
  condition?: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
  notes?: string;
  meter_reading?: number;
  created_at: string;
}

export interface InventoryPhoto {
  id: number;
  inventory_id: number;
  room_id?: number;
  item_id?: number;
  filename: string;
  original_name?: string;
  mime_type?: string;
  size?: number;
  width?: number;
  height?: number;
  thumbnail_filename?: string;
  ai_enhanced_filename?: string;
  ai_enhancement_status?: 'pending' | 'processing' | 'completed' | 'failed';
  photo_order: number;
  caption?: string;
  taken_at: string;
  uploaded_by?: number;
  created_at: string;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success?: boolean;
}

// Navigation Types
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Dashboard: undefined;
  PropertyList: undefined;
  PropertyDetail: { propertyId: number };
  InventoryList: undefined;
  InventoryDetail: { inventoryId: number };
  CreateInventory: { propertyId?: number };
  InventoryCapture: { inventoryId: number };
  RoomCapture: { inventoryId: number; roomId?: number };
  Camera: { inventoryId: number; roomId: number };
  PhotoReview: { inventoryId: number; roomId: number; photos: LocalPhoto[] };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Properties: undefined;
  Inventories: undefined;
  Profile: undefined;
};

// Local Photo (before upload)
export interface LocalPhoto {
  uri: string;
  width?: number;
  height?: number;
  type?: string;
  fileName?: string;
  fileSize?: number;
  caption?: string;
  timestamp: string;
}

// Upload Queue Item
export interface UploadQueueItem {
  id: string;
  inventoryId: number;
  roomId: number;
  photo: LocalPhoto;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  error?: string;
  retryCount: number;
  createdAt: string;
}
