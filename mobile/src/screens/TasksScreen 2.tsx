import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { crmService, Task } from '../services/crm';

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  in_progress: { bg: '#dbeafe', color: '#1e40af' },
  completed: { bg: '#dcfce7', color: '#166534' },
  cancelled: { bg: '#f3f4f6', color: '#6b7280' },
};

export default function TasksScreen() {
  const { data: tasks, isLoading, refetch } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => crmService.getTasks(),
  });

  const renderItem = ({ item }: { item: Task }) => {
    const style = STATUS_STYLES[item.status] || STATUS_STYLES.pending;
    const isOverdue = item.due_date && item.status !== 'completed' && new Date(item.due_date) < new Date();

    return (
      <View style={[styles.card, isOverdue && styles.cardOverdue]}>
        <View style={styles.cardHeader}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: style.bg }]}>
            <Text style={[styles.statusText, { color: style.color }]}>
              {item.status.replace('_', ' ')}
            </Text>
          </View>
        </View>
        {item.description && (
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={styles.footer}>
          {item.due_date && (
            <Text style={[styles.date, isOverdue && styles.dateOverdue]}>
              Due: {new Date(item.due_date).toLocaleDateString()}
            </Text>
          )}
          {item.assigned_to_name && (
            <Text style={styles.assignee}>{item.assigned_to_name}</Text>
          )}
        </View>
        {item.task_type && item.task_type !== 'manual' && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{item.task_type.replace('_', ' ')}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={tasks || []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Loading...' : 'No tasks'}</Text>
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
  cardOverdue: { borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 15, fontWeight: '600', color: '#1a2332', flex: 1 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  description: { fontSize: 13, color: '#888', marginTop: 6 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  date: { fontSize: 12, color: '#666' },
  dateOverdue: { color: '#ef4444', fontWeight: '600' },
  assignee: { fontSize: 12, color: '#999' },
  typeBadge: { marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 10, color: '#666', textTransform: 'capitalize' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15 },
});
