import api from './api';
import {
  Inventory,
  InventoryRoom,
  InventoryPhoto,
  Property,
} from '../types';

export const inventoryService = {
  // Properties
  async getProperties(): Promise<Property[]> {
    const response = await api.get<Property[]>('/api/properties');
    return response.data;
  },

  async getProperty(id: number): Promise<Property> {
    const response = await api.get<Property>(`/api/properties/${id}`);
    return response.data;
  },

  // Inventories
  async getInventories(): Promise<Inventory[]> {
    const response = await api.get<Inventory[]>('/api/inventories');
    return response.data;
  },

  async getInventory(id: number): Promise<Inventory> {
    const response = await api.get<Inventory>(`/api/inventories/${id}`);
    return response.data;
  },

  async createInventory(data: {
    property_id: number;
    tenant_id?: number;
    inventory_type: string;
    inspection_date: string;
    notes?: string;
  }): Promise<{ id: number }> {
    const response = await api.post<{ id: number }>('/api/inventories', data);
    return response.data;
  },

  async updateInventory(
    id: number,
    data: Partial<Inventory>
  ): Promise<{ success: boolean }> {
    const response = await api.put<{ success: boolean }>(
      `/api/inventories/${id}`,
      data
    );
    return response.data;
  },

  async completeInventory(id: number): Promise<{ success: boolean }> {
    const response = await api.put<{ success: boolean }>(
      `/api/inventories/${id}/complete`
    );
    return response.data;
  },

  // Rooms
  async getRooms(inventoryId: number): Promise<InventoryRoom[]> {
    const response = await api.get<InventoryRoom[]>(
      `/api/inventories/${inventoryId}/rooms`
    );
    return response.data;
  },

  async createRoom(
    inventoryId: number,
    data: {
      room_name: string;
      room_type: string;
      condition?: string;
      notes?: string;
    }
  ): Promise<{ id: number }> {
    const response = await api.post<{ id: number }>(
      `/api/inventories/${inventoryId}/rooms`,
      data
    );
    return response.data;
  },

  async updateRoom(
    roomId: number,
    data: Partial<InventoryRoom>
  ): Promise<{ success: boolean }> {
    const response = await api.put<{ success: boolean }>(
      `/api/inventory-rooms/${roomId}`,
      data
    );
    return response.data;
  },

  async deleteRoom(roomId: number): Promise<{ success: boolean }> {
    const response = await api.delete<{ success: boolean }>(
      `/api/inventory-rooms/${roomId}`
    );
    return response.data;
  },

  // Photos
  async getPhotos(inventoryId: number): Promise<InventoryPhoto[]> {
    const response = await api.get<InventoryPhoto[]>(
      `/api/inventories/${inventoryId}/photos`
    );
    return response.data;
  },

  async uploadPhoto(
    inventoryId: number,
    roomId: number,
    photo: {
      uri: string;
      fileName?: string;
      type?: string;
    },
    caption?: string
  ): Promise<InventoryPhoto> {
    const formData = new FormData();

    // @ts-ignore - React Native FormData supports uri
    formData.append('file', {
      uri: photo.uri,
      name: photo.fileName || `photo_${Date.now()}.jpg`,
      type: photo.type || 'image/jpeg',
    });

    if (caption) {
      formData.append('caption', caption);
    }

    const response = await api.post<InventoryPhoto>(
      `/api/inventory-photos/${inventoryId}/${roomId}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data;
  },

  async deletePhoto(photoId: number): Promise<{ success: boolean }> {
    const response = await api.delete<{ success: boolean }>(
      `/api/inventory-photos/${photoId}`
    );
    return response.data;
  },

  getPhotoUrl(filename: string): string {
    return `${api.defaults.baseURL}/uploads/inventory/${filename}`;
  },

  getThumbnailUrl(filename: string): string {
    return `${api.defaults.baseURL}/uploads/inventory/thumbnails/${filename}`;
  },
};
