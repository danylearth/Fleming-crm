import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RootStackParamList, LocalPhoto } from '../types';
import { inventoryService } from '../services/inventory';

type RouteType = RouteProp<RootStackParamList, 'Camera'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width } = Dimensions.get('window');

export default function CameraScreen() {
  const route = useRoute<RouteType>();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const { inventoryId, roomId } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const cameraRef = useRef<CameraView>(null);

  const uploadMutation = useMutation({
    mutationFn: (photo: LocalPhoto) =>
      inventoryService.uploadPhoto(inventoryId, roomId, {
        uri: photo.uri,
        fileName: photo.fileName,
        type: photo.type,
      }),
    onSuccess: () => {
      setUploadingCount((prev) => prev - 1);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to upload photo');
      setUploadingCount((prev) => prev - 1);
    },
  });

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            Camera permission is required to take photos
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          exif: true,
        });

        if (photo) {
          const localPhoto: LocalPhoto = {
            uri: photo.uri,
            width: photo.width,
            height: photo.height,
            fileName: `photo_${Date.now()}.jpg`,
            type: 'image/jpeg',
            timestamp: new Date().toISOString(),
          };

          setPhotos((prev) => [...prev, localPhoto]);
        }
      } catch (error) {
        console.error('Failed to take picture:', error);
        Alert.alert('Error', 'Failed to capture photo');
      }
    }
  };

  const deletePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const handleUploadAll = async () => {
    if (photos.length === 0) {
      Alert.alert('No Photos', 'Please take at least one photo');
      return;
    }

    Alert.alert(
      'Upload Photos',
      `Upload ${photos.length} photo(s) to this room?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            setUploadingCount(photos.length);

            // Upload photos sequentially
            for (const photo of photos) {
              await uploadMutation.mutateAsync(photo);
            }

            queryClient.invalidateQueries({
              queryKey: ['inventory-rooms', inventoryId],
            });
            queryClient.invalidateQueries({
              queryKey: ['inventory', inventoryId],
            });

            Alert.alert('Success', 'All photos uploaded successfully', [
              {
                text: 'OK',
                onPress: () => {
                  navigation.navigate('InventoryDetail', { inventoryId });
                },
              },
            ]);
          },
        },
      ]
    );
  };

  const handleFinish = () => {
    if (photos.length > 0) {
      Alert.alert(
        'Unsaved Photos',
        'You have photos that haven\'t been uploaded. Do you want to upload them?',
        [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
          { text: 'Upload', onPress: handleUploadAll },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      {photos.length === 0 ? (
        <>
          <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
            <View style={styles.cameraOverlay}>
              <View style={styles.topBar}>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={handleFinish}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.flipButton}
                  onPress={toggleCameraFacing}
                >
                  <Text style={styles.flipButtonText}>🔄</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bottomBar}>
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={takePicture}
                >
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>
              </View>
            </View>
          </CameraView>
        </>
      ) : (
        <View style={styles.reviewContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {photos.length} Photo{photos.length > 1 ? 's' : ''} Captured
            </Text>
            <TouchableOpacity onPress={handleFinish}>
              <Text style={styles.headerClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.photoList}>
            {photos.map((photo, index) => (
              <View key={index} style={styles.photoItem}>
                <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deletePhoto(index)}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={styles.actionBar}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setPhotos([])}
            >
              <Text style={styles.actionButtonText}>Take More</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.uploadButton]}
              onPress={handleUploadAll}
              disabled={uploadingCount > 0}
            >
              {uploadingCount > 0 ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.uploadButtonText}>Upload All</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  closeButton: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  flipButton: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButtonText: {
    fontSize: 24,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  reviewContainer: {
    flex: 1,
    backgroundColor: '#1a2332',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerClose: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  photoList: {
    flex: 1,
  },
  photoItem: {
    marginBottom: 16,
  },
  photoPreview: {
    width: width,
    height: width * 0.75,
    backgroundColor: '#000',
  },
  deleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#ff4444',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#1a2332',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#d4af37',
  },
  uploadButtonText: {
    color: '#1a2332',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#d4af37',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionButtonText: {
    color: '#1a2332',
    fontSize: 16,
    fontWeight: '600',
  },
});
