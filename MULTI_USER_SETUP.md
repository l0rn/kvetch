# Kvetch Multi-User Setup Guide

This guide explains how to enable and configure Kvetch's multi-user features while preserving its ability to work as a single-user offline-only application.

## Architecture Overview

Kvetch uses a **centralized configuration system** that toggles between two modes:

1. **Single-User Mode** (default): Works offline-only with local storage
2. **Multi-User Mode**: Adds authentication, user management, and remote sync

## Quick Start

### 1. Single-User Mode (Default)

No configuration needed - just run the app:

```bash
npm run dev
```

The app works offline-only with all data stored locally in IndexedDB.

### 2. Multi-User Mode (Development)

Create a `.env` file:

```bash
# Enable multi-user mode
VITE_MULTI_USER_MODE=true

# Point to your CouchDB + Sync Gateway (from kvetch-gateway repo)
VITE_SYNC_GATEWAY_URL=http://localhost:4984
VITE_DATABASE_NAME=kvetch-shared
VITE_ADMIN_API_URL=http://localhost:4985

# Optional: Instance configuration
VITE_INSTANCE_ID=demo
VITE_INSTANCE_NAME=Demo Restaurant

# Feature flags
VITE_ENABLE_USER_MANAGEMENT=true
VITE_ENABLE_STAFF_ACCOUNTS=true
```

Then start your backend and the app:

```bash
# In kvetch-gateway directory
make up && make init

# In kvetch directory  
npm run dev
```

### 3. Multi-User Mode (Production)

Deploy a `config.json` file to your web server's public directory:

```json
{
  "syncGatewayUrl": "https://your-sync-gateway.example.com",
  "databaseName": "kvetch-shared",
  "adminApiUrl": "https://your-sync-gateway-admin.example.com",
  "features": {
    "userManagement": true,
    "staffAccounts": true,
    "instanceSelection": false
  }
}
```

## Features

### Authentication
- **Login/Logout** with username/password
- **Session management** with automatic renewal
- **Role-based access control** (Admin, Manager, Staff)

### User Management
- **Create/Delete users** (Admin/Instance-Admin only)
- **Role assignment** with channel-based permissions
- **Instance-based access control** for multi-tenant scenarios

### Staff Account Linking
- **Optional user accounts** for staff members
- **Existing offline workflow preserved** - staff without accounts work normally
- **Self-service constraints** - staff can log in to manage their own blocked times

### Remote Sync
- **Bi-directional synchronization** with CouchDB via Sync Gateway
- **Conflict resolution** with last-write-wins + manual resolution
- **Offline-first** - works when disconnected, syncs when reconnected

## Configuration Reference

### Environment Variables (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_MULTI_USER_MODE` | `false` | Enable/disable multi-user features |
| `VITE_SYNC_GATEWAY_URL` | `http://localhost:4984` | Sync Gateway public API |
| `VITE_DATABASE_NAME` | `kvetch-shared` | Database name |
| `VITE_ADMIN_API_URL` | `http://localhost:4985` | Sync Gateway admin API |
| `VITE_INSTANCE_ID` | - | Instance ID for multi-tenant setups |
| `VITE_INSTANCE_NAME` | - | Display name for instance |
| `VITE_ENABLE_USER_MANAGEMENT` | `true` | Show user management UI |
| `VITE_ENABLE_STAFF_ACCOUNTS` | `true` | Allow linking staff to user accounts |
| `VITE_ENABLE_INSTANCE_SELECTION` | `false` | Enable instance switching |

### Production Config (/config.json)

```json
{
  "syncGatewayUrl": "https://sync.example.com",
  "databaseName": "kvetch-shared", 
  "adminApiUrl": "https://admin.example.com",
  "features": {
    "userManagement": true,
    "staffAccounts": true,
    "instanceSelection": false
  },
  "instanceId": "restaurant-1",
  "instanceName": "Main Restaurant"
}
```

## User Roles & Permissions

| Role | Permissions |
|------|-------------|
| **Admin** | Full system access, manage all users |
| **Instance Admin** | Manage users within assigned instances |
| **Manager** | Create/edit shifts, assign staff, view all data |
| **Staff** | View schedules, edit own constraints/blocked times |

## Data Flow

### Single-User Mode
```
React App ↔ PouchDB (IndexedDB) 
```

### Multi-User Mode
```
React App ↔ PouchDB (Local) ↔ Sync Gateway ↔ CouchDB
```

## Development Workflow

### Testing Single-User Mode
1. Ensure `VITE_MULTI_USER_MODE=false` (or no .env file)
2. Run `npm run dev`
3. App works completely offline

### Testing Multi-User Mode
1. Set up backend: `cd ../kvetch-gateway && make up && make init`
2. Create `.env` with `VITE_MULTI_USER_MODE=true`
3. Run `npm run dev`
4. Login with demo users:
   - `admin` / `admin123` (full access)
   - `demo-manager` / `manager123` (instance manager)
   - `demo-staff` / `staff123` (staff member)

### Adding New Features

When adding features that depend on multi-user mode:

1. **Check the feature flag** in components:
```tsx
const { isFeatureEnabled } = useAppConfig();

if (isFeatureEnabled('yourFeature')) {
  // Multi-user specific code
}
```

2. **Use the auth context** for user information:
```tsx
const { user, isAuthenticated } = useAuth();

if (user?.role === 'admin') {
  // Admin-only functionality
}
```

3. **Update the configuration types** in `src/config/AppConfig.ts`
4. **Add translations** in both `en.json` and `de.json`

## Troubleshooting

### App shows login screen when it shouldn't
- Check `.env` file has `VITE_MULTI_USER_MODE=false` or remove it entirely
- Clear browser local storage
- Restart development server

### Can't connect to backend
- Verify Sync Gateway is running: `curl http://localhost:4984`
- Check CORS settings in sync gateway config
- Verify URLs in `.env` match your backend

### Sync not working
- Check browser network tab for 401/403 errors
- Verify user has correct channels for instance
- Check Sync Gateway logs: `make logs` in kvetch-gateway

### Users can't login
- Verify user exists: `curl http://localhost:4985/kvetch-shared/_user/`
- Check password and channels in sync gateway config
- Look for errors in browser console

## Best Practices

1. **Always test both modes** when making changes
2. **Use feature flags** instead of environment checks in components
3. **Graceful degradation** - features should work offline when possible
4. **Security first** - never expose admin API to public internet
5. **Document configuration** - update this guide when adding config options

## Architecture Benefits

- **Non-intrusive**: Single codebase supports both modes seamlessly
- **Offline-first**: Works with or without network connectivity
- **Scalable**: Channel-based permissions support complex multi-tenant scenarios
- **Maintainable**: Centralized configuration reduces code complexity
- **Future-proof**: Easy to add new multi-user features without breaking single-user mode