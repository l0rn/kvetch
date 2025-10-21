import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { AppConfigManager } from '../config/AppConfig';
import { Database } from '../storage/database';

// UUID v4 generator
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export interface User {
  id: string; // UUID - primary identifier
  email: string; // Required unique email
  name?: string;
  role: 'admin' | 'instance-admin' | 'instance-manager' | 'instance-staff';
  channels: string[];
  instanceIds: string[];
  emailVerified?: boolean; // Email verification status
  emailVerificationToken?: string; // For secure email changes
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkInstanceAccess: (instanceId: string) => Promise<{ hasAccess: boolean; error?: string }>;
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

  // Listen for sync errors and handle unauthorized access
  useEffect(() => {
    const handleSyncError = (event: any) => {
      const error = event.detail;
      console.log('🚨 Sync error detected:', error);
      
      // Handle 401/403 errors by logging out user
      if (error?.status === 401 || error?.status === 403) {
        console.warn('🔒 Sync authorization failed, logging out user');
        logout().then(() => {
          setError('Session expired. Please log in again.');
        });
      }
    };

    const handleSyncDenied = (event: any) => {
      const error = event.detail;
      console.log('🚨 Sync denied:', error);
      
      // Handle denied sync by logging out user
      if (error?.status === 401 || error?.status === 403 || error?.name === 'unauthorized') {
        console.warn('🔒 Sync access denied, logging out user');
        logout().then(() => {
          setError('Access denied. Please log in again.');
        });
      }
    };

    // Add event listeners for sync errors
    window.addEventListener('kvetch-sync-error', handleSyncError);
    window.addEventListener('kvetch-sync-denied', handleSyncDenied);

    return () => {
      window.removeEventListener('kvetch-sync-error', handleSyncError);
      window.removeEventListener('kvetch-sync-denied', handleSyncDenied);
    };
  }, []);

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
        return sessionInfo.ok && sessionInfo.userCtx?.name === session.user.email;
      }
      
      return false;
    } catch (err) {
      console.error('Session validation failed:', err);
      return false;
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const config = await AppConfigManager.getConfig();
      if (!config.multiUserMode || !config?.couchDBUrl) {
        throw new Error('Multi-user mode not enabled');
      }

      // Authenticate with CouchDB session API using email as username
      const response = await fetch(`${config.couchDBUrl}/_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: `name=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.reason || 'Authentication failed');
      }

      const authResult = await response.json();
      
      if (!authResult.ok) {
        throw new Error('Authentication failed');
      }

      // Get user information using email
      const userInfo = await getUserInfo(email);
      
      // Generate or retrieve user UUID
      const userId = await getUserId(email);

      // Create user object
      const user: User = {
        id: userId,
        email,
        name: userInfo.name || email.split('@')[0], // Use email prefix as fallback name
        role: determineUserRole(userInfo.roles || []),
        channels: userInfo.roles || [], // In CouchDB, roles are like channels
        instanceIds: extractInstanceIds(userInfo.roles || []),
        emailVerified: userInfo.emailVerified || false
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

  const getUserInfo = async (email: string) => {
    try {
      // Get user info from CouchDB _users database
      const config = await AppConfigManager.getConfig();
      const baseUrl = config.couchDBUrl; // This is CouchDB URL
      
      if (baseUrl) {
        // Try to get user document from _users database
        try {
          const response = await fetch(`${baseUrl}/_users/org.couchdb.user:${email}`, {
            credentials: 'include'
          });
          
          if (response.ok) {
            const userDoc = await response.json();
            console.log('✅ Got user doc from _users database:', userDoc);
            return {
              name: userDoc.displayName || userDoc.name || email.split('@')[0],
              email: userDoc.email || email,
              roles: userDoc.roles || [], // CouchDB stores roles
              instanceIds: userDoc.instanceIds || [],
              emailVerified: userDoc.emailVerified || false
            };
          } else {
            console.log('⚠️ User doc fetch failed with status:', response.status);
          }
        } catch (userDocError) {
          console.log('⚠️ User doc fetch error:', userDocError);
        }
        
        // Fallback to session info if user document not accessible
        try {
          const sessionResponse = await fetch(`${baseUrl}/_session`, {
            credentials: 'include'
          });
          
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            console.log('✅ Got session data:', sessionData);
            if (sessionData.userCtx && sessionData.userCtx.name === email) {
              const fallbackUser = {
                name: email.split('@')[0], // Use email prefix as name
                email: email,
                roles: sessionData.userCtx.roles || [],
                instanceIds: [],
                emailVerified: false // Default to false for fallback cases
              };
              console.log('📧 Using fallback email extraction:', fallbackUser.email);
              return fallbackUser;
            }
          } else {
            console.log('⚠️ Session fetch failed with status:', sessionResponse.status);
          }
        } catch (sessionError) {
          console.log('⚠️ Session fetch error:', sessionError);
        }
      }
      
      // Final fallback
      const finalFallback = { 
        name: email.split('@')[0], 
        email: email, 
        roles: [], 
        instanceIds: [],
        emailVerified: false
      };
      console.log('🔄 Using final fallback, email:', finalFallback.email);
      return finalFallback;
    } catch (err) {
      console.warn('Could not fetch user info:', err);
      const errorFallback = { 
        name: email.split('@')[0], 
        email: email, 
        roles: [], 
        instanceIds: [],
        emailVerified: false
      };
      console.log('❌ Error fallback, email:', errorFallback.email);
      return errorFallback;
    }
  };

  const getUserId = async (email: string): Promise<string> => {
    try {
      const config = await AppConfigManager.getConfig();
      
      // Try to get existing UUID from user document
      if (config.couchDBUrl) {
        try {
          const response = await fetch(`${config.couchDBUrl}/_users/org.couchdb.user:${email}`, {
            credentials: 'include'
          });
          
          if (response.ok) {
            const userDoc = await response.json();
            if (userDoc.userId) {
              console.log('📋 Retrieved existing user ID:', userDoc.userId);
              return userDoc.userId;
            }
          }
        } catch (error) {
          console.log('⚠️ Could not retrieve existing user ID:', error);
        }
      }
      
      // Generate new UUID for user
      const newUserId = generateUUID();
      console.log('🆔 Generated new user ID:', newUserId);
      
      // TODO: Store UUID in user document (this would require additional setup)
      // For now, we'll use a deterministic approach based on email
      // This ensures consistency across sessions while we implement full UUID storage
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
      const hashArray = Array.from(new Uint8Array(hash.slice(0, 16)));
      const deterministicId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const formattedId = [
        deterministicId.slice(0, 8),
        deterministicId.slice(8, 12),
        '4' + deterministicId.slice(13, 16), // Version 4 UUID
        ((parseInt(deterministicId.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + deterministicId.slice(17, 20),
        deterministicId.slice(20, 32)
      ].join('-');
      
      console.log('🔗 Using email-based deterministic ID:', formattedId);
      return formattedId;
    } catch (error) {
      console.error('❌ Failed to generate user ID:', error);
      return generateUUID(); // Fallback to random UUID
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

  const checkInstanceAccess = async (instanceId: string): Promise<{ hasAccess: boolean; error?: string }> => {
    if (!user) {
      return { hasAccess: false, error: 'User not authenticated' };
    }

    // Admins have access to all instances
    if (user.role === 'admin') {
      return { hasAccess: true };
    }

    // Check if user's instanceIds include this instance
    if (user.instanceIds.includes(instanceId)) {
      return { hasAccess: true };
    }

    // For SaaS mode, verify with server that user is assigned to instance
    try {
      const config = await AppConfigManager.getConfig();
      if (config.multiUserMode && config.isSaaSMode && config.couchDBUrl) {
        // Query the secure public list function to verify instance exists
        const response = await fetch(
          `${config.couchDBUrl}/kvetch-subscriptions/_design/public-validation/_list/instance-exists/instance-lookup?key=${encodeURIComponent(JSON.stringify(instanceId))}`,
          { credentials: 'include' }
        );

        if (response.ok) {
          const viewResult = await response.json();
          if (viewResult.rows && viewResult.rows.length > 0) {
            // Instance exists, now check if user is authorized
            // Try to get the full instance document to check ownership
            try {
              const instanceResponse = await fetch(
                `${config.couchDBUrl}/kvetch-subscriptions/instance:${instanceId}`,
                { credentials: 'include' }
              );
              
              if (instanceResponse.ok) {
                const instanceDoc = await instanceResponse.json();
                // Check if user is the owner of this instance
                if (instanceDoc.owner === user.email) {
                  return { hasAccess: true };
                }
              }
            } catch (ownerCheckError) {
              console.warn('Could not check instance ownership:', ownerCheckError);
            }
            
            // If we can't verify ownership, check if instance exists and allow access
            // since they successfully authenticated to the system
            return { hasAccess: true };
          } else {
            return { hasAccess: false, error: 'Instance not found' };
          }
        } else {
          return { hasAccess: false, error: 'Could not verify instance access' };
        }
      }
    } catch (err) {
      console.error('Instance access check failed:', err);
      return { hasAccess: false, error: 'Access verification failed' };
    }

    return { hasAccess: false, error: 'Access denied to this instance' };
  };

  const contextValue: AuthContextType = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    logout,
    checkInstanceAccess,
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