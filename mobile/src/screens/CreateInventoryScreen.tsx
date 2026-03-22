import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RootStackParamList } from '../types';
import { inventoryService } from '../services/inventory';
import { Picker } from '@react-native-picker/picker';

type RouteType = RouteProp<RootStackParamList, 'CreateInventory'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CreateInventoryScreen() {
  const route = useRoute<RouteType>();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();

  const [propertyId, setPropertyId] = useState(route.params?.propertyId?.toString() || '');
  const [inventoryType, setInventoryType] = useState<string>('check_in');
  const [inspectionDate, setInspectionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => inventoryService.getProperties(),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => inventoryService.createInventory(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      Alert.alert('Success', 'Inventory created successfully', [
        {
          text: 'OK',
          onPress: () => {
            navigation.replace('InventoryDetail', { inventoryId: data.id });
          },
        },
      ]);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create inventory');
    },
  });

  const handleCreate = () => {
    if (!propertyId || !inventoryType || !inspectionDate) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    createMutation.mutate({
      property_id: parseInt(propertyId),
      inventory_type: inventoryType,
      inspection_date: inspectionDate,
      notes,
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Property *</Text>
        {route.params?.propertyId ? (
          <Text style={styles.readOnly}>
            {properties?.find((p) => p.id === route.params.propertyId)?.address ||
              'Loading...'}
          </Text>
        ) : (
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={propertyId}
              onValueChange={(value) => setPropertyId(value)}
              style={styles.picker}
            >
              <Picker.Item label="Select a property" value="" />
              {properties?.map((property) => (
                <Picker.Item
                  key={property.id}
                  label={property.address}
                  value={property.id.toString()}
                />
              ))}
            </Picker>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Inventory Type *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={inventoryType}
            onValueChange={(value) => setInventoryType(value)}
            style={styles.picker}
          >
            <Picker.Item label="Check In" value="check_in" />
            <Picker.Item label="Check Out" value="check_out" />
            <Picker.Item label="Periodic Inspection" value="periodic" />
            <Picker.Item label="Mid-Term Inspection" value="mid_term" />
          </Picker>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Inspection Date *</Text>
        <TextInput
          style={styles.input}
          value={inspectionDate}
          onChangeText={setInspectionDate}
          placeholder="YYYY-MM-DD"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add any notes..."
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.button, createMutation.isPending && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? (
          <ActivityIndicator color="#1a2332" />
        ) : (
          <Text style={styles.buttonText}>Create Inventory</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a2332',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  readOnly: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#666',
  },
  button: {
    backgroundColor: '#d4af37',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#1a2332',
    fontSize: 16,
    fontWeight: '600',
  },
});
