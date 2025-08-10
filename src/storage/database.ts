import PouchDB from 'pouchdb';
import type { AppConfig } from '../config/AppConfig';

// PouchDB document base interface
interface BaseDoc {
  _id: string;
  _rev?: string;
  type: 'trait' | 'shift' | 'shift-occurrence' | 'staff' | 'schema-version';
  createdAt: string;
  updatedAt: string;
  instanceId?: string; // Added for multi-user support
}

// Schema version document for migrations
interface SchemaVersionDoc extends BaseDoc {
  type: 'schema-version';
  version: number;
}

// Trait document
export interface TraitDoc extends BaseDoc {
  type: 'trait';
  name: string;
  description?: string;
}

// Shift document  
export interface ShiftDoc extends BaseDoc {
  type: 'shift';
  name: string;
  startDateTime: string;
  endDateTime: string;
  recurrence?: {
    type: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: string;
    weekdays?: number[]; // For weekly recurrence: 0=Sunday, 1=Monday, etc.
  };
  requirements: {
    staffCount: number;
    requiredTraits?: Array<{
      traitId: string;
      minCount: number;
    }>;
  };
}

// Shift occurrence document
export interface ShiftOccurrenceDoc extends BaseDoc {
  type: 'shift-occurrence';
  parentShiftId: string;
  name: string;
  startDateTime: string;
  endDateTime: string;
  requirements: {
    staffCount: number;
    requiredTraits?: Array<{
      traitId: string;
      minCount: number;
    }>;
  };
  assignedStaff: string[];
  isModified: boolean;
  isDeleted: boolean;
}

// Staff member document
export interface StaffDoc extends BaseDoc {
  type: 'staff';
  name: string;
  traitIds: string[];
  constraints: {
    maxShiftsPerDay?: number;
    maxShiftsPerWeek?: number;
    maxShiftsPerMonth?: number;
    maxShiftsPerYear?: number;
    incompatibleWith: string[];
    // New constraint types
    restDaysWithStaff?: Array<{
      staffId: string;
      minRestDays: number;
      period: 'week' | 'month';
    }>;
    consecutiveRestDays?: Array<{
      minConsecutiveDays: number;
      period: 'week' | 'month';
    }>;
  };
  blockedTimes: Array<{
    id: string;
    startDateTime: string;
    endDateTime: string;
    isFullDay: boolean;
    recurrence?: {
      type: 'daily' | 'weekly' | 'monthly';
      interval: number;
      endDate?: string;
      weekdays?: number[]; // For weekly recurrence: 0=Sunday, 1=Monday, etc.
    };
  }>;
  // Multi-user fields
  userId?: string;
}

// Legacy interfaces for backward compatibility (remove PouchDB-specific fields)
export interface Trait {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  name: string;
  startDateTime: Date;
  endDateTime: Date;
  recurrence?: {
    type: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: string;
    weekdays?: number[]; // For weekly recurrence: 0=Sunday, 1=Monday, etc.
  };
  requirements: {
    staffCount: number;
    requiredTraits?: Array<{
      traitId: string;
      minCount: number;
    }>;
  };
}

export interface ShiftOccurrence {
  id: string;
  parentShiftId: string;
  name: string;
  startDateTime: Date;
  endDateTime: Date;
  requirements: {
    staffCount: number;
    requiredTraits?: Array<{
      traitId: string;
      minCount: number;
    }>;
  };
  assignedStaff: string[];
  isModified: boolean;
  isDeleted: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  traitIds: string[];
  constraints: {
    maxShiftsPerDay?: number;
    maxShiftsPerWeek?: number;
    maxShiftsPerMonth?: number;
    maxShiftsPerYear?: number;
    incompatibleWith: string[];
    // New constraint types
    restDaysWithStaff?: Array<{
      staffId: string;
      minRestDays: number;
      period: 'week' | 'month';
    }>;
    consecutiveRestDays?: Array<{
      minConsecutiveDays: number;
      period: 'week' | 'month';
    }>;
  };
  blockedTimes: Array<{
    id: string;
    startDateTime: Date;
    endDateTime: Date;
    isFullDay: boolean;
    recurrence?: {
      type: 'daily' | 'weekly' | 'monthly';
      interval: number;
      endDate?: Date;
      weekdays?: number[]; // For weekly recurrence: 0=Sunday, 1=Monday, etc.
    };
  }>;
}

// Extended StaffMember interface for multi-user features
export interface StaffMemberWithUser extends StaffMember {
  userId?: string;
  hasUserAccount?: boolean;
  canLogin?: boolean;
}

// Unified Database class that handles both local-only and remote sync modes
export class Database {
  private static db: PouchDB.Database;
  private static readonly SCHEMA_VERSION = 1;
  
  // Configuration
  private static config: AppConfig | null = null;
  
  // Multi-user support fields
  private static remoteDB: PouchDB.Database | null = null;
  private static syncHandler: PouchDB.Replication.Sync<{}> | null = null;
  private static isMultiUserMode = false;
  private static currentInstanceId: string | null = null;
  private static syncInitializing = false;

  // Initialize database with config - handles both single-user and multi-user modes
  static async init(config: AppConfig): Promise<void> {
    this.config = config;
    
    if (config.multiUserMode) {
      await this.initMultiUserMode(config);
    } else {
      // Single-user local mode
      await this.initLocalMode();
    }
  }

  private static async initLocalMode(): Promise<void> {
    if (!this.db) {
      this.db = new PouchDB('kvetch');
      await this.runMigrations();
    }
  }

  private static async initMultiUserMode(config: any): Promise<void> {
    this.isMultiUserMode = true;
    this.currentInstanceId = config.instanceId || 'default';

    // Initialize local database with instance-specific name
    const localDbName = config.instanceId ? `kvetch-${config.instanceId}` : 'kvetch';
    
    // Create instance-specific database if needed
    if (!this.db) {
      this.db = new PouchDB(localDbName);
      await this.runMigrations();
    }

    // Don't initialize remote connection here - wait for explicit startRemoteSync call
  }

  // Schema migration system
  protected static async runMigrations(): Promise<void> {
    try {
      const versionDoc = await this.db.get('schema-version') as SchemaVersionDoc;
      const currentVersion = versionDoc.version;

      if (currentVersion < this.SCHEMA_VERSION) {
        console.log(`Migrating database from version ${currentVersion} to ${this.SCHEMA_VERSION}`);
        // Run migrations here
        // Future migrations can be added here
        
        // Update schema version
        await this.db.put({
          ...versionDoc,
          version: this.SCHEMA_VERSION,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 404) {
        // First time setup
        await this.db.put({
          _id: 'schema-version',
          type: 'schema-version' as const,
          version: this.SCHEMA_VERSION,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        // Database initialized for first time
      } else {
        throw err;
      }
    }
  }

  // Method to initialize remote sync after authentication (multi-user mode only)
  static async startRemoteSync(): Promise<void> {
    console.log('🔄 startRemoteSync() called');
    
    if (!this.isMultiUserMode) {
      console.log('❌ Not in multi-user mode, skipping sync');
      return;
    }
    
    if (this.syncInitializing) {
      console.log('⚠️ Sync already initializing, skipping duplicate call');
      return;
    }
    
    if (this.syncHandler) {
      console.log('✅ Sync already running');
      return;
    }
    
    this.syncInitializing = true;

    if (!this.config) {
      console.log('❌ No config available, cannot start sync');
      this.syncInitializing = false;
      return;
    }

    const config = this.config;
    console.log('📋 Config loaded:', {
      multiUserMode: config.multiUserMode,
      syncGatewayUrl: config.remote?.syncGatewayUrl,
      instanceId: config.instanceId
    });
    
    if (!config.remote?.syncGatewayUrl || !config.instanceId) {
      console.log('❌ Missing sync config, cannot start sync');
      this.syncInitializing = false;
      return;
    }

    // Initialize remote database connection if not already done
    if (!this.remoteDB) {
      // Use cookie-based authentication instead of basic auth
      const baseUrl = config.remote.syncGatewayUrl;
      const remoteUrl = `${baseUrl}/kvetch-instance-${config.instanceId}`;
      
      console.log('🏗️ Initializing PouchDB connection to:', remoteUrl, '(with cookie auth)');
      
      // Create PouchDB with cookie authentication
      this.remoteDB = new PouchDB(remoteUrl, {
        fetch: (url, opts = {}) => {
          console.log('📡 PouchDB sync fetch to:', url);
          
          // Ensure cookies are included in all requests
          const fetchOpts: RequestInit = {
            ...opts,
            credentials: 'include' as RequestCredentials,
            headers: {
              ...opts.headers,
              // CouchDB expects cookies to be sent for authenticated requests
            }
          };
          
          return fetch(url, fetchOpts).then(response => {
            console.log('📡 PouchDB sync response:', response.status, response.statusText);
            if (!response.ok) {
              console.log('❌ Bad response headers:', Array.from(response.headers.entries()));
            }
            return response;
          }).catch(error => {
            console.error('📡 PouchDB sync fetch error:', error);
            throw error;
          });
        }
      });
      
      console.log('✅ PouchDB remote instance created');
    } else {
      console.log('♻️ Remote DB already exists, reusing');
    }

    // Start sync
    console.log('🚀 Starting sync process...');
    try {
      await this.startSync();
      console.log('✅ Sync initialization complete');
    } catch (error) {
      console.error('❌ Sync initialization failed:', error);
      this.syncHandler = null;
      this.remoteDB = null;
    } finally {
      this.syncInitializing = false;
    }
  }

  private static async startSync(): Promise<void> {
    console.log('🔄 startSync() called');
    
    if (!this.isMultiUserMode) {
      console.log('❌ Not in multi-user mode');
      return;
    }
    
    if (!this.remoteDB) {
      console.log('❌ No remote DB instance');
      return;
    }
    
    if (this.syncHandler) {
      console.log('⚠️ Sync handler already exists');
      return;
    }

    try {
      // Test connection first
      console.log('🧪 Testing remote DB connection...');
      const info = await this.remoteDB.info();
      console.log('✅ Remote DB info:', info);

      // Start bi-directional sync  
      console.log('🔄 Starting sync with instanceId:', this.currentInstanceId);
      console.log('🔄 Local DB exists:', !!this.db);
      
      const syncOptions = {
        live: true,
        retry: false, // Disable retry to prevent loops
        // Filter documents by instance for multi-tenant support
        filter: this.currentInstanceId ? this.createInstanceFilter(this.currentInstanceId) : undefined
      };
      console.log('🔄 Sync options:', syncOptions);
      
      this.syncHandler = this.db.sync(this.remoteDB, syncOptions).on('change', (info) => {
        console.log('Database sync change:', info);
        // Emit events for UI updates if needed
        window.dispatchEvent(new CustomEvent('kvetch-sync-change', { detail: info }));
      }).on('paused', (err?: any) => {
        console.log('Database sync paused. Error details:', err);
        console.log('Sync paused - typeof err:', typeof err, 'err:', err);
        if (err) {
          console.error('Sync pause error details:', {
            message: err.message,
            status: err.status,
            name: err.name,
            reason: err.reason,
            stack: err.stack
          });
        } else {
          console.log('Sync paused without error - likely completed initial sync');
        }
        window.dispatchEvent(new CustomEvent('kvetch-sync-paused'));
      }).on('active', () => {
        console.log('Database sync active');
        window.dispatchEvent(new CustomEvent('kvetch-sync-active'));
      }).on('denied', (err: any) => {
        console.warn('Database sync denied:', err);
        console.error('Sync denied error details:', {
          message: err?.message,
          status: err?.status,
          name: err?.name,
          reason: err?.reason
        });
        window.dispatchEvent(new CustomEvent('kvetch-sync-denied', { detail: err }));
      }).on('complete', (info: any) => {
        console.log('Database sync complete:', info);
        window.dispatchEvent(new CustomEvent('kvetch-sync-complete', { detail: info }));
      }).on('error', (err: any) => {
        console.error('Database sync error:', err);
        console.error('Sync error details:', {
          message: err?.message,
          status: err?.status,
          name: err?.name,
          reason: err?.reason
        });
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

  // Add instance context to documents in multi-user mode
  private static addInstanceContext(doc: any): any {
    if (this.isMultiUserMode && this.currentInstanceId && doc.type !== 'schema-version' && doc.type !== 'user') {
      return {
        ...doc,
        instanceId: this.currentInstanceId
      };
    }
    return doc;
  }

  // Helper functions to convert between PouchDB docs and legacy interfaces
  private static docToTrait(doc: TraitDoc): Trait {
    return {
      id: doc._id.replace('trait:', ''),
      name: doc.name,
      description: doc.description,
      createdAt: doc.createdAt
    };
  }

  private static traitToDoc(trait: Partial<Trait>): Omit<TraitDoc, '_rev'> {
    const now = new Date().toISOString();
    const baseDoc = {
      _id: `trait:${trait.id ?? this.makeId(trait.name!)}`,
      type: 'trait' as const,
      name: trait.name!,
      description: trait.description,
      createdAt: trait.createdAt || now,
      updatedAt: now
    };
    return this.addInstanceContext(baseDoc);
  }

  private static docToShift(doc: ShiftDoc): Shift {
    return {
      id: doc._id.replace('shift:', ''),
      name: doc.name,
      startDateTime: new Date(doc.startDateTime),
      endDateTime: new Date(doc.endDateTime),
      recurrence: doc.recurrence,
      requirements: doc.requirements
    };
  }

  private static shiftToDoc(shift: Partial<Shift>): Omit<ShiftDoc, '_rev'> {
    const now = new Date().toISOString();

    const baseDoc = {
      _id: `shift:${shift.id ?? this.makeId(shift.name!, shift.startDateTime!)}`,
      type: 'shift' as const,
      name: shift.name!,
      startDateTime: shift.startDateTime!.toISOString(),
      endDateTime: shift.endDateTime!.toISOString(),
      recurrence: shift.recurrence,
      requirements: shift.requirements!,
      createdAt: now,
      updatedAt: now
    };
    return this.addInstanceContext(baseDoc);
  }

  private static docToShiftOccurrence(doc: ShiftOccurrenceDoc): ShiftOccurrence {
    return {
      id: doc._id.replace('shift-occurrence:', ''),
      parentShiftId: doc.parentShiftId,
      name: doc.name,
      startDateTime: new Date(doc.startDateTime),
      endDateTime: new Date(doc.endDateTime),
      requirements: doc.requirements,
      assignedStaff: doc.assignedStaff,
      isModified: doc.isModified,
      isDeleted: doc.isDeleted
    };
  }

  private static shiftOccurrenceToDoc(occurrence: Partial<ShiftOccurrence>): Omit<ShiftOccurrenceDoc, '_rev'> {
    const now = new Date().toISOString();
    const baseDoc = {
      _id: `shift-occurrence:${occurrence.id ?? this.makeId(occurrence.name!, occurrence.startDateTime!)}`,
      type: 'shift-occurrence' as const,
      parentShiftId: occurrence.parentShiftId!,
      name: occurrence.name!,
      startDateTime: occurrence.startDateTime!.toISOString(),
      endDateTime: occurrence.endDateTime!.toISOString(),
      requirements: occurrence.requirements!,
      assignedStaff: occurrence.assignedStaff || [],
      isModified: occurrence.isModified || false,
      isDeleted: occurrence.isDeleted || false,
      createdAt: now,
      updatedAt: now
    };
    return this.addInstanceContext(baseDoc);
  }

  private static docToStaffMember(doc: StaffDoc): StaffMember {
    return {
      id: doc._id.replace('staff:', ''),
      name: doc.name,
      traitIds: doc.traitIds,
      constraints: doc.constraints,
      blockedTimes: doc.blockedTimes.map(bt => ({
        id: bt.id,
        startDateTime: new Date(bt.startDateTime),
        endDateTime: new Date(bt.endDateTime),
        isFullDay: bt.isFullDay,
        recurrence: bt.recurrence
          ? {
            ...bt.recurrence,
            endDate: bt.recurrence?.endDate ? new Date(bt.recurrence.endDate) : undefined
          }
          : undefined
      }))
    };
  }

  private static staffMemberToDoc(staff: Partial<StaffMember>): Omit<StaffDoc, '_rev'> {
    const now = new Date().toISOString();
    const baseDoc = {
      _id: `staff:${staff.id ?? this.makeId(staff.name!, new Date())}`,
      type: 'staff' as const,
      name: staff.name!,
      traitIds: staff.traitIds || [],
      constraints: staff.constraints!,
      blockedTimes: staff.blockedTimes?.map(bt => {
        return {
          id: bt.id || Date.now().toString(),
          startDateTime: bt.startDateTime.toISOString(),
          endDateTime: bt.endDateTime.toISOString(),
          isFullDay: bt.isFullDay,
          recurrence: bt.recurrence
            ? {
              ...bt.recurrence,
              endDate: bt.recurrence.endDate ? bt.recurrence.endDate.toISOString() : undefined
            }
            : undefined
        };
      }) ?? [],
      createdAt: now,
      updatedAt: now
    };
    return this.addInstanceContext(baseDoc);
  }

  // CRUD operations for Traits
  static async getTraits(): Promise<Trait[]> {
    const result = await this.db.allDocs({
      include_docs: true,
      startkey: 'trait:',
      endkey: 'trait:\uffff'
    });
    
    return result.rows
      .map(row => row.doc as TraitDoc)
      .map(doc => this.docToTrait(doc))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  static async saveTrait(trait: Trait): Promise<void> {
    const docToSave = this.traitToDoc(trait);
    
    try {
      const existing = await this.db.get(docToSave._id);
      await this.db.put({ ...docToSave, _rev: existing._rev });
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 404) {
        await this.db.put(docToSave);
      } else {
        throw err;
      }
    }
  }

  static async deleteTrait(id: string): Promise<void> {
    const doc = await this.db.get(`trait:${id}`);
    await this.db.remove(doc);
  }

  static async findTraitByName(name: string): Promise<Trait | null> {
    const traits = await this.getTraits();
    return traits.find(trait => trait.name.toLowerCase() === name.toLowerCase()) || null;
  }

  static async createOrFindTrait(name: string): Promise<Trait> {
    const existing = await this.findTraitByName(name);
    if (existing) {
      return existing;
    }

    const newTrait: Trait = {
      id: Date.now().toString(),
      name: name.trim(),
      createdAt: new Date().toISOString()
    };

    await this.saveTrait(newTrait);
    return newTrait;
  }

  // CRUD operations for Shifts  
  static async getShifts(): Promise<Shift[]> {
    const result = await this.db.allDocs({
      include_docs: true,
      startkey: 'shift:',
      endkey: 'shift:\uffff'
    });
    
    return result.rows
      .map(row => row.doc as ShiftDoc)
      .map(doc => this.docToShift(doc));
  }

  static async saveShift(shift: Shift): Promise<void> {
    const docToSave = this.shiftToDoc(shift);
    try {
      const existing = await this.db.get(docToSave._id);
      await this.db.put({ ...docToSave, _rev: existing._rev });
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 404) {
        await this.db.put(docToSave);
      } else {
        throw err;
      }
    }
  }

  static async deleteShift(id: string): Promise<void> {
    const doc = await this.db.get(`shift:${id}`);
    await this.db.remove(doc);
  }

  // CRUD operations for Shift Occurrences
  static async getShiftOccurrences(): Promise<ShiftOccurrence[]> {
    const result = await this.db.allDocs({
      include_docs: true,
      startkey: 'shift-occurrence:',
      endkey: 'shift-occurrence:\uffff'
    });
    
    return result.rows
      .map(row => row.doc as ShiftOccurrenceDoc)
      .map(doc => this.docToShiftOccurrence(doc));
  }

  static async saveShiftOccurrence(occurrence: ShiftOccurrence): Promise<void> {
    const docToSave = this.shiftOccurrenceToDoc(occurrence);
    
    try {
      const existing = await this.db.get(docToSave._id);
      await this.db.put({ ...docToSave, _rev: existing._rev });
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 404) {
        await this.db.put(docToSave);
      } else {
        throw err;
      }
    }
  }

  static async deleteShiftOccurrence(id: string): Promise<void> {
    const doc = await this.db.get(`shift-occurrence:${id}`);
    await this.db.remove(doc);
  }

  static async deleteShiftOccurrencesByParent(parentShiftId: string): Promise<void> {
    const occurrences = await this.getShiftOccurrences();
    const toDelete = occurrences.filter(occ => occ.parentShiftId === parentShiftId);
    
    for (const occurrence of toDelete) {
      await this.deleteShiftOccurrence(occurrence.id);
    }
  }

  // CRUD operations for Staff Members
  static async getStaffMembers(): Promise<StaffMember[]> {
    const result = await this.db.allDocs({
      include_docs: true,
      startkey: 'staff:',
      endkey: 'staff:\uffff'
    });
    
    return result.rows
      .map(row => row.doc as StaffDoc)
      .map(doc => this.docToStaffMember(doc));
  }

  static async saveStaffMember(staff: StaffMember): Promise<void> {
    const docToSave = this.staffMemberToDoc(staff);
    
    try {
      const existing = await this.db.get(docToSave._id);
      await this.db.put({ ...docToSave, _rev: existing._rev });
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 404) {
        await this.db.put(docToSave);
      } else {
        throw err;
      }
    }
  }

  static async deleteStaffMember(id: string): Promise<void> {
    const doc = await this.db.get(`staff:${id}`);
    await this.db.remove(doc);
  }

  // Enhanced staff member save that can link to user accounts (multi-user mode)
  static async saveStaffMemberWithUser(staff: StaffMember, userId?: string): Promise<void> {
    const enhancedStaff: StaffMemberWithUser = {
      ...staff,
      userId: userId || undefined
    };
    // Cast to any to work around the type issue
    return this.saveStaffMember(enhancedStaff as any);
  }

  // Get staff members with user account linking (multi-user mode)
  static async getStaffMembersWithUsers(): Promise<StaffMemberWithUser[]> {
    const staffMembers = await this.getStaffMembers();
    
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

  // Get sync status (multi-user mode)
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

  // Get remote database for debugging (multi-user mode)
  static getRemoteDB(): PouchDB.Database | null {
    return this.remoteDB;
  }

  // Force sync (for manual sync triggers in multi-user mode)
  static async forceSync(): Promise<void> {
    if (this.isMultiUserMode && this.remoteDB) {
      try {
        await this.db.replicate.to(this.remoteDB);
        await this.db.replicate.from(this.remoteDB);
      } catch (err) {
        console.error('Force sync failed:', err);
        throw err;
      }
    }
  }

  // Switch instance (for multi-tenant scenarios in multi-user mode)
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
    this.db = newDB;
    await this.runMigrations();
    
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
    await this.initLocalMode();
  }

  // Remote sync setup (for backward compatibility, now handled by startRemoteSync)
  static setupRemoteSync(remoteUrl: string): void {
    if (this.db && !this.isMultiUserMode) {
      const remoteDB = new PouchDB(remoteUrl);
      this.db.sync(remoteDB, {
        live: true,
        retry: true
      }).on('change', (info) => {
        console.log('Database sync change:', info);
      }).on('paused', () => {
        console.log('Database sync paused');
      }).on('active', () => {
        console.log('Database sync active');
      }).on('denied', (err) => {
        console.log('Database sync denied:', err);
      }).on('complete', (info) => {
        console.log('Database sync complete:', info);
      }).on('error', (err) => {
        console.log('Database sync error:', err);
      });
    }
  }

  // Get database instance for advanced operations
  static getDB(): PouchDB.Database {
    return this.db;
  }

  private static makeId(name: string, date: Date | undefined = undefined): string {
    if (date !== undefined) {
      return `${name}-${date?.getTime()}`;
    }
    return name;
  }
}

// Export legacy class names for backward compatibility
export const MultiUserDatabase = Database;