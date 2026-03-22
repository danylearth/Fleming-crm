import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RootStackParamList } from '../types';
import { inventoryService } from '../services/inventory';

type RouteType = RouteProp<RootStackParamList, 'InventoryDetail'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function InventoryDetailScreen() {
  const route = useRoute<RouteType>();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const { inventoryId } = route.params;

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory', inventoryId],
    queryFn: () => inventoryService.getInventory(inventoryId),
  });

  const { data: rooms } = useQuery({
    queryKey: ['inventory-rooms', inventoryId],
    queryFn: () => inventoryService.getRooms(inventoryId),
  });

  const completeMutation = useMutation({
    mutationFn: () => inventoryService.completeInventory(inventoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', inventoryId] });
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      Alert.alert('Success', 'Inventory marked as completed');
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  if (!inventory) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>Inventory not found</Text>
      </View>
    );
  }

  const handleComplete = () => {
    Alert.alert(
      'Complete Inventory',
      'Mark this inventory as completed? You can still add photos later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: () => completeMutation.mutate(),
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <View style={styles.header}>
          <Text style={styles.sectionTitle}>Inventory Details</Text>
          <View
            style={[styles.statusBadge, styles[`status_${inventory.status}`]]}
          >
            <Text style={styles.statusText}>
              {inventory.status.replace('_', ' ')}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.label}>Property:</Text>
          <Text style={styles.value}>{inventory.property_address}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Type:</Text>
          <Text style={styles.value}>
            {inventory.inventory_type.replace('_', ' ')}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Date:</Text>
          <Text style={styles.value}>
            {new Date(inventory.inspection_date).toLocaleDateString()}
          </Text>
        </View>
        {inventory.tenant_name && (
          <View style={styles.detailRow}>
            <Text style={styles.label}>Tenant:</Text>
            <Text style={styles.value}>{inventory.tenant_name}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rooms ({rooms?.length || 0})</Text>
        {rooms && rooms.length > 0 ? (
          rooms.map((room) => (
            <TouchableOpacity
              key={room.id}
              style={styles.roomCard}
              onPress={() =>
                navigation.navigate('RoomCapture', {
                  inventoryId,
                  roomId: room.id,
                })
              }
            >
              <View style={styles.roomInfo}>
                <Text style={styles.roomName}>{room.room_name}</Text>
                <Text style={styles.roomType}>
                  {room.room_type.replace('_', ' ')}
                </Text>
              </View>
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeText}>
                  {room.photo_count || 0} photos
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>No rooms added yet</Text>
        )}

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('RoomCapture', { inventoryId })}
        >
          <Text style={styles.addButtonText}>+ Add Room</Text>
        </TouchableOpacity>
      </View>

      {inventory.status === 'in_progress' && (
        <TouchableOpacity
          style={styles.completeButton}
          onPress={handleComplete}
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.completeButtonText}>Mark as Completed</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#999',
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 8,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2332',
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  status_in_progress: {
    backgroundColor: '#fff3e0',
  },
  status_completed: {
    backgroundColor: '#e8f5e9',
  },
  status_approved: {
    backgroundColor: '#e3f2fd',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1a2332',
    textTransform: 'capitalize',
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#666',
    width: 100,
  },
  value: {
    fontSize: 14,
    color: '#1a2332',
    flex: 1,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  roomCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a2332',
    marginBottom: 4,
  },
  roomType: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  photoBadge: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  photoBadgeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    padding: 16,
  },
  addButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#d4af37',
    borderStyle: 'dashed',
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: {
    color: '#d4af37',
    fontSize: 16,
    fontWeight: '600',
  },
  completeButton: {
    backgroundColor: '#4caf50',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    margin: 16,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
