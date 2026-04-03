import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList, MainTabParamList } from '../types';

// Screens
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import PropertyListScreen from '../screens/PropertyListScreen';
import PropertyDetailScreen from '../screens/PropertyDetailScreen';
import TenantsScreen from '../screens/TenantsScreen';
import MaintenanceScreen from '../screens/MaintenanceScreen';
import TasksScreen from '../screens/TasksScreen';
import InventoryListScreen from '../screens/InventoryListScreen';
import InventoryDetailScreen from '../screens/InventoryDetailScreen';
import CreateInventoryScreen from '../screens/CreateInventoryScreen';
import RoomCaptureScreen from '../screens/RoomCaptureScreen';
import CameraScreen from '../screens/CameraScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#1a2332',
          borderTopColor: '#d4af37',
        },
        tabBarActiveTintColor: '#d4af37',
        tabBarInactiveTintColor: '#999',
        headerStyle: {
          backgroundColor: '#1a2332',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Properties"
        component={PropertyListScreen}
        options={{ title: 'Properties' }}
      />
      <Tab.Screen
        name="Tenants"
        component={TenantsScreen}
        options={{ title: 'Tenants' }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{ title: 'Tasks' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1a2332',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="PropertyDetail"
              component={PropertyDetailScreen}
              options={{ title: 'Property Details' }}
            />
            <Stack.Screen
              name="InventoryDetail"
              component={InventoryDetailScreen}
              options={{ title: 'Inventory Details' }}
            />
            <Stack.Screen
              name="CreateInventory"
              component={CreateInventoryScreen}
              options={{ title: 'New Inventory' }}
            />
            <Stack.Screen
              name="RoomCapture"
              component={RoomCaptureScreen}
              options={{ title: 'Room Photos' }}
            />
            <Stack.Screen
              name="Camera"
              component={CameraScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a2332',
  },
});
