import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { crmService, MaintenanceRequest } from '../services/crm';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#6b7280',
};

export default function MaintenanceScreen() {
  const { data: maintenance, isLoading, refetch } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => crmService.getMaintenance(),
  });

  const renderItem = ({ item }: { item: MaintenanceRequest }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[item.priority] || '#999' }]} />
      </View>
      {item.property_address && (
        <Text style={styles.address}>{item.property_address}</Text>
      )}
      {item.description && (
        <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
      )}
      <View style={styles.footer}>
        <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] || '#999') + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || '#999' }]}>
            {item.status.replace('_', ' ')}
          </Text>
        </View>
        <Text style={styles.date}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={maintenance || []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Loading...' : 'No maintenance requests'}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  list: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: '#1a2332', flex: 1, marginRight: 8 },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  address: { fontSize: 13, color: '#666', marginTop: 4 },
  description: { fontSize: 13, color: '#888', marginTop: 6 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  date: { fontSize: 12, color: '#999' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15 },
});
