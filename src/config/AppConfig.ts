// Centralized configuration system for Kvetch
// This is the single entry point for enabling/disabling multi-user features

export interface RemoteConfig {
  couchDBUrl: string;
  databaseName: string;
  // SaaS mode specific settings
  isSaaSMode?: boolean;
  instanceId?: string;
  features?: {
    userManagement?: boolean;
    staffAccounts?: boolean;
    instanceSelection?: boolean;
  };
}

export interface AppConfig {
  // Core feature flag - when false, app works as single-user offline-only
  multiUserMode: boolean;
  
  // Remote configuration
  remote?: RemoteConfig;
  
  // Instance configuration (for multi-tenant mode)
  instanceId?: string;
  instanceName?: string;
  
  // Development settings
  isDevelopment: boolean;
  
  // App metadata  
  version: string;
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig | null = null;
  private configPromise: Promise<AppConfig> | null = null;

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  async getConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    if (this.configPromise) {
      return this.configPromise;
    }

    this.configPromise = this.loadConfig();
    this.config = await this.configPromise;
    return this.config;
  }

  private async loadConfig(): Promise<AppConfig> {
    // Try to load from environment variables first (development)
    const envConfig = this.loadFromEnvironment();
    
    // If multi-user mode is enabled, try to load remote config
    if (envConfig.multiUserMode && !envConfig.remote?.couchDBUrl) {
      try {
        const remoteConfig = await this.loadFromRemote();
        
        // Validate that we have required config
        if (!remoteConfig.couchDBUrl) {
          throw new Error('couchDBUrl is required');
        }
        
        return {
          ...envConfig,
          remote: {
            couchDBUrl: remoteConfig.couchDBUrl,
            databaseName: remoteConfig.databaseName || 'kvetch-shared',
            features: remoteConfig.features
          }
        };
      } catch (error) {
        console.warn('Failed to load remote config, falling back to environment:', error);
        // If remote config fails, disable multi-user mode
        return {
          ...envConfig,
          multiUserMode: false,
          remote: undefined
        };
      }
    }

    return envConfig;
  }

  private loadFromEnvironment(): AppConfig {
    const isDevelopment = import.meta.env.DEV;
    
    // Base configuration
    const config: AppConfig = {
      multiUserMode: false,
      isDevelopment,
      version: import.meta.env.VITE_APP_VERSION || '1.0.0'
    };

    // Check if multi-user mode is enabled via environment variables
    const multiUserEnabled = import.meta.env.VITE_MULTI_USER_MODE === 'true';

    if (multiUserEnabled) {
      config.multiUserMode = true;
      
      // Determine if this is SaaS mode or self-hosted CouchDB mode
      const isSaaSMode = import.meta.env.VITE_SAAS_MODE === 'true';
      const couchDBUrl = import.meta.env.VITE_COUCHDB_URL || 'http://localhost:5984';
      
      // In SaaS mode, derive instanceId from domain; otherwise use env var
      let instanceId = import.meta.env.VITE_INSTANCE_ID;
      if (isSaaSMode && !isDevelopment) {
        instanceId = this.extractInstanceIdFromDomain();
      }
      
      config.remote = {
        couchDBUrl,
        databaseName: import.meta.env.VITE_DATABASE_NAME || 'kvetch-shared',
        isSaaSMode,
        instanceId,
        features: {
          userManagement: (import.meta.env.VITE_ENABLE_USER_MANAGEMENT || 'true') === 'true',
          staffAccounts: (import.meta.env.VITE_ENABLE_STAFF_ACCOUNTS || 'true') === 'true',
          instanceSelection: (import.meta.env.VITE_ENABLE_INSTANCE_SELECTION || 'false') === 'true'
        }
      };
      config.instanceId = instanceId;
      config.instanceName = import.meta.env.VITE_INSTANCE_NAME;
    }

    return config;
  }

  private async loadFromRemote(): Promise<Partial<RemoteConfig>> {
    // Try to load configuration from /config.json (production deployment)
    try {
      const response = await fetch('/config.json', {
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        throw new Error(`Config fetch failed: ${response.status}`);
      }
      
      const remoteConfig = await response.json();
      
      // Validate required fields
      if (!remoteConfig.couchDBUrl) {
        throw new Error('couchDBUrl is required in remote config');
      }
      
      return {
        couchDBUrl: remoteConfig.couchDBUrl,
        databaseName: remoteConfig.databaseName || 'kvetch-shared',
        isSaaSMode: remoteConfig.isSaaSMode === true,
        instanceId: remoteConfig.instanceId,
        features: {
          userManagement: remoteConfig.features?.userManagement !== false,
          staffAccounts: remoteConfig.features?.staffAccounts !== false,
          instanceSelection: remoteConfig.features?.instanceSelection === true
        }
      };
    } catch (error) {
      console.info('Remote config not available:', error);
      throw error;
    }
  }

  // Helper methods for feature flags
  isMultiUserMode(): boolean {
    return this.config?.multiUserMode === true;
  }

  isFeatureEnabled(feature: keyof NonNullable<RemoteConfig['features']>): boolean {
    if (!this.isMultiUserMode()) return false;
    return this.config?.remote?.features?.[feature] === true;
  }

  getCouchDBUrl(): string | null {
    return this.config?.remote?.couchDBUrl || null;
  }

  getDatabaseName(): string {
    return this.config?.remote?.databaseName || 'kvetch';
  }

  getInstanceId(): string | null {
    return this.config?.instanceId || null;
  }

  // Extract instance ID from current domain (for SaaS mode)
  private extractInstanceIdFromDomain(): string | undefined {
    if (typeof window === 'undefined') return undefined;
    
    const hostname = window.location.hostname;
    
    // For custom domains, the SaaS server will handle the mapping
    // For subdomains like customer1.yourapp.com, extract the subdomain
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      const subdomain = parts[0];
      // Valid subdomain pattern (not www or admin)
      if (subdomain && subdomain !== 'www' && subdomain !== 'admin' && subdomain !== 'api') {
        return subdomain;
      }
    }
    
    // For custom domains, return the full hostname as identifier
    // The server will map this to the correct instance
    if (parts.length >= 2 && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
      return hostname;
    }
    
    return undefined;
  }

  // For testing/development - allow manual override
  setConfig(config: Partial<AppConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...config };
    }
  }
}

// Export singleton instance
export const AppConfigManager = ConfigManager.getInstance();

// Convenience hook for React components
export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    AppConfigManager.getConfig()
      .then(setConfig)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return {
    config,
    loading,
    error,
    isMultiUserMode: config?.multiUserMode === true,
    isFeatureEnabled: (feature: keyof NonNullable<RemoteConfig['features']>) => 
      config?.multiUserMode === true && config?.remote?.features?.[feature] === true
  };
}

// React import for the hook
import { useState, useEffect } from 'react';