import { BrowserRouter } from 'react-router-dom';
import { useAppConfig } from './config/AppConfig';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginForm } from './components/auth/LoginForm';
import { UserProfile } from './components/auth/UserProfile';
import { Database } from './storage/database';
import { useState, useEffect } from 'react';
import App from './App';
import './App.css';

// Loading component
function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner"></div>
      <p>Loading Kvetch...</p>
    </div>
  );
}

// Error component for configuration issues
function ConfigError({ error }: { error: Error }) {
  return (
    <div className="config-error">
      <h1>Configuration Error</h1>
      <p>Failed to load application configuration:</p>
      <pre>{error.message}</pre>
      <p>Please check your configuration and try again.</p>
    </div>
  );
}

// Authentication gate component
function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const { config } = useAppConfig();

  // If not in multi-user mode, render app directly
  if (!config?.multiUserMode) {
    return <App />;
  }

  // Show loading during auth check
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Show login form if not authenticated in multi-user mode
  if (!isAuthenticated) {
    return (
      <div className="login-screen">
        <div className="login-container">
          <div className="app-branding">
            <h1>Kvetch</h1>
            <p>Shift Planning</p>
          </div>
          <LoginForm />
        </div>
      </div>
    );
  }

  // Render authenticated app
  return <App />;
}

// Enhanced header that shows user info in multi-user mode
function AppHeader() {
  const { config } = useAppConfig();
  const { isAuthenticated } = useAuth();

  if (!config?.multiUserMode || !isAuthenticated) {
    return null;
  }

  return (
    <div className="auth-header">
      <UserProfile />
    </div>
  );
}

// Main app wrapper that handles all the toggling logic
function AppContent() {
  const { config, loading, error } = useAppConfig();
  const [dbInitialized, setDbInitialized] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);

  // Initialize database when config is loaded
  useEffect(() => {
    if (config && !dbInitialized) {
      Database.init(config)
        .then(() => {
          setDbInitialized(true);
          console.log('✅ Database initialized successfully');
        })
        .catch((err) => {
          console.error('❌ Database initialization failed:', err);
          setDbError(err);
        });
    }
  }, [config, dbInitialized]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <ConfigError error={error} />;
  }

  if (!config) {
    return <ConfigError error={new Error('Configuration not loaded')} />;
  }

  if (dbError) {
    return <ConfigError error={new Error(`Database initialization failed: ${dbError.message}`)} />;
  }

  if (!dbInitialized) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AppHeader />
      <AuthenticatedApp />
    </>
  );
}

// Root wrapper that provides all contexts
export function AppWrapper() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <div className="app-wrapper">
          <AppContent />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}