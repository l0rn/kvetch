import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { AppConfigManager } from '../config/AppConfig';
import { Database } from '../storage/database';

export interface User {
  username: string;
  name?: string;
  role: 'admin' | 'instance-admin' | 'instance-manager' | 'instance-staff';
  channels: string[];
  instanceIds: string[];
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const syncStarted = useRef(false);

  // Start remote sync when user becomes authenticated
  useEffect(() => {
    const startSyncForUser = async () => {
      if (user && !syncStarted.current) {
        syncStarted.current = true;
        try {
          console.log('🔄 User authenticated, starting remote sync...');
          await Database.startRemoteSync();
          console.log('✅ Remote sync started for authenticated user');
        } catch (error) {
          console.error('❌ Failed to start remote sync:', error);
          // Don't reset syncStarted flag so we don't retry continuously
        }
      }
    };

    startSyncForUser();
  }, [user]);

  useEffect(() => {
    checkExistingAuth();
  }, []);

  const checkExistingAuth = async () => {
    try {
      const config = await AppConfigManager.getConfig();
      
      // Skip auth check if not in multi-user mode
      if (!config.multiUserMode) {
        setIsLoading(false);
        return;
      }

      // Check for existing session
      const sessionData = localStorage.getItem('kvetch_session');
      if (sessionData) {
        try {
          const session = JSON.parse(sessionData);
          if (session.expires && new Date(session.expires) > new Date()) {
            // Validate session with server
            const isValid = await validateSession(session);
            if (isValid) {
              setUser(session.user);
            } else {
              // Clear invalid session
              localStorage.removeItem('kvetch_session');
            }
          } else {
            // Clear expired session
            localStorage.removeItem('kvetch_session');
          }
        } catch (err) {
          localStorage.removeItem('kvetch_session');
        }
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const validateSession = async (session: any): Promise<boolean> => {
    try {
      const config = await AppConfigManager.getConfig();
      if (!config.remote?.couchDBUrl) return false;

      // Try to access session info to validate with CouchDB
      const response = await fetch(`${config.remote.couchDBUrl}/_session`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const sessionInfo = await response.json();
        return sessionInfo.ok && sessionInfo.userCtx?.name === session.user.username;
      }
      
      return false;
    } catch (err) {
      console.error('Session validation failed:', err);
      return false;
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const config = await AppConfigManager.getConfig();
      if (!config.multiUserMode || !config.remote?.couchDBUrl) {
        throw new Error('Multi-user mode not enabled');
      }

      // Authenticate with CouchDB session API
      const response = await fetch(`${config.remote.couchDBUrl}/_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: `name=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.reason || 'Authentication failed');
      }

      const authResult = await response.json();
      
      if (!authResult.ok) {
        throw new Error('Authentication failed');
      }

      // Get user information
      const userInfo = await getUserInfo(username);
      
      // Create user object
      const user: User = {
        username,
        name: userInfo.name || username,
        role: determineUserRole(userInfo.roles || []),
        channels: userInfo.roles || [], // In CouchDB, roles are like channels
        instanceIds: extractInstanceIds(userInfo.roles || [])
      };

      // Store session
      const sessionData = {
        user,
        sessionId: response.headers.get('Set-Cookie')?.match(/AuthSession=([^;]+)/)?.[1],
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      };

      localStorage.setItem('kvetch_session', JSON.stringify(sessionData));
      setUser(user);
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      console.error('Login error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const config = await AppConfigManager.getConfig();
      if (config.multiUserMode && config.remote?.couchDBUrl) {
        // Call logout endpoint
        await fetch(`${config.remote.couchDBUrl}/_session`, {
          method: 'DELETE',
          credentials: 'include'
        }).catch(() => {
          // Ignore logout errors - session might already be expired
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Stop sync and clear local session regardless of server response
      await Database.stopSync();
      localStorage.removeItem('kvetch_session');
      syncStarted.current = false; // Reset sync flag for potential re-login
      setUser(null);
      setError(null);
    }
  };

  const getUserInfo = async (username: string) => {
    try {
      // Get user info from CouchDB _users database
      const config = await AppConfigManager.getConfig();
      const baseUrl = config.remote?.couchDBUrl; // This is CouchDB URL
      
      if (baseUrl) {
        // Try to get user document from _users database
        const response = await fetch(`${baseUrl}/_users/org.couchdb.user:${username}`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const userDoc = await response.json();
          return {
            name: userDoc.displayName || userDoc.name || username,
            roles: userDoc.roles || [], // CouchDB stores roles
            instanceIds: userDoc.instanceIds || []
          };
        }
      }
      
      // Fallback to session info if user document not accessible
      const sessionResponse = await fetch(`${baseUrl}/_session`, {
        credentials: 'include'
      });
      
      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        if (sessionData.userCtx && sessionData.userCtx.name === username) {
          return {
            name: username,
            roles: sessionData.userCtx.roles || [],
            instanceIds: []
          };
        }
      }
      
      // Final fallback
      return { name: username, roles: [], instanceIds: [] };
    } catch (err) {
      console.warn('Could not fetch user info:', err);
      return { name: username, roles: [], instanceIds: [] };
    }
  };

  const determineUserRole = (roles: string[]): User['role'] => {
    if (roles.includes('_admin') || roles.includes('admin')) {
      return 'admin';
    }
    if (roles.some(r => r.includes('admin'))) {
      return 'instance-admin';
    }
    if (roles.some(r => r.includes('manager'))) {
      return 'instance-manager';
    }
    return 'instance-staff';
  };

  const extractInstanceIds = (roles: string[]): string[] => {
    const instanceIds = new Set<string>();
    roles.forEach(role => {
      const match = role.match(/^instance-([^-]+)-/);
      if (match) {
        instanceIds.add(match[1]);
      }
    });
    return Array.from(instanceIds);
  };

  const contextValue: AuthContextType = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    logout,
    error
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}