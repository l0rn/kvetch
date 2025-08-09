// Enhanced database class that handles both local-only and remote sync modes
import PouchDB from 'pouchdb';
import { Database as BaseDatabase, type StaffMember } from './database-pouchdb';
import { AppConfigManager } from '../config/AppConfig';

// Extended StaffMember interface for multi-user features
export interface StaffMemberWithUser extends StaffMember {
  userId?: string;
  hasUserAccount?: boolean;
  canLogin?: boolean;
}

export class MultiUserDatabase extends BaseDatabase {
  private static remoteDB: PouchDB.Database | null = null;
  private static syncHandler: PouchDB.Replication.Sync<{}> | null = null;
  private static isMultiUserMode = false;
  private static currentInstanceId: string | null = null;

  // Override init to handle multi-user setup
  static async init(): Promise<void> {
    const config = await AppConfigManager.getConfig();
    
    if (config.multiUserMode) {
      await this.initMultiUserLocal(config);
    } else {
      // Fall back to single-user local mode
      await super.init();
    }
  }

  private static async initMultiUserLocal(config: any): Promise<void> {
    this.isMultiUserMode = true;
    this.currentInstanceId = config.instanceId || 'default';

    // Initialize local database with instance-specific name
    const localDbName = config.instanceId ? `kvetch-${config.instanceId}` : 'kvetch';
    
    // Call parent init first to set up the database
    await super.init();
    
    // Override the database name if needed for instances
    if (config.instanceId && localDbName !== 'kvetch') {
      const db = super.getDB();
      db.destroy(); // Clean up the default database
      
      // Create new instance-specific database
      const instanceDB = new PouchDB(localDbName);
      // We'll use reflection to set the private property
      (this as any).db = instanceDB;
      await (this as any).runMigrations();
    }

    // Don't initialize remote connection here - wait for explicit startRemoteSync call
  }

  private static async initMultiUser(config: any): Promise<void> {
    // Initialize local database first
    await this.initMultiUserLocal(config);

    // Initialize remote database connection to instance database
    if (config.remote?.syncGatewayUrl && config.instanceId) {
      const remoteUrl = `${config.remote.syncGatewayUrl}/kvetch-instance-${config.instanceId}`;
      this.remoteDB = new PouchDB(remoteUrl, {
        fetch: (url, opts = {}) => {
          // Add authentication headers if available
          const headers = new Headers(opts.headers);
          
          // Include credentials for cross-origin requests
          return fetch(url, {
            ...opts,
            headers,
            credentials: 'include'
          });
        }
      });

      // Start sync if user is authenticated
      await this.startSync();
    }
  }

  // Method to initialize remote sync after authentication
  static async startRemoteSync(): Promise<void> {
    if (!this.isMultiUserMode) {
      return;
    }

    const config = await AppConfigManager.getConfig();
    if (!config.remote?.syncGatewayUrl || !config.instanceId) {
      return;
    }

    // Initialize remote database connection if not already done
    if (!this.remoteDB) {
      const remoteUrl = `${config.remote.syncGatewayUrl}/kvetch-instance-${config.instanceId}`;
      this.remoteDB = new PouchDB(remoteUrl, {
        fetch: (url, opts = {}) => {
          // Add authentication headers if available
          const headers = new Headers(opts.headers);
          
          // Include credentials for cross-origin requests
          return fetch(url, {
            ...opts,
            headers,
            credentials: 'include'
          });
        }
      });
    }

    // Start sync
    await this.startSync();
  }

  static async startSync(): Promise<void> {
    if (!this.isMultiUserMode || !this.remoteDB || this.syncHandler) {
      return;
    }

    try {
      // Test connection first
      await this.remoteDB.info();

      // Start bi-directional sync  
      const localDB = super.getDB();
      this.syncHandler = localDB.sync(this.remoteDB, {
        live: true,
        retry: true,
        filter: this.currentInstanceId ? this.createInstanceFilter(this.currentInstanceId) : undefined
      }).on('change', (info) => {
        console.log('Database sync change:', info);
        // Emit events for UI updates if needed
        window.dispatchEvent(new CustomEvent('kvetch-sync-change', { detail: info }));
      }).on('paused', (err) => {
        console.log('Database sync paused:', err);
        window.dispatchEvent(new CustomEvent('kvetch-sync-paused'));
      }).on('active', () => {
        console.log('Database sync active');
        window.dispatchEvent(new CustomEvent('kvetch-sync-active'));
      }).on('denied', (err) => {
        console.warn('Database sync denied:', err);
        window.dispatchEvent(new CustomEvent('kvetch-sync-denied', { detail: err }));
      }).on('complete', (info) => {
        console.log('Database sync complete:', info);
        window.dispatchEvent(new CustomEvent('kvetch-sync-complete', { detail: info }));
      }).on('error', (err) => {
        console.error('Database sync error:', err);
        window.dispatchEvent(new CustomEvent('kvetch-sync-error', { detail: err }));
      });

    } catch (err) {
      console.error('Failed to start sync:', err);
      throw err;
    }
  }

  static async stopSync(): Promise<void> {
    if (this.syncHandler) {
      this.syncHandler.cancel();
      this.syncHandler = null;
    }
  }

  private static createInstanceFilter(instanceId: string) {
    return (doc: any) => {
      // Allow schema version and user documents
      if (doc.type === 'schema-version' || doc.type === 'user') {
        return true;
      }
      
      // Filter by instance ID for all other documents
      return doc.instanceId === instanceId;
    };
  }

  // Override document creation to add instanceId in multi-user mode
  private static addInstanceContext(doc: any): any {
    if (this.isMultiUserMode && this.currentInstanceId && doc.type !== 'schema-version' && doc.type !== 'user') {
      return {
        ...doc,
        instanceId: this.currentInstanceId
      };
    }
    return doc;
  }

  // Override save methods to add instance context
  static async saveTrait(trait: any): Promise<void> {
    const enhancedTrait = this.addInstanceContext(trait);
    return super.saveTrait(enhancedTrait);
  }

  static async saveShift(shift: any): Promise<void> {
    const enhancedShift = this.addInstanceContext(shift);
    return super.saveShift(enhancedShift);
  }

  static async saveShiftOccurrence(occurrence: any): Promise<void> {
    const enhancedOccurrence = this.addInstanceContext(occurrence);
    return super.saveShiftOccurrence(enhancedOccurrence);
  }

  static async saveStaffMember(staff: any): Promise<void> {
    const enhancedStaff = this.addInstanceContext(staff);
    return super.saveStaffMember(enhancedStaff);
  }

  // Enhanced staff member save that can link to user accounts
  static async saveStaffMemberWithUser(staff: StaffMember, userId?: string): Promise<void> {
    const enhancedStaff: StaffMemberWithUser = {
      ...this.addInstanceContext(staff),
      userId: userId || undefined
    };
    // Cast to any to work around the type issue
    return super.saveStaffMember(enhancedStaff as any);
  }

  // Get staff members with user account linking
  static async getStaffMembersWithUsers(): Promise<StaffMemberWithUser[]> {
    const staffMembers = await super.getStaffMembers();
    
    if (!this.isMultiUserMode) {
      return staffMembers.map(staff => ({ 
        ...staff, 
        hasUserAccount: false,
        canLogin: false
      }));
    }

    // Add user account information
    return staffMembers.map(staff => {
      const staffWithUser = staff as StaffMemberWithUser;
      return {
        ...staffWithUser,
        hasUserAccount: Boolean(staffWithUser.userId),
        canLogin: Boolean(staffWithUser.userId)
      };
    });
  }

  // Get sync status
  static getSyncStatus(): {
    isMultiUserMode: boolean;
    isConnected: boolean;
    instanceId: string | null;
    lastSync?: Date;
  } {
    return {
      isMultiUserMode: this.isMultiUserMode,
      isConnected: Boolean(this.syncHandler && this.remoteDB),
      instanceId: this.currentInstanceId,
      // lastSync would be tracked from sync events
    };
  }

  // Force sync (for manual sync triggers)
  static async forceSync(): Promise<void> {
    if (this.isMultiUserMode && this.remoteDB) {
      try {
        const localDB = super.getDB();
        await localDB.replicate.to(this.remoteDB);
        await localDB.replicate.from(this.remoteDB);
      } catch (err) {
        console.error('Force sync failed:', err);
        throw err;
      }
    }
  }

  // Switch instance (for multi-tenant scenarios)
  static async switchInstance(instanceId: string): Promise<void> {
    if (!this.isMultiUserMode) {
      throw new Error('Instance switching only available in multi-user mode');
    }

    // Stop current sync
    await this.stopSync();
    
    // Update instance context
    this.currentInstanceId = instanceId;
    
    // Initialize new local database for instance
    const localDbName = `kvetch-${instanceId}`;
    const newDB = new PouchDB(localDbName);
    (this as any).db = newDB;
    await (this as any).runMigrations();
    
    // Restart sync with new filter
    await this.startSync();
  }

  // Cleanup when switching to single-user mode
  static async disableMultiUser(): Promise<void> {
    await this.stopSync();
    this.remoteDB = null;
    this.isMultiUserMode = false;
    this.currentInstanceId = null;
    
    // Reinitialize with single-user database
    await super.init();
  }
}