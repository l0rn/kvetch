export interface AppConfig {
  // Core feature flag - when false, app works as single-user offline-only
  multiUserMode: boolean;

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

    this.config = await this.loadConfig();
    return this.config;
  }

  private async loadConfig(): Promise<AppConfig> {
    // Try to load from environment variables first (development)
    const envConfig = this.loadFromEnvironment();
    
    // If multi-user mode is enabled, try to load remote config
    if (envConfig.multiUserMode) {
              
      return {
        ...envConfig,
        databaseName: `kvetch-shared-${envConfig.instanceId}`,
        
      }
    }

    return envConfig;
  }

  private loadFromEnvironment(): AppConfig {
    const isDevelopment = import.meta.env.DEV;
    
    // Base configuration
    let config: Partial<AppConfig> = {
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
      if (isSaaSMode) {
        instanceId = this.extractInstanceIdFromDomain();
      }
      
      config = {
        ...config,
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
    }

    return config as AppConfig;
  }

  // Helper methods for feature flags
  isMultiUserMode(): boolean {
    return this.config?.multiUserMode === true;
  }

  isFeatureEnabled(feature: keyof NonNullable<AppConfig['features']>): boolean {
    if (!this.isMultiUserMode()) return false;
    return this.config?.features?.[feature] === true;
  }

  getCouchDBUrl(): string | null {
    return this.config?.couchDBUrl || null;
  }

  getDatabaseName(): string {
    return this.config?.databaseName || 'kvetch';
  }

  getInstanceId(): string | null {
    return this.config?.instanceId || null;
  }

  // Extract instance ID from current domain (for SaaS mode)
  private extractInstanceIdFromDomain(): string | undefined {
    if (typeof window === 'undefined') return undefined;
    
    const hostname = window.location.hostname;
    
    // Check for query parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const instanceParam = urlParams.get('instance');
    if (instanceParam) {
      return instanceParam;
    }
    
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

  // Validate that the current instance exists in SaaS mode
  async validateInstance(): Promise<{ valid: boolean; instanceName?: string; error?: string }> {
    if (!this.config?.multiUserMode || !this.config?.isSaaSMode) {
      return { valid: true }; // Non-SaaS mode doesn't require validation
    }

    const instanceId = this.config.instanceId;
    if (!instanceId) {
      return { valid: false, error: 'No instance ID provided' };
    }

    // In development mode (localhost), skip strict validation
    if (this.config.isDevelopment && (
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1'
    )) {
      console.log('Development mode: skipping strict instance validation');
      return { valid: true, instanceName: instanceId };
    }

    try {
      // Use public view to validate instance existence without exposing personal data
      const couchDBUrl = this.config.couchDBUrl;
      if (!couchDBUrl) {
        return { valid: false, error: 'CouchDB URL not configured' };
      }

      try {
        // Query the secure public list function that requires explicit key
        const publicResponse = await fetch(
          `${couchDBUrl}/kvetch-subscriptions/_design/public-validation/_list/instance-exists/instance-lookup?key=${encodeURIComponent(JSON.stringify(instanceId))}`
        );
        
        if (publicResponse.ok) {
          const viewResult = await publicResponse.json();
          if (viewResult.rows && viewResult.rows.length > 0) {
            const instanceData = viewResult.rows[0].value;
            if (instanceData.status === 'active') {
              return { 
                valid: true, 
                instanceName: instanceData.name || instanceId 
              };
            } else {
              return { valid: false, error: `Instance is ${instanceData.status}` };
            }
          } else {
            return { valid: false, error: 'Instance not found' };
          }
        } else if (publicResponse.status === 404) {
          return { valid: false, error: 'Instance not found' };
        } else {
          console.warn('Public view returned error:', publicResponse.status, publicResponse.statusText);
        }
      } catch (err) {
        console.warn('Could not fetch instance validation:', err);
      }

      // If subscription check fails, assume valid for development
      if (this.config.isDevelopment) {
        return { valid: true, instanceName: instanceId };
      }

      return { valid: false, error: 'Instance validation failed' };
    } catch (error) {
      console.error('Instance validation failed:', error);
      return { valid: false, error: 'Network error during validation' };
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
    isFeatureEnabled: (feature: keyof NonNullable<AppConfig['features']>) => 
      config?.multiUserMode === true && config?.features?.[feature] === true
  };
}

// React import for the hook
import { useState, useEffect } from 'react';