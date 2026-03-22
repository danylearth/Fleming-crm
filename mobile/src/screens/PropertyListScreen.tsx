import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Property } from '../types';
import { inventoryService } from '../services/inventory';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function PropertyListScreen() {
  const navigation = useNavigation<NavigationProp>();

  const { data: properties, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['properties'],
    queryFn: () => inventoryService.getProperties(),
  });

  const renderProperty = ({ item }: { item: Property }) => (
    <TouchableOpacity
      style={styles.propertyCard}
      onPress={() => navigation.navigate('PropertyDetail', { propertyId: item.id })}
    >
      <View>
        <Text style={styles.address}>{item.address}</Text>
        <Text style={styles.details}>
          {item.property_type} • {item.bedrooms} bed • {item.postcode}
        </Text>
        {item.landlord_name && (
          <Text style={styles.landlord}>Landlord: {item.landlord_name}</Text>
        )}
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
        data={properties}
        renderItem={renderProperty}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#d4af37"
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No properties found</Text>
          </View>
        }
      />
    </View>
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
  list: {
    padding: 16,
  },
  propertyCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  address: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a2332',
    marginBottom: 6,
  },
  details: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  landlord: {
    fontSize: 12,
    color: '#999',
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  status_to_let: {
    backgroundColor: '#e3f2fd',
  },
  status_let_agreed: {
    backgroundColor: '#fff3e0',
  },
  status_full_management: {
    backgroundColor: '#e8f5e9',
  },
  status_rent_collection: {
    backgroundColor: '#f3e5f5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1a2332',
    textTransform: 'capitalize',
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
