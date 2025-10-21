import { BrowserRouter, useLocation, Routes, Route } from 'react-router-dom';
import { useAppConfig } from './config/AppConfig';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginForm } from './components/auth/LoginForm';
import { ForgotPasswordForm } from './components/auth/ForgotPasswordForm';
import { ResetPasswordForm } from './components/auth/ResetPasswordForm';
import { UserProfile } from './components/auth/UserProfile';
import { InstanceNotFound } from './components/InstanceNotFound';
import { Database } from './storage/database';
import { AppConfigManager } from './config/AppConfig';
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

// Authentication and public routes component
function AuthenticationRouter({ instanceName }: { instanceName?: string }) {
  const { isAuthenticated, isLoading, checkInstanceAccess } = useAuth();
  const { config } = useAppConfig();
  const location = useLocation();
  const [authView, setAuthView] = useState<'login' | 'forgot-password'>('login');
  const [instanceAccess, setInstanceAccess] = useState<{
    checked: boolean;
    hasAccess: boolean;
    error?: string;
  }>({ checked: false, hasAccess: true });

  // Check instance access after authentication - ALWAYS declare hooks at top level
  useEffect(() => {
    if (isAuthenticated && config?.instanceId && !instanceAccess.checked) {
      checkInstanceAccess(config.instanceId).then((result) => {
        setInstanceAccess({
          checked: true,
          hasAccess: result.hasAccess,
          error: result.error
        });
      });
    }
  }, [isAuthenticated, config?.instanceId, instanceAccess.checked, checkInstanceAccess]);

  // Handle forgot password event from LoginForm
  useEffect(() => {
    const handleShowForgotPassword = () => {
      setAuthView('forgot-password');
    };

    window.addEventListener('showForgotPassword', handleShowForgotPassword);
    return () => window.removeEventListener('showForgotPassword', handleShowForgotPassword);
  }, []);

  // If not in multi-user mode, render app directly
  if (!config?.multiUserMode) {
    return <App />;
  }

  // Show loading during auth check
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Check for password reset route - accessible without authentication
  if (location.pathname === '/reset-password') {
    const urlParams = new URLSearchParams(location.search);
    const token = urlParams.get('token');
    
    return (
      <div className="login-screen">
        <div className="login-container">
          <div className="app-branding">
            <h1>Kvetch</h1>
            <p>Shift Planning</p>
          </div>
          <ResetPasswordForm 
            token={token || ''}
            onSuccess={() => {
              // Redirect to login after successful reset
              window.location.href = '/';
            }}
            onError={(error) => {
              console.error('Reset password error:', error);
            }}
          />
        </div>
      </div>
    );
  }

  // Show login/forgot password form if not authenticated in multi-user mode
  if (!isAuthenticated) {
    return (
      <div className="login-screen">
        <div className="login-container">
          <div className="app-branding">
            <h1>Kvetch</h1>
            <p>Shift Planning</p>
          </div>
          {authView === 'login' ? (
            <LoginForm instanceName={instanceName} />
          ) : (
            <ForgotPasswordForm 
              onBack={() => setAuthView('login')}
              onSuccess={() => {
                // Show success message and go back to login
                setTimeout(() => setAuthView('login'), 3000);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // Show loading while checking instance access
  if (isAuthenticated && config?.instanceId && !instanceAccess.checked) {
    return <LoadingScreen />;
  }

  // Show access denied message if user doesn't have access to this instance
  if (isAuthenticated && config?.instanceId && !instanceAccess.hasAccess) {
    return (
      <div className="access-denied-screen">
        <div className="access-denied-container">
          <div className="app-branding">
            <h1>Access Denied</h1>
            <p>You don't have access to this instance: <strong>{instanceName || config.instanceId}</strong></p>
            {instanceAccess.error && <p className="error-message">{instanceAccess.error}</p>}
            <p>Please contact your administrator to get access to this instance.</p>
          </div>
        </div>
      </div>
    );
  }

  // Render authenticated app
  return <App />;
}

// Enhanced header that shows user info in multi-user mode
function AppHeader({ instanceName }: { instanceName?: string }) {
  const { config } = useAppConfig();
  const { isAuthenticated } = useAuth();

  if (!config?.multiUserMode || !isAuthenticated) {
    return null;
  }

  return (
    <div className="auth-header">
      {instanceName && (
        <div className="header-instance-info">
          <span className="instance-indicator">🏢</span>
          <span className="instance-text">{instanceName}</span>
        </div>
      )}
      <UserProfile />
    </div>
  );
}

// Main app wrapper that handles all the toggling logic
function AppContent() {
  const { config, loading, error } = useAppConfig();
  const [dbInitialized, setDbInitialized] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);
  const [instanceValidation, setInstanceValidation] = useState<{
    checked: boolean;
    valid: boolean;
    instanceName?: string;
    error?: string;
  }>({ checked: false, valid: true });

  // Validate instance before proceeding
  useEffect(() => {
    if (config && !instanceValidation.checked) {
      AppConfigManager.validateInstance()
        .then((validation) => {
          setInstanceValidation({
            checked: true,
            valid: validation.valid,
            instanceName: validation.instanceName,
            error: validation.error
          });
        })
        .catch((err) => {
          console.error('❌ Instance validation failed:', err);
          setInstanceValidation({
            checked: true,
            valid: false,
            error: err.message
          });
        });
    }
  }, [config, instanceValidation.checked]);

  // Initialize database when config is loaded and instance is validated
  useEffect(() => {
    if (config && !dbInitialized && instanceValidation.checked && instanceValidation.valid) {
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
  }, [config, dbInitialized, instanceValidation]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <ConfigError error={error} />;
  }

  if (!config) {
    return <ConfigError error={new Error('Configuration not loaded')} />;
  }

  // Show loading while validating instance
  if (!instanceValidation.checked) {
    return <LoadingScreen />;
  }

  // Show 404 if instance validation failed
  if (!instanceValidation.valid) {
    return (
      <InstanceNotFound
        instanceId={config.instanceId}
        error={instanceValidation.error}
      />
    );
  }

  if (dbError) {
    return <ConfigError error={new Error(`Database initialization failed: ${dbError.message}`)} />;
  }

  if (!dbInitialized) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AppHeader instanceName={instanceValidation.instanceName} />
      <AuthenticationRouter instanceName={instanceValidation.instanceName} />
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