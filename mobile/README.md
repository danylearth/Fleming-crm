# Fleming CRM Mobile App

React Native mobile application for Fleming CRM property inventory management with native camera integration.

## Features

- ✅ JWT Authentication (same credentials as web app)
- ✅ Property listing and details
- ✅ Inventory creation and management
- ✅ Room-by-room photo capture with native camera
- ✅ Photo upload to backend
- ✅ Offline-capable photo storage (coming soon)
- ✅ Works on iOS and Android

## Prerequisites

- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app on your phone (or use simulators)
  - iOS: Download from App Store
  - Android: Download from Google Play
- Backend server running (see `/backend/README.md`)

## Installation

```bash
cd mobile
npm install
```

## Configuration

### 1. Set Backend URL

Edit [`src/services/api.ts`](src/services/api.ts) and update the API_BASE_URL:

```typescript
const API_BASE_URL = __DEV__
  ? 'http://YOUR_COMPUTER_IP:3001'  // Change to your local network IP
  : 'https://your-production-api.com'; // Your Railway/Render URL
```

**Important**: For physical device testing, use your computer's local IP address (not `localhost`):
- macOS/Linux: Run `ifconfig | grep "inet "` to find your IP
- Windows: Run `ipconfig` to find your IPv4 Address
- Example: `http://192.168.1.100:3001`

### 2. Ensure Backend is Running

```bash
cd ../backend
npm run dev:pg  # PostgreSQL backend
```

## Running the App

### Development with Expo Go

```bash
npm start
```

This will open the Expo DevTools in your browser. You can then:

1. **iOS (Physical Device or Simulator)**:
   - Press `i` to open in iOS Simulator
   - Or scan the QR code with Camera app on iPhone

2. **Android (Physical Device or Emulator)**:
   - Press `a` to open in Android Emulator
   - Or scan the QR code with Expo Go app on Android

### Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

## Project Structure

```
mobile/
├── src/
│   ├── navigation/         # React Navigation setup
│   ├── screens/            # App screens
│   │   ├── LoginScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── PropertyListScreen.tsx
│   │   ├── PropertyDetailScreen.tsx
│   │   ├── InventoryListScreen.tsx
│   │   ├── InventoryDetailScreen.tsx
│   │   ├── CreateInventoryScreen.tsx
│   │   ├── RoomCaptureScreen.tsx
│   │   └── CameraScreen.tsx
│   ├── components/         # Reusable components
│   ├── services/           # API services
│   │   ├── api.ts          # Axios instance & auth interceptor
│   │   ├── auth.ts         # Authentication service
│   │   └── inventory.ts    # Inventory API calls
│   ├── context/            # React Context providers
│   │   └── AuthContext.tsx # Auth state management
│   ├── hooks/              # Custom React hooks
│   ├── utils/              # Utility functions
│   └── types/              # TypeScript types
├── App.tsx                 # Root component
├── app.json                # Expo configuration
└── package.json            # Dependencies
```

## Usage Guide

### 1. Login

- Use your Fleming CRM web dashboard credentials
- Email: `admin@fleming.com` / Password: `admin123` (demo)

### 2. Create an Inventory

1. Tap "+ New Inventory" on Dashboard
2. Select property, inventory type, and inspection date
3. Tap "Create Inventory"

### 3. Add Rooms & Capture Photos

1. In the inventory detail screen, tap "+ Add Room"
2. Enter room name (e.g., "Master Bedroom") and select type
3. Tap "Save Room & Take Photos"
4. Use the camera to capture multiple photos
5. Review photos and tap "Upload All"
6. Photos are uploaded to the backend and visible in the web dashboard

### 4. View Inventories

- Dashboard shows in-progress inventories
- Inventories tab shows all inventories
- Tap any inventory to view details and photos

## Troubleshooting

### Cannot connect to backend

- Ensure backend is running on `http://localhost:3001`
- For physical devices, use your computer's IP address (not localhost)
- Check firewall isn't blocking port 3001
- Try: `curl http://YOUR_IP:3001/api/health`

### Camera not working

- Grant camera permissions when prompted
- iOS: Settings → Fleming CRM → Allow Camera
- Android: Settings → Apps → Fleming CRM → Permissions → Camera

### Photos not uploading

- Check network connection
- Verify backend is running and accessible
- Check backend logs for errors
- File size limit is 10MB per photo

### Build errors

```bash
# Clear cache and reinstall
rm -rf node_modules
npm install

# Or use Expo's cache clear
expo start --clear
```

## Development Workflow

1. **Start backend**: `cd backend && npm run dev:pg`
2. **Start mobile app**: `cd mobile && npm start`
3. **Open in Expo Go**: Scan QR code
4. **Make changes**: Auto-reloads on save
5. **Debug**: Shake device → Toggle Debug Remote JS

## API Endpoints Used

- `POST /api/auth/login` - User authentication
- `GET /api/auth/me` - Get current user
- `GET /api/properties` - List properties
- `GET /api/inventories` - List inventories
- `POST /api/inventories` - Create inventory
- `POST /api/inventories/:id/rooms` - Add room
- `POST /api/inventory-photos/:inventoryId/:roomId` - Upload photo

## Environment Variables

No `.env` file needed for development. All configuration is in `src/services/api.ts`.

For production builds, set these in Expo secrets:
- `EXPO_PUBLIC_API_URL` - Production API URL

## Next Steps

- [ ] Implement offline photo queue with background sync
- [ ] Add photo annotations and captions
- [ ] Implement pull-to-refresh on all lists
- [ ] Add search and filters
- [ ] Integrate AI image enhancement (Phase 3)
- [ ] Add push notifications for assigned tasks
- [ ] Implement biometric authentication

## Support

For issues or questions:
1. Check the [Expo documentation](https://docs.expo.dev/)
2. Review the [React Navigation docs](https://reactnavigation.org/)
3. Refer to the main project CLAUDE.md

## License

Proprietary - Fleming CRM
