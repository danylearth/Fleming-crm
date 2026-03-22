import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Inventory } from '../types';
import { inventoryService } from '../services/inventory';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function InventoryListScreen() {
  const navigation = useNavigation<NavigationProp>();

  const { data: inventories, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['inventories'],
    queryFn: () => inventoryService.getInventories(),
  });

  const renderInventory = ({ item }: { item: Inventory }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('InventoryDetail', { inventoryId: item.id })}
    >
      <View style={styles.cardContent}>
        <Text style={styles.address}>{item.property_address}</Text>
        <Text style={styles.type}>{item.inventory_type.replace('_', ' ')}</Text>
        <Text style={styles.date}>{new Date(item.inspection_date).toLocaleDateString()}</Text>
      </View>
      <View style={[styles.statusBadge, styles[`status_${item.status}`]]}>
        <Text style={styles.statusText}>{item.status.replace('_', ' ')}</Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={inventories}
        renderItem={renderInventory}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#d4af37" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No inventories yet</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('CreateInventory', {})}
            >
              <Text style={styles.createButtonText}>+ Create First Inventory</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: { flex: 1 },
  address: { fontSize: 16, fontWeight: '600', color: '#1a2332', marginBottom: 4 },
  type: { fontSize: 14, color: '#666', textTransform: 'capitalize', marginBottom: 2 },
  date: { fontSize: 12, color: '#999' },
  statusBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, height: 28 },
  status_in_progress: { backgroundColor: '#fff3e0' },
  status_completed: { backgroundColor: '#e8f5e9' },
  status_approved: { backgroundColor: '#e3f2fd' },
  status_disputed: { backgroundColor: '#ffebee' },
  statusText: { fontSize: 12, fontWeight: '500', color: '#1a2332', textTransform: 'capitalize' },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999', marginBottom: 24 },
  createButton: { backgroundColor: '#d4af37', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  createButtonText: { color: '#1a2332', fontSize: 16, fontWeight: '600' },
});
