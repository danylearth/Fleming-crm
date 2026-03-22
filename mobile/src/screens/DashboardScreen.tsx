import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { inventoryService } from '../services/inventory';
import { useAuth } from '../context/AuthContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();

  const { data: inventories, isLoading, refetch } = useQuery({
    queryKey: ['inventories'],
    queryFn: () => inventoryService.getInventories(),
  });

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => inventoryService.getProperties(),
  });

  const inProgressInventories = inventories?.filter(
    (inv) => inv.status === 'in_progress'
  ) || [];

  const completedToday = inventories?.filter(
    (inv) =>
      inv.completed_at &&
      new Date(inv.completed_at).toDateString() === new Date().toDateString()
  ) || [];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.userName}>{user?.name}</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{inProgressInventories.length}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedToday.length}</Text>
          <Text style={styles.statLabel}>Completed Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{properties?.length || 0}</Text>
          <Text style={styles.statLabel}>Properties</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('CreateInventory', {})}
        >
          <Text style={styles.actionButtonText}>+ New Inventory</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonSecondary]}
          onPress={() => navigation.navigate('Properties')}
        >
          <Text style={styles.actionButtonTextSecondary}>View Properties</Text>
        </TouchableOpacity>
      </View>

      {inProgressInventories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>In Progress</Text>
          {inProgressInventories.slice(0, 5).map((inventory) => (
            <TouchableOpacity
              key={inventory.id}
              style={styles.inventoryCard}
              onPress={() =>
                navigation.navigate('InventoryDetail', {
                  inventoryId: inventory.id,
                })
              }
            >
              <View>
                <Text style={styles.inventoryAddress}>
                  {inventory.property_address}
                </Text>
                <Text style={styles.inventoryType}>
                  {inventory.inventory_type.replace('_', ' ')} •{' '}
                  {new Date(inventory.inspection_date).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.inventoryBadge}>
                <Text style={styles.inventoryBadgeText}>
                  {inventory.photo_count || 0} photos
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1a2332',
    padding: 24,
    paddingTop: 16,
  },
  greeting: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.8,
  },
  userName: {
    color: '#d4af37',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a2332',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2332',
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#d4af37',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: '#1a2332',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#d4af37',
  },
  actionButtonTextSecondary: {
    color: '#d4af37',
    fontSize: 16,
    fontWeight: '600',
  },
  inventoryCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  inventoryAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a2332',
    marginBottom: 4,
  },
  inventoryType: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  inventoryBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inventoryBadgeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});
