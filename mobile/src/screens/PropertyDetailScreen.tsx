import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { RootStackParamList } from '../types';
import { inventoryService } from '../services/inventory';

type RouteType = RouteProp<RootStackParamList, 'PropertyDetail'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function PropertyDetailScreen() {
  const route = useRoute<RouteType>();
  const navigation = useNavigation<NavigationProp>();
  const { propertyId } = route.params;

  const { data: property, isLoading } = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => inventoryService.getProperty(propertyId),
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>Property not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Property Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Address:</Text>
          <Text style={styles.value}>{property.address}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Postcode:</Text>
          <Text style={styles.value}>{property.postcode}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Type:</Text>
          <Text style={styles.value}>{property.property_type}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Bedrooms:</Text>
          <Text style={styles.value}>{property.bedrooms}</Text>
        </View>
        {property.landlord_name && (
          <View style={styles.detailRow}>
            <Text style={styles.label}>Landlord:</Text>
            <Text style={styles.value}>{property.landlord_name}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('CreateInventory', { propertyId })}
        >
          <Text style={styles.buttonText}>+ Create New Inventory</Text>
        </TouchableOpacity>
      </View>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a2332',
    marginBottom: 16,
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
  },
  button: {
    backgroundColor: '#d4af37',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#1a2332',
    fontSize: 16,
    fontWeight: '600',
  },
});
