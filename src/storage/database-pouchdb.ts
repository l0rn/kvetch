import PouchDB from 'pouchdb';

// PouchDB document base interface
interface BaseDoc {
  _id: string;
  _rev?: string;
  type: 'trait' | 'shift' | 'shift-occurrence' | 'staff' | 'schema-version';
  createdAt: string;
  updatedAt: string;
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
    };
  }>;
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
    };
  }>;
}

// Database class
export class Database {
  private static db: PouchDB.Database;
  private static readonly SCHEMA_VERSION = 1;

  // Initialize database
  static async init(): Promise<void> {
    if (!this.db) {
      this.db = new PouchDB('kvetch');
      await this.runMigrations();
    }
  }

  // Schema migration system
  private static async runMigrations(): Promise<void> {
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
    return {
      _id: `trait:${trait.id ?? this.makeId(trait.name!)}`,
      type: 'trait',
      name: trait.name!,
      description: trait.description,
      createdAt: trait.createdAt || now,
      updatedAt: now
    };
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

    return {
      _id: `shift:${shift.id ?? this.makeId(shift.name!, shift.startDateTime!)}`,
      type: 'shift',
      name: shift.name!,
      startDateTime: shift.startDateTime!.toISOString(),
        endDateTime: shift.endDateTime!.toISOString(),
      recurrence: shift.recurrence,
      requirements: shift.requirements!,
      createdAt: now,
      updatedAt: now
    };
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
    return {
      _id: `shift-occurrence:${occurrence.id ?? this.makeId(occurrence.name!, occurrence.startDateTime!)}`,
      type: 'shift-occurrence',
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
    return {
      _id: `staff:${staff.id ?? this.makeId(staff.name!, new Date())}`,
      type: 'staff',
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
  }

  // CRUD operations for Traits
  static async getTraits(): Promise<Trait[]> {
    await this.init();
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
    await this.init();
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
    await this.init();
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
    await this.init();
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
    await this.init();
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
    await this.init();
    const doc = await this.db.get(`shift:${id}`);
    await this.db.remove(doc);
  }

  // CRUD operations for Shift Occurrences
  static async getShiftOccurrences(): Promise<ShiftOccurrence[]> {
    await this.init();
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
    await this.init();
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
    await this.init();
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
    await this.init();
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
    await this.init();
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
    await this.init();
    const doc = await this.db.get(`staff:${id}`);
    await this.db.remove(doc);
  }


  // Remote sync setup (for future use)
  static setupRemoteSync(remoteUrl: string): void {
    if (this.db) {
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