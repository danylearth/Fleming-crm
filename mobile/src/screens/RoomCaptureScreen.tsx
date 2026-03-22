import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Picker } from '@react-native-picker/picker';
import { RootStackParamList, LocalPhoto } from '../types';
import { inventoryService } from '../services/inventory';

type RouteType = RouteProp<RootStackParamList, 'RoomCapture'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ROOM_TYPES = [
  { label: 'Bedroom', value: 'bedroom' },
  { label: 'Living Room', value: 'living_room' },
  { label: 'Kitchen', value: 'kitchen' },
  { label: 'Bathroom', value: 'bathroom' },
  { label: 'Hallway', value: 'hallway' },
  { label: 'Garden', value: 'garden' },
  { label: 'Other', value: 'other' },
];

export default function RoomCaptureScreen() {
  const route = useRoute<RouteType>();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const { inventoryId, roomId } = route.params;

  const [roomName, setRoomName] = useState('');
  const [roomType, setRoomType] = useState('bedroom');
  const [condition, setCondition] = useState<string>('good');
  const [notes, setNotes] = useState('');
  const [localPhotos, setLocalPhotos] = useState<LocalPhoto[]>([]);

  const { data: room } = useQuery({
    queryKey: ['inventory-room', roomId],
    queryFn: () =>
      roomId
        ? inventoryService
            .getRooms(inventoryId)
            .then((rooms) => rooms.find((r) => r.id === roomId))
        : null,
    enabled: !!roomId,
  });

  const createRoomMutation = useMutation({
    mutationFn: (data: any) => inventoryService.createRoom(inventoryId, data),
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-rooms', inventoryId] });

      if (localPhotos.length > 0) {
        // Upload photos
        navigation.navigate('Camera', {
          inventoryId,
          roomId: data.id,
        });
      } else {
        Alert.alert('Success', 'Room created successfully', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      }
    },
  });

  const handleSave = () => {
    if (!roomName || !roomType) {
      Alert.alert('Error', 'Please enter room name and select type');
      return;
    }

    if (roomId) {
      // Editing existing room - just go to camera
      navigation.navigate('Camera', { inventoryId, roomId });
    } else {
      // Creating new room
      createRoomMutation.mutate({
        room_name: roomName,
        room_type: roomType,
        condition,
        notes,
      });
    }
  };

  const handleOpenCamera = () => {
    if (roomId) {
      navigation.navigate('Camera', { inventoryId, roomId });
    } else {
      Alert.alert(
        'Save Room First',
        'Please save the room details before taking photos'
      );
    }
  };

  // If editing existing room, pre-fill data
  React.useEffect(() => {
    if (room) {
      setRoomName(room.room_name);
      setRoomType(room.room_type);
      setCondition(room.condition || 'good');
      setNotes(room.notes || '');
    }
  }, [room]);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Room Name *</Text>
        <TextInput
          style={styles.input}
          value={roomName}
          onChangeText={setRoomName}
          placeholder="e.g., Master Bedroom, Kitchen"
          editable={!roomId}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Room Type *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={roomType}
            onValueChange={(value) => setRoomType(value)}
            style={styles.picker}
            enabled={!roomId}
          >
            {ROOM_TYPES.map((type) => (
              <Picker.Item
                key={type.value}
                label={type.label}
                value={type.value}
              />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Condition</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={condition}
            onValueChange={(value) => setCondition(value)}
            style={styles.picker}
            enabled={!roomId}
          >
            <Picker.Item label="Excellent" value="excellent" />
            <Picker.Item label="Good" value="good" />
            <Picker.Item label="Fair" value="fair" />
            <Picker.Item label="Poor" value="poor" />
          </Picker>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add any observations..."
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!roomId}
        />
      </View>

      {roomId ? (
        <TouchableOpacity
          style={styles.cameraButton}
          onPress={handleOpenCamera}
        >
          <Text style={styles.cameraButtonText}>📸 Take Photos</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[
            styles.button,
            createRoomMutation.isPending && styles.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={createRoomMutation.isPending}
        >
          {createRoomMutation.isPending ? (
            <ActivityIndicator color="#1a2332" />
          ) : (
            <Text style={styles.buttonText}>
              Save Room & Take Photos
            </Text>
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
  cameraButton: {
    backgroundColor: '#4caf50',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  cameraButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
