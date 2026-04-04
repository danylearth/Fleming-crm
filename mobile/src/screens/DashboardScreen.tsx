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
import { crmService } from '../services/crm';
import { useAuth } from '../context/AuthContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();

  const { data: dashboard, refetch: refetchDashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => crmService.getDashboard(),
  });

  const { data: inventories, isLoading, refetch: refetchInventories } = useQuery({
    queryKey: ['inventories'],
    queryFn: () => inventoryService.getInventories(),
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => crmService.getTasks(),
  });

  const inProgressInventories = inventories?.filter(
    (inv) => inv.status === 'in_progress'
  ) || [];

  const overdueTasks = (tasks || []).filter(
    (t) => t.due_date && t.status !== 'completed' && new Date(t.due_date) < new Date()
  );

  const refetch = () => {
    refetchDashboard();
    refetchInventories();
  };

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
          <Text style={styles.statNumber}>{dashboard?.properties ?? '—'}</Text>
          <Text style={styles.statLabel}>Properties</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{dashboard?.active_tenancies ?? '—'}</Text>
          <Text style={styles.statLabel}>Tenancies</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{dashboard?.open_maintenance ?? '—'}</Text>
          <Text style={styles.statLabel}>Maintenance</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{dashboard?.active_enquiries ?? '—'}</Text>
          <Text style={styles.statLabel}>Enquiries</Text>
        </View>
      </View>

      {overdueTasks.length > 0 && (
        <View style={styles.alertSection}>
          <Text style={styles.alertTitle}>Overdue Tasks ({overdueTasks.length})</Text>
          {overdueTasks.slice(0, 3).map((task) => (
            <View key={task.id} style={styles.alertCard}>
              <Text style={styles.alertText} numberOfLines={1}>{task.title}</Text>
              <Text style={styles.alertDate}>Due: {new Date(task.due_date!).toLocaleDateString()}</Text>
            </View>
          ))}
        </View>
      )}

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
    gap: 8,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a2332',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
  },
  alertSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 8,
  },
  alertCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  alertText: {
    fontSize: 14,
    color: '#1a2332',
    fontWeight: '500',
  },
  alertDate: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 2,
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
