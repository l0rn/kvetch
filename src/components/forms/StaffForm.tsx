import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffMember, Trait } from '../../storage/database-pouchdb';
import type { StaffConstraints } from '../../utils/constraints';
import { Database } from '../../storage/database-pouchdb';
import { TraitAutocomplete } from '../TraitAutocomplete';
import { StaffAutocomplete } from '../StaffAutocomplete';
import { toLocalDateInputValue, toLocalDateTimeInputValue } from '../../utils/datetime';

// UI-specific constraint interfaces with temporary IDs for form management
interface RestDaysWithStaffConstraintUI {
  id: string; // Temporary UI ID for form management
  staffId: string;
  minRestDays: number;
  period: 'week' | 'month';
}

interface ConsecutiveRestDaysConstraintUI {
  id: string; // Temporary UI ID for form management
  minConsecutiveDays: number;
  period: 'week' | 'month';
}

interface StaffFormProps {
  initialStaff?: StaffMember | null;
  onSave: (staff: Omit<StaffMember, 'id'>) => void;
  onCancel: () => void;
}

export function StaffForm({ initialStaff, onSave, onCancel }: StaffFormProps) {
  const { t, i18n } = useTranslation();
  const [traits, setTraits] = useState<Trait[]>([]);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [formData, setFormData] = useState({
    name: initialStaff?.name || '',
    traitIds: initialStaff?.traitIds || [],
    maxShiftsPerWeek: initialStaff?.constraints.maxShiftsPerWeek || '',
    maxShiftsPerMonth: initialStaff?.constraints.maxShiftsPerMonth || '',
    maxShiftsPerYear: initialStaff?.constraints.maxShiftsPerYear || '',
    incompatibleWith: initialStaff?.constraints.incompatibleWith || [],
    blockedTimes: initialStaff?.blockedTimes || [],
    restDaysWithStaff: (initialStaff?.constraints as StaffConstraints)?.restDaysWithStaff?.map(constraint => ({
      ...constraint,
      id: Math.random().toString(36).substr(2, 9) // Add temporary UI ID
    })) || [],
    consecutiveRestDays: (initialStaff?.constraints as StaffConstraints)?.consecutiveRestDays?.map(constraint => ({
      ...constraint,
      id: Math.random().toString(36).substr(2, 9) // Add temporary UI ID
    })) || [],
  });
  const [editingBlockedTimes, setEditingBlockedTimes] = useState<{[key: string]: boolean}>({});
  const [editingRestDaysWithStaff, setEditingRestDaysWithStaff] = useState<{[key: string]: boolean}>({});
  const [editingConsecutiveRestDays, setEditingConsecutiveRestDays] = useState<{[key: string]: boolean}>({});
  
  // Validation error states
  const [restDaysWithStaffErrors, setRestDaysWithStaffErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    const loadData = async () => {
      const [allTraits, staffMembers] = await Promise.all([
        Database.getTraits(),
        Database.getStaffMembers()
      ]);
      setTraits(allTraits);
      setAllStaff(staffMembers);
    };
    loadData();
  }, []);

  const createNewBlockedTime = () => {
    const now = new Date();
    now.setSeconds(0, 0);
    const end = new Date();
    end.setSeconds(0, 0);
    end.setHours(end.getHours() + 8);
    
    return {
      id: Date.now().toString(),
      startDateTime: now,
      endDateTime: end,
      isFullDay: false,
      recurrence: undefined,
    };
  };


  const handleTraitSelect = async (trait: Trait) => {
    let traitToUse = trait;
    
    // If trait doesn't have an ID, create it
    if (!trait.id) {
      traitToUse = await Database.createOrFindTrait(trait.name);
    }

    // Check if already selected
    if (!formData.traitIds.includes(traitToUse.id)) {
      setFormData(prev => ({
        ...prev,
        traitIds: [...prev.traitIds, traitToUse.id]
      }));
    }

    // Always refresh traits list after selection (in case a new trait was created)
    const allTraits = await Database.getTraits();
    setTraits(allTraits);
  };

  const removeTrait = (traitId: string) => {
    setFormData(prev => ({
      ...prev,
      traitIds: prev.traitIds.filter(id => id !== traitId)
    }));
  };

  const getTraitName = (traitId: string): string => {
    const trait = traits.find(trait => trait.id === traitId);
    return trait ? trait.name : t('staff.unknownTrait');
  };

  const handleIncompatibleStaffSelect = (staffMember: StaffMember) => {
    if (!formData.incompatibleWith.includes(staffMember.id)) {
      setFormData(prev => ({
        ...prev,
        incompatibleWith: [...prev.incompatibleWith, staffMember.id]
      }));
    }
  };

  const removeIncompatibleStaff = (staffId: string) => {
    setFormData(prev => ({
      ...prev,
      incompatibleWith: prev.incompatibleWith.filter(id => id !== staffId)
    }));
  };

  const getStaffName = (staffId: string): string => {
    const staff = allStaff.find(s => s.id === staffId);
    return staff ? staff.name : 'Unknown Staff';
  };

  const addNewBlockedTime = () => {
    const newBlockedTime = createNewBlockedTime();
    setFormData(prev => ({
      ...prev,
      blockedTimes: [...prev.blockedTimes, newBlockedTime]
    }));
    setEditingBlockedTimes(prev => ({
      ...prev,
      [newBlockedTime.id]: true
    }));
  };

  const saveBlockedTime = (id: string) => {
    setEditingBlockedTimes(prev => ({
      ...prev,
      [id]: false
    }));
  };

  const cancelBlockedTimeEdit = (id: string) => {
    const wasNewlyCreated = editingBlockedTimes[id] && formData.blockedTimes.find(bt => bt.id === id);
    if (wasNewlyCreated) {
      removeBlockedTime(id);
    } else {
      setEditingBlockedTimes(prev => ({
        ...prev,
        [id]: false
      }));
    }
  };

  const updateBlockedTime = (id: string, updates: Partial<StaffMember['blockedTimes'][0]>) => {
    setFormData(prev => ({
      ...prev,
      blockedTimes: prev.blockedTimes.map(bt => 
        bt.id === id ? { ...bt, ...updates } : bt
      )
    }));
  };

  const toggleFullDay = (id: string, isFullDay: boolean) => {
    setFormData(prev => ({
      ...prev,
      blockedTimes: prev.blockedTimes.map(bt => {
        if (bt.id === id) {
          // Convert to full day  
          const startDate = new Date(bt.startDateTime);
          const endDate = new Date(bt.endDateTime);
          if (isFullDay) {
            startDate.setHours(0, 0, 0);
            endDate.setHours(23, 59, 59);
          }

          return {
            ...bt,
            isFullDay,
            startDateTime: startDate,
            endDateTime: endDate,
          };
        }
        return bt;
      })
    }));
  };

  const removeBlockedTime = (id: string) => {
    setFormData(prev => ({
      ...prev,
      blockedTimes: prev.blockedTimes.filter(bt => bt.id !== id)
    }));
    setEditingBlockedTimes(prev => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: removed, ...rest } = prev;
      return rest;
    });
  };

  const toggleBlockedTimeWeekday = (blockedTimeId: string, weekday: number) => {
    setFormData(prev => ({
      ...prev,
      blockedTimes: prev.blockedTimes.map(bt => {
        if (bt.id !== blockedTimeId || !bt.recurrence) return bt;
        
        const currentWeekdays = bt.recurrence.weekdays || [];
        const newWeekdays = currentWeekdays.includes(weekday)
          ? currentWeekdays.filter(d => d !== weekday)
          : [...currentWeekdays, weekday].sort((a, b) => a - b);
          
        return {
          ...bt,
          recurrence: {
            ...bt.recurrence,
            weekdays: newWeekdays.length > 0 ? newWeekdays : undefined
          }
        };
      })
    }));
  };

  // Rest days with staff constraint handlers
  const addRestDaysWithStaff = () => {
    const newConstraint = {
      id: `temp-${Date.now()}`,
      staffId: '',
      minRestDays: 2,
      period: 'week' as const
    };
    setFormData(prev => ({
      ...prev,
      restDaysWithStaff: [...prev.restDaysWithStaff, newConstraint]
    }));
    setEditingRestDaysWithStaff(prev => ({ ...prev, [newConstraint.id]: true }));
  };

  const updateRestDaysWithStaff = (id: string, updates: Partial<{staffId: string, minRestDays: number, period: 'week' | 'month'}>) => {
    setFormData(prev => ({
      ...prev,
      restDaysWithStaff: prev.restDaysWithStaff.map((constraint: RestDaysWithStaffConstraintUI) => 
        constraint.id === id ? { ...constraint, ...updates } : constraint
      )
    }));
  };

  const saveRestDaysWithStaff = (id: string) => {
    const constraint = formData.restDaysWithStaff.find((c: RestDaysWithStaffConstraintUI) => c.id === id);
    if (!constraint || !constraint.staffId) {
      setRestDaysWithStaffErrors(prev => ({ 
        ...prev, 
        [id]: t('staff.pleaseSelectStaff', 'Please select a staff member before saving.') 
      }));
      return;
    }
    setRestDaysWithStaffErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[id];
      return newErrors;
    });
    setEditingRestDaysWithStaff(prev => ({ ...prev, [id]: false }));
  };

  const cancelRestDaysWithStaffEdit = (id: string) => {
    const wasNewlyCreated = editingRestDaysWithStaff[id] && formData.restDaysWithStaff.find((c: RestDaysWithStaffConstraintUI) => c.id === id);
    if (wasNewlyCreated) {
      removeRestDaysWithStaff(id);
    } else {
      setEditingRestDaysWithStaff(prev => ({ ...prev, [id]: false }));
    }
  };

  const removeRestDaysWithStaff = (id: string) => {
    setFormData(prev => ({
      ...prev,
      restDaysWithStaff: prev.restDaysWithStaff.filter((c: RestDaysWithStaffConstraintUI) => c.id !== id)
    }));
    setEditingRestDaysWithStaff(prev => {
      const newState = { ...prev };
      delete newState[id];
      return newState;
    });
  };

  // Consecutive rest days constraint handlers
  const addConsecutiveRestDays = () => {
    const newConstraint = {
      id: `temp-${Date.now()}`,
      minConsecutiveDays: 2,
      period: 'week' as const
    };
    setFormData(prev => ({
      ...prev,
      consecutiveRestDays: [...prev.consecutiveRestDays, newConstraint]
    }));
    setEditingConsecutiveRestDays(prev => ({ ...prev, [newConstraint.id]: true }));
  };

  const updateConsecutiveRestDays = (id: string, updates: Partial<{minConsecutiveDays: number, period: 'week' | 'month'}>) => {
    setFormData(prev => ({
      ...prev,
      consecutiveRestDays: prev.consecutiveRestDays.map((constraint: ConsecutiveRestDaysConstraintUI) => 
        constraint.id === id ? { ...constraint, ...updates } : constraint
      )
    }));
  };

  const saveConsecutiveRestDays = (id: string) => {
    setEditingConsecutiveRestDays(prev => ({ ...prev, [id]: false }));
  };

  const cancelConsecutiveRestDaysEdit = (id: string) => {
    const wasNewlyCreated = editingConsecutiveRestDays[id] && formData.consecutiveRestDays.find((c: ConsecutiveRestDaysConstraintUI) => c.id === id);
    if (wasNewlyCreated) {
      removeConsecutiveRestDays(id);
    } else {
      setEditingConsecutiveRestDays(prev => ({ ...prev, [id]: false }));
    }
  };

  const removeConsecutiveRestDays = (id: string) => {
    setFormData(prev => ({
      ...prev,
      consecutiveRestDays: prev.consecutiveRestDays.filter((c: ConsecutiveRestDaysConstraintUI) => c.id !== id)
    }));
    setEditingConsecutiveRestDays(prev => {
      const newState = { ...prev };
      delete newState[id];
      return newState;
    });
  };

  const weekdayNames = [
    t('calendar.sunday'),
    t('calendar.monday'), 
    t('calendar.tuesday'),
    t('calendar.wednesday'),
    t('calendar.thursday'),
    t('calendar.friday'),
    t('calendar.saturday')
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clean up temporary IDs from constraints before saving
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cleanedRestDaysWithStaff = formData.restDaysWithStaff.map(({ id: _, ...constraint }: RestDaysWithStaffConstraintUI) => constraint);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cleanedConsecutiveRestDays = formData.consecutiveRestDays.map(({ id: _, ...constraint }: ConsecutiveRestDaysConstraintUI) => constraint);
    
    const staffData: Omit<StaffMember, 'id'> = {
      name: formData.name,
      traitIds: formData.traitIds,
      constraints: {
        maxShiftsPerWeek: formData.maxShiftsPerWeek ? parseInt(formData.maxShiftsPerWeek.toString()) : undefined,
        maxShiftsPerMonth: formData.maxShiftsPerMonth ? parseInt(formData.maxShiftsPerMonth.toString()) : undefined,
        maxShiftsPerYear: formData.maxShiftsPerYear ? parseInt(formData.maxShiftsPerYear.toString()) : undefined,
        incompatibleWith: formData.incompatibleWith,
        restDaysWithStaff: cleanedRestDaysWithStaff,
        consecutiveRestDays: cleanedConsecutiveRestDays,
      },
      blockedTimes: formData.blockedTimes,
    };
    
    onSave(staffData);
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          {t('staff.name')}
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          required
          style={{ padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          {t('staff.traits')}
        </label>
        <TraitAutocomplete
          traits={traits}
          selectedTraits={formData.traitIds.map(traitId => ({ traitId }))}
          onTraitSelect={handleTraitSelect}
          placeholder={t('staff.selectTraits')}
        />
        {formData.traitIds.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
            {formData.traitIds.map((traitId, index) => (
              <span key={index} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', backgroundColor: 'var(--background-color)', borderRadius: '4px', fontSize: '14px', border: '1px solid var(--accent-gray)' }}>
                {getTraitName(traitId)}
                <button type="button" onClick={() => removeTrait(traitId)} className="btn btn-danger btn-xs" style={{ marginLeft: '6px' }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ marginBottom: '10px', color: 'var(--secondary-color)' }}>{t('staff.constraints')}</h4>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', flexWrap: 'wrap' }}>
          <label style={{display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>{t('staff.maxShifts')}</label>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
              {t('staff.maxShiftsPerWeek')}
            </label>
            <input
              type="number"
              min="0"
              value={formData.maxShiftsPerWeek}
              onChange={(e) => setFormData(prev => ({ ...prev, maxShiftsPerWeek: e.target.value }))}
              style={{ width: '100px', padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
              {t('staff.maxShiftsPerMonth')}
            </label>
            <input
              type="number"
              min="0"
              value={formData.maxShiftsPerMonth}
              onChange={(e) => setFormData(prev => ({ ...prev, maxShiftsPerMonth: e.target.value }))}
              style={{ width: '100px', padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
              {t('staff.maxShiftsPerYear')}
            </label>
            <input
              type="number"
              min="0"
              value={formData.maxShiftsPerYear}
              onChange={(e) => setFormData(prev => ({ ...prev, maxShiftsPerYear: e.target.value }))}
              style={{ width: '100px', padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
            />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          {t('staff.incompatibleWith')}
        </label>
        <StaffAutocomplete
          staff={allStaff.filter(s => s.id !== initialStaff?.id)} // Exclude current staff member
          traits={traits}
          selectedStaffIds={formData.incompatibleWith}
          onStaffSelect={handleIncompatibleStaffSelect}
          placeholder={t('staff.selectIncompatibleStaff')}
        />
        {formData.incompatibleWith.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
            {formData.incompatibleWith.map((staffId) => (
              <span key={staffId} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                padding: '6px 10px', 
                backgroundColor: 'var(--background-color)', 
                borderRadius: '4px', 
                fontSize: '14px', 
                border: '1px solid var(--accent-gray)' 
              }}>
                {getStaffName(staffId)}
                <button type="button" onClick={() => removeIncompatibleStaff(staffId)} className="btn btn-danger btn-xs" style={{ marginLeft: '6px' }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Rest Days with Specific Staff Constraints */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, color: 'var(--secondary-color)' }}>{t('staff.restDaysWithStaff', 'Rest Days with Staff')}</h4>
          <button type="button" onClick={addRestDaysWithStaff} className="btn btn-secondary btn-small">
            +{t('common.add', 'Add')}
          </button>
        </div>

        {formData.restDaysWithStaff.map((constraint: RestDaysWithStaffConstraintUI) => (
          <div key={constraint.id} style={{ 
            backgroundColor: editingRestDaysWithStaff[constraint.id] ? 'var(--background-color)' : 'var(--white)', 
            border: '1px solid var(--accent-gray)',
            borderRadius: '8px', 
            padding: '12px', 
            marginBottom: '10px' 
          }}>
            {editingRestDaysWithStaff[constraint.id] ? (
              // Edit mode
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <div style={{ flex: '1', minWidth: '200px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                      {t('staff.staffMember', 'Staff Member')}
                    </label>
                    <select
                      value={constraint.staffId}
                      onChange={(e) => updateRestDaysWithStaff(constraint.id, { staffId: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                    >
                      <option value="">{t('staff.selectStaff', 'Select Staff')}</option>
                      {allStaff.filter(s => s.id !== initialStaff?.id).map((staff) => (
                        <option key={staff.id} value={staff.id}>{staff.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ minWidth: '120px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                      {t('staff.minRestDays', 'Min Rest Days')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={constraint.minRestDays}
                      onChange={(e) => updateRestDaysWithStaff(constraint.id, { minRestDays: parseInt(e.target.value) })}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ minWidth: '100px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                      {t('staff.period', 'Period')}
                    </label>
                    <select
                      value={constraint.period}
                      onChange={(e) => updateRestDaysWithStaff(constraint.id, { period: e.target.value as 'week' | 'month' })}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                    >
                      <option value="week">{t('staff.perWeek', 'Per Week')}</option>
                      <option value="month">{t('staff.perMonth', 'Per Month')}</option>
                    </select>
                  </div>
                </div>
                
                {/* Error message */}
                {restDaysWithStaffErrors[constraint.id] && (
                  <div style={{ 
                    color: 'var(--danger-color, #dc3545)', 
                    fontSize: '14px', 
                    marginTop: '8px', 
                    marginBottom: '8px',
                    padding: '8px',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '4px'
                  }}>
                    {restDaysWithStaffErrors[constraint.id]}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => cancelRestDaysWithStaffEdit(constraint.id)} className="btn btn-secondary btn-small">
                    {t('staff.cancel', 'Cancel')}
                  </button>
                  <button type="button" onClick={() => saveRestDaysWithStaff(constraint.id)} className="btn btn-primary btn-small">
                    {t('staff.save', 'Save')}
                  </button>
                </div>
              </div>
            ) : (
              // Display mode
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--secondary-color)' }}>
                  {getStaffName(constraint.staffId) || t('staff.selectStaff', 'Select Staff')}: {constraint.minRestDays} {t('staff.minRestDays', 'min rest days')} {constraint.period === 'week' ? t('staff.perWeek', 'per week') : t('staff.perMonth', 'per month')}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setEditingRestDaysWithStaff(prev => ({ ...prev, [constraint.id]: true }))} className="btn btn-secondary btn-xs">
                    {t('staff.edit', 'Edit')}
                  </button>
                  <button type="button" onClick={() => removeRestDaysWithStaff(constraint.id)} className="btn btn-danger btn-xs">
                    {t('staff.remove', 'Remove')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Consecutive Rest Days Constraints */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, color: 'var(--secondary-color)' }}>{t('staff.consecutiveRestDays', 'Consecutive Rest Days')}</h4>
          <button type="button" onClick={addConsecutiveRestDays} className="btn btn-secondary btn-small">
            +{t('common.add', 'Add')}
          </button>
        </div>

        {formData.consecutiveRestDays.map((constraint: ConsecutiveRestDaysConstraintUI) => (
          <div key={constraint.id} style={{ 
            backgroundColor: editingConsecutiveRestDays[constraint.id] ? 'var(--background-color)' : 'var(--white)', 
            border: '1px solid var(--accent-gray)',
            borderRadius: '8px', 
            padding: '12px', 
            marginBottom: '10px' 
          }}>
            {editingConsecutiveRestDays[constraint.id] ? (
              // Edit mode
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <div style={{ minWidth: '150px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                      {t('staff.minConsecutiveDays', 'Min Consecutive Days')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={constraint.minConsecutiveDays}
                      onChange={(e) => updateConsecutiveRestDays(constraint.id, { minConsecutiveDays: parseInt(e.target.value) })}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ minWidth: '100px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                      {t('staff.period', 'Period')}
                    </label>
                    <select
                      value={constraint.period}
                      onChange={(e) => updateConsecutiveRestDays(constraint.id, { period: e.target.value as 'week' | 'month' })}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                    >
                      <option value="week">{t('staff.perWeek', 'Per Week')}</option>
                      <option value="month">{t('staff.perMonth', 'Per Month')}</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => cancelConsecutiveRestDaysEdit(constraint.id)} className="btn btn-secondary btn-small">
                    {t('staff.cancel', 'Cancel')}
                  </button>
                  <button type="button" onClick={() => saveConsecutiveRestDays(constraint.id)} className="btn btn-primary btn-small">
                    {t('staff.save', 'Save')}
                  </button>
                </div>
              </div>
            ) : (
              // Display mode
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--secondary-color)' }}>
                  {constraint.minConsecutiveDays} {t('staff.consecutiveDaysLabel', 'consecutive rest days')} {constraint.period === 'week' ? t('staff.perWeek', 'per week') : t('staff.perMonth', 'per month')}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setEditingConsecutiveRestDays(prev => ({ ...prev, [constraint.id]: true }))} className="btn btn-secondary btn-xs">
                    {t('staff.edit', 'Edit')}
                  </button>
                  <button type="button" onClick={() => removeConsecutiveRestDays(constraint.id)} className="btn btn-danger btn-xs">
                    {t('staff.remove', 'Remove')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, color: 'var(--secondary-color)' }}>{t('staff.blockedTimes')}</h4>
          <button type="button" onClick={addNewBlockedTime} className="btn btn-secondary btn-small">
            +{t('common.add')}
          </button>
        </div>

        {formData.blockedTimes.map((blockedTime) => (
          <div key={blockedTime.id} style={{ 
            backgroundColor: editingBlockedTimes[blockedTime.id] ? 'var(--background-color)' : 'var(--white)', 
            border: `1px solid var(--accent-gray)`,
            borderRadius: '8px', 
            padding: '12px', 
            marginBottom: '10px' 
          }}>
            {editingBlockedTimes[blockedTime.id] ? (
              // Edit mode
              <div>
                
                <div style={{ flex: 1, display: 'flex', flexDirection: 'row', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      {blockedTime.isFullDay ? t('staff.startDate') : t('shifts.startDateTime')}
                    </label>
                    <input
                      type={blockedTime.isFullDay ? "date" : "datetime-local"}
                      value={blockedTime.isFullDay ? toLocalDateInputValue(blockedTime.startDateTime) : toLocalDateTimeInputValue(blockedTime.startDateTime)}
                      onChange={(e) => updateBlockedTime(blockedTime.id, { 
                        startDateTime: blockedTime.isFullDay ? new Date(`${e.target.value}00:00`) : new Date(e.target.value) 
                      })}
                      style={{ padding: '6px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      {blockedTime.isFullDay ? t('staff.endDate') : t('shifts.endDateTime')}
                    </label>
                    <input
                      type={blockedTime.isFullDay ? "date" : "datetime-local"}
                      value={blockedTime.isFullDay ? toLocalDateInputValue(blockedTime.endDateTime) : toLocalDateTimeInputValue(blockedTime.endDateTime)}
                      onChange={(e) => updateBlockedTime(blockedTime.id, { 
                        endDateTime: blockedTime.isFullDay ? new Date(`${e.target.value}T23:59`) : new Date(e.target.value) 
                      })}
                      min={blockedTime.isFullDay ? toLocalDateInputValue(blockedTime.startDateTime) : toLocalDateTimeInputValue(blockedTime.startDateTime)}
                      style={{ padding: '6px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                    />
                  </div>
                </div>
                
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input
                      type="checkbox"
                      checked={blockedTime.isFullDay}
                      onChange={(e) => toggleFullDay(blockedTime.id, e.target.checked)}
                    />
                    <span>{t('staff.fullDay')}</span>
                  </label>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input
                      type="checkbox"
                      checked={!!blockedTime.recurrence}
                      onChange={(e) => updateBlockedTime(blockedTime.id, { 
                        recurrence: e.target.checked ? { type: 'weekly', interval: 1 } : undefined 
                      })}
                    />
                    <span>{t('shifts.recurring')}</span>
                  </label>
                </div>

                {blockedTime.recurrence && (
                <>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'row', gap: '10px', marginBottom: '10px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <label style={{ display: 'block', marginBottom: '3px', fontSize: '12px', fontWeight: 'bold' }}>
                          {t('shifts.recurring')}
                        </label>
                        <select
                          value={blockedTime.recurrence.type}
                          onChange={(e) => updateBlockedTime(blockedTime.id, { 
                            recurrence: { ...blockedTime.recurrence!, type: e.target.value as 'daily' | 'weekly' | 'monthly' }
                          })}
                          style={{ width: '100%', padding: '6px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                        >
                          <option value="daily">{t('shifts.daily')}</option>
                          <option value="weekly">{t('shifts.weekly')}</option>
                          <option value="monthly">{t('shifts.monthly')}</option>
                        </select>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <label style={{ display: 'block', marginBottom: '3px', fontSize: '12px', fontWeight: 'bold' }}>
                          {t('staff.interval')}
                        </label>
                        <input
                          type="number"
                          min="1"
                          placeholder="1"
                          value={blockedTime.recurrence.interval}
                          onChange={(e) => updateBlockedTime(blockedTime.id, { 
                            recurrence: { ...blockedTime.recurrence!, interval: parseInt(e.target.value) || 1 }
                          })}
                          style={{ padding: '6px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <label style={{ display: 'block', marginBottom: '3px', fontSize: '12px', color: 'var(--secondary-color)', opacity: 0.7 }}>
                          {t('shifts.endDate')} ({t('common.optional')})
                        </label>
                        <input
                          type="date"
                          value={toLocalDateInputValue(blockedTime.recurrence.endDate ?? '')}
                          onChange={(e) => updateBlockedTime(blockedTime.id, { 
                            recurrence: { ...blockedTime.recurrence!, endDate: new Date(e.target.value) }
                          })}
                          style={{ padding: '6px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
                        />
                      </div>
                    </div>
                    
                    {blockedTime.recurrence.type === 'weekly' && (
                      <div style={{ marginTop: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '3px', fontSize: '12px', fontWeight: 'bold' }}>
                          {t('shifts.selectWeekdays')}
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {weekdayNames.map((dayName, index) => (
                            <label key={index} style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '2px',
                              padding: '4px 8px',
                              border: `1px solid var(--accent-gray)`,
                              borderRadius: '4px',
                              backgroundColor: (blockedTime.recurrence?.weekdays || []).includes(index) ? 'var(--primary-color)' : 'var(--white)',
                              color: (blockedTime.recurrence?.weekdays || []).includes(index) ? 'white' : 'var(--text-color)',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}>
                              <input
                                type="checkbox"
                                checked={(blockedTime.recurrence?.weekdays || []).includes(index)}
                                onChange={() => toggleBlockedTimeWeekday(blockedTime.id, index)}
                                style={{ display: 'none' }}
                              />
                              {dayName}
                            </label>
                          ))}
                        </div>
                        {(!blockedTime.recurrence.weekdays || blockedTime.recurrence.weekdays.length === 0) && (
                          <p style={{ fontSize: '10px', color: 'var(--secondary-color)', marginTop: '3px' }}>
                            {t('shifts.selectWeekdaysHint')}
                          </p>
                        )}
                      </div>
                    )}
                </>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => cancelBlockedTimeEdit(blockedTime.id)} className="btn btn-secondary btn-small">
                    {t('staff.cancel')}
                  </button>
                  <button type="button" onClick={() => saveBlockedTime(blockedTime.id)} className="btn btn-primary btn-small">
                    {t('staff.save')}
                  </button>
                </div>
              </div>
            ) : (
              // Display mode
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--secondary-color)' }}>
                  {(() => {
                    const startDate = new Date(blockedTime.startDateTime);
                    const endDate = new Date(blockedTime.endDateTime);
                    const startDateStr = startDate.toLocaleDateString(i18n.language);
                    const endDateStr = endDate.toLocaleDateString(i18n.language);
                    const isSameDay = startDateStr === endDateStr;
                    
                    if (blockedTime.isFullDay) {
                      return isSameDay 
                        ? `${startDateStr} (${t('staff.fullDay')})` 
                        : `${startDateStr} - ${endDateStr} (${t('staff.fullDay')})`;
                    } else {
                      const startTimeStr = startDate.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
                      const endTimeStr = endDate.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
                      
                      return isSameDay 
                        ? `${startDateStr} ${startTimeStr} - ${endTimeStr}`
                        : `${startDateStr} ${startTimeStr} - ${endDateStr} ${endTimeStr}`;
                    }
                  })()}
                  {blockedTime.recurrence && ` (${blockedTime.recurrence.type})`}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setEditingBlockedTimes(prev => ({ ...prev, [blockedTime.id]: true }))} className="btn btn-secondary btn-xs">
                    {t('staff.edit')}
                  </button>
                  <button type="button" onClick={() => removeBlockedTime(blockedTime.id)} className="btn btn-danger btn-xs">
                    {t('staff.remove')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          {t('staff.cancel')}
        </button>
        <button type="submit" className="btn btn-primary">
          {initialStaff ? t('staff.updateStaff') : t('staff.createStaff')}
        </button>
      </div>
    </form>
  );
}