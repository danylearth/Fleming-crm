import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { crmService, TenantSummary } from '../services/crm';

export default function TenantsScreen() {
  const [search, setSearch] = useState('');

  const { data: tenants, isLoading, refetch } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => crmService.getTenants(),
  });

  const filtered = (tenants || []).filter(
    (t) =>
      !search ||
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.property_address?.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }: { item: TenantSummary }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{item.name}</Text>
        {item.status && (
          <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : styles.badgeInactive]}>
            <Text style={styles.badgeText}>{item.status}</Text>
          </View>
        )}
      </View>
      {item.property_address && (
        <Text style={styles.address}>{item.property_address}</Text>
      )}
      <View style={styles.contactRow}>
        {item.phone && (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.phone}`)}>
            <Text style={styles.contactLink}>{item.phone}</Text>
          </TouchableOpacity>
        )}
        {item.email && (
          <TouchableOpacity onPress={() => Linking.openURL(`mailto:${item.email}`)}>
            <Text style={styles.contactLink}>{item.email}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchBar}
        placeholder="Search tenants..."
        placeholderTextColor="#999"
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Loading...' : 'No tenants found'}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchBar: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 15,
    color: '#1a2332',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
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
  name: { fontSize: 16, fontWeight: '600', color: '#1a2332' },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeActive: { backgroundColor: '#dcfce7' },
  badgeInactive: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize', color: '#1a2332' },
  address: { fontSize: 14, color: '#666', marginTop: 4 },
  contactRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  contactLink: { fontSize: 13, color: '#d4af37', fontWeight: '500' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15 },
});
