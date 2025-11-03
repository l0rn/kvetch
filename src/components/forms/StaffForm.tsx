import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffMember, Trait } from '../../storage/database';
import type { StaffConstraints } from '../../utils/constraints';
import { Database } from '../../storage/database';
import { TraitAutocomplete } from '../TraitAutocomplete';
import { StaffAutocomplete } from '../StaffAutocomplete';
import { toLocalDateInputValue, toLocalDateTimeInputValue } from '../../utils/datetime';
import '../../styles/forms.css';

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
    <form onSubmit={handleSubmit} className="form-container">
      <div className="form-group">
        <label className="form-label">{t('staff.name')}</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          required
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label className="form-label">{t('staff.traits')}</label>
        <TraitAutocomplete
          traits={traits}
          selectedTraits={formData.traitIds.map(traitId => ({ traitId }))}
          onTraitSelect={handleTraitSelect}
          placeholder={t('staff.selectTraits')}
        />
        {formData.traitIds.length > 0 && (
          <div className="tags-container">
            {formData.traitIds.map((traitId, index) => (
              <span key={index} className="tag-item">
                {getTraitName(traitId)}
                <button type="button" onClick={() => removeTrait(traitId)} className="btn btn-danger btn-xs">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="form-group">
        <h4 className="form-section-title">{t('staff.constraints')}</h4>
        <div className="form-subsection">
          <label className="subsection-label">{t('staff.maxShifts')}</label>
          <div className="max-shifts-grid">
            <div className="form-col">
              <label className="sub-label">{t('staff.maxShiftsPerWeek')}</label>
              <input
                type="number"
                min="0"
                value={formData.maxShiftsPerWeek}
                onChange={(e) => setFormData(prev => ({ ...prev, maxShiftsPerWeek: e.target.value }))}
                className="form-input"
              />
            </div>
            <div className="form-col">
              <label className="sub-label">{t('staff.maxShiftsPerMonth')}</label>
              <input
                type="number"
                min="0"
                value={formData.maxShiftsPerMonth}
                onChange={(e) => setFormData(prev => ({ ...prev, maxShiftsPerMonth: e.target.value }))}
                className="form-input"
              />
            </div>
            <div className="form-col">
              <label className="sub-label">{t('staff.maxShiftsPerYear')}</label>
              <input
                type="number"
                min="0"
                value={formData.maxShiftsPerYear}
                onChange={(e) => setFormData(prev => ({ ...prev, maxShiftsPerYear: e.target.value }))}
                className="form-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t('staff.incompatibleWith')}</label>
        <StaffAutocomplete
          staff={allStaff.filter(s => s.id !== initialStaff?.id)} // Exclude current staff member
          traits={traits}
          selectedStaffIds={formData.incompatibleWith}
          onStaffSelect={handleIncompatibleStaffSelect}
          placeholder={t('staff.selectIncompatibleStaff')}
        />
        {formData.incompatibleWith.length > 0 && (
          <div className="tags-container">
            {formData.incompatibleWith.map((staffId) => (
              <span key={staffId} className="tag-item">
                {getStaffName(staffId)}
                <button type="button" onClick={() => removeIncompatibleStaff(staffId)} className="btn btn-danger btn-xs">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Rest Days with Specific Staff Constraints */}
      <div className="form-group">
        <div className="constraint-header">
          <h4>{t('staff.restDaysWithStaff', 'Rest Days with Staff')}</h4>
          <button type="button" onClick={addRestDaysWithStaff} className="btn btn-secondary btn-small">
            +{t('common.add', 'Add')}
          </button>
        </div>

        {formData.restDaysWithStaff.map((constraint: RestDaysWithStaffConstraintUI) => (
          <div key={constraint.id} className={`constraint-block ${editingRestDaysWithStaff[constraint.id] ? 'editing' : ''}`}>
            {editingRestDaysWithStaff[constraint.id] ? (
              // Edit mode
              <div>
                <div className="constraint-edit-grid">
                  <div className="form-col">
                    <label className="sub-label">{t('staff.staffMember', 'Staff Member')}</label>
                    <select
                      value={constraint.staffId}
                      onChange={(e) => updateRestDaysWithStaff(constraint.id, { staffId: e.target.value })}
                      className="form-select"
                    >
                      <option value="">{t('staff.selectStaff', 'Select Staff')}</option>
                      {allStaff.filter(s => s.id !== initialStaff?.id).map((staff) => (
                        <option key={staff.id} value={staff.id}>{staff.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-col">
                    <label className="sub-label">{t('staff.minRestDays', 'Min Rest Days')}</label>
                    <input
                      type="number"
                      min="1"
                      value={constraint.minRestDays}
                      onChange={(e) => updateRestDaysWithStaff(constraint.id, { minRestDays: parseInt(e.target.value) })}
                      className="form-input"
                    />
                  </div>
                  <div className="form-col">
                    <label className="sub-label">{t('staff.period', 'Period')}</label>
                    <select
                      value={constraint.period}
                      onChange={(e) => updateRestDaysWithStaff(constraint.id, { period: e.target.value as 'week' | 'month' })}
                      className="form-select"
                    >
                      <option value="week">{t('staff.perWeek', 'Per Week')}</option>
                      <option value="month">{t('staff.perMonth', 'Per Month')}</option>
                    </select>
                  </div>
                </div>
                
                {restDaysWithStaffErrors[constraint.id] && (
                  <div className="validation-error" style={{ marginTop: '8px' }}>
                    {restDaysWithStaffErrors[constraint.id]}
                  </div>
                )}
                
                <div className="constraint-actions">
                  <button type="button" onClick={() => cancelRestDaysWithStaffEdit(constraint.id)} className="btn btn-secondary btn-xs">
                    {t('staff.cancel', 'Cancel')}
                  </button>
                  <button type="button" onClick={() => saveRestDaysWithStaff(constraint.id)} className="btn btn-primary btn-xs">
                    {t('staff.save', 'Save')}
                  </button>
                </div>
              </div>
            ) : (
              // Display mode
              <div className="constraint-display">
                <span>
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
      <div className="form-group">
        <div className="constraint-header">
          <h4>{t('staff.consecutiveRestDays', 'Consecutive Rest Days')}</h4>
          <button type="button" onClick={addConsecutiveRestDays} className="btn btn-secondary btn-small">
            +{t('common.add', 'Add')}
          </button>
        </div>

        {formData.consecutiveRestDays.map((constraint: ConsecutiveRestDaysConstraintUI) => (
          <div key={constraint.id} className={`constraint-block ${editingConsecutiveRestDays[constraint.id] ? 'editing' : ''}`}>
            {editingConsecutiveRestDays[constraint.id] ? (
              // Edit mode
              <div>
                <div className="constraint-edit-grid">
                  <div className="form-col">
                    <label className="sub-label">{t('staff.minConsecutiveDays', 'Min Consecutive Days')}</label>
                    <input
                      type="number"
                      min="1"
                      value={constraint.minConsecutiveDays}
                      onChange={(e) => updateConsecutiveRestDays(constraint.id, { minConsecutiveDays: parseInt(e.target.value) })}
                      className="form-input"
                    />
                  </div>
                  <div className="form-col">
                    <label className="sub-label">{t('staff.period', 'Period')}</label>
                    <select
                      value={constraint.period}
                      onChange={(e) => updateConsecutiveRestDays(constraint.id, { period: e.target.value as 'week' | 'month' })}
                      className="form-select"
                    >
                      <option value="week">{t('staff.perWeek', 'Per Week')}</option>
                      <option value="month">{t('staff.perMonth', 'Per Month')}</option>
                    </select>
                  </div>
                </div>
                <div className="constraint-actions">
                  <button type="button" onClick={() => cancelConsecutiveRestDaysEdit(constraint.id)} className="btn btn-secondary btn-xs">
                    {t('staff.cancel', 'Cancel')}
                  </button>
                  <button type="button" onClick={() => saveConsecutiveRestDays(constraint.id)} className="btn btn-primary btn-xs">
                    {t('staff.save', 'Save')}
                  </button>
                </div>
              </div>
            ) : (
              // Display mode
              <div className="constraint-display">
                <span>
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

      <div className="form-group">
        <div className="constraint-header">
          <h4>{t('staff.blockedTimes')}</h4>
          <button type="button" onClick={addNewBlockedTime} className="btn btn-secondary btn-small">
            +{t('common.add')}
          </button>
        </div>

        {formData.blockedTimes.map((blockedTime) => (
          <div key={blockedTime.id} className={`constraint-block ${editingBlockedTimes[blockedTime.id] ? 'editing' : ''}`}>
            {editingBlockedTimes[blockedTime.id] ? (
              // Edit mode
              <div>
                <div className="form-row">
                  <div className="form-col">
                    <label className="form-label">
                      {blockedTime.isFullDay ? t('staff.startDate') : t('shifts.startDateTime')}
                    </label>
                    <input
                      type={blockedTime.isFullDay ? "date" : "datetime-local"}
                      value={blockedTime.isFullDay ? toLocalDateInputValue(blockedTime.startDateTime) : toLocalDateTimeInputValue(blockedTime.startDateTime)}
                      onChange={(e) => updateBlockedTime(blockedTime.id, { 
                        startDateTime: blockedTime.isFullDay ? new Date(`${e.target.value}00:00`) : new Date(e.target.value) 
                      })}
                      className="form-input"
                    />
                  </div>
                  <div className="form-col">
                    <label className="form-label">
                      {blockedTime.isFullDay ? t('staff.endDate') : t('shifts.endDateTime')}
                    </label>
                    <input
                      type={blockedTime.isFullDay ? "date" : "datetime-local"}
                      value={blockedTime.isFullDay ? toLocalDateInputValue(blockedTime.endDateTime) : toLocalDateTimeInputValue(blockedTime.endDateTime)}
                      onChange={(e) => updateBlockedTime(blockedTime.id, { 
                        endDateTime: blockedTime.isFullDay ? new Date(`${e.target.value}T23:59`) : new Date(e.target.value) 
                      })}
                      min={blockedTime.isFullDay ? toLocalDateInputValue(blockedTime.startDateTime) : toLocalDateTimeInputValue(blockedTime.startDateTime)}
                      className="form-input"
                    />
                  </div>
                </div>
                
                <div className="form-group" style={{marginTop: '10px'}}>
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={blockedTime.isFullDay}
                      onChange={(e) => toggleFullDay(blockedTime.id, e.target.checked)}
                    />
                    <span>{t('staff.fullDay')}</span>
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-checkbox-label">
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
                <div className="recurrence-section" style={{padding: '10px'}}>
                  <div className="form-row">
                      <div className="form-col">
                        <label className="sub-label">{t('shifts.recurring')}</label>
                        <select
                          value={blockedTime.recurrence.type}
                          onChange={(e) => updateBlockedTime(blockedTime.id, { 
                            recurrence: { ...blockedTime.recurrence!, type: e.target.value as 'daily' | 'weekly' | 'monthly' }
                          })}
                          className="form-select"
                        >
                          <option value="daily">{t('shifts.daily')}</option>
                          <option value="weekly">{t('shifts.weekly')}</option>
                          <option value="monthly">{t('shifts.monthly')}</option>
                        </select>
                      </div>
                      <div className="form-col">
                        <label className="sub-label">{t('staff.interval')}</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="1"
                          value={blockedTime.recurrence.interval}
                          onChange={(e) => updateBlockedTime(blockedTime.id, { 
                            recurrence: { ...blockedTime.recurrence!, interval: parseInt(e.target.value) || 1 }
                          })}
                          className="form-input"
                        />
                      </div>
                      <div className="form-col">
                        <label className="sub-label" style={{opacity: 0.7}}>
                          {t('shifts.endDate')} ({t('common.optional')})
                        </label>
                        <input
                          type="date"
                          value={toLocalDateInputValue(blockedTime.recurrence.endDate ?? '')}
                          onChange={(e) => updateBlockedTime(blockedTime.id, { 
                            recurrence: { ...blockedTime.recurrence!, endDate: new Date(e.target.value) }
                          })}
                          className="form-input"
                        />
                      </div>
                    </div>
                    
                    {blockedTime.recurrence.type === 'weekly' && (
                      <div style={{ marginTop: '10px' }}>
                        <label className="sub-label">{t('shifts.selectWeekdays')}</label>
                        <div className="weekday-selector" style={{gap: '4px'}}>
                          {weekdayNames.map((dayName, index) => (
                            <label key={index} className={`weekday-label ${ (blockedTime.recurrence?.weekdays || []).includes(index) ? 'selected' : ''}`}
                              style={{padding: '4px 8px', fontSize: '12px'}}
                            >
                              <input
                                type="checkbox"
                                checked={(blockedTime.recurrence?.weekdays || []).includes(index)}
                                onChange={() => toggleBlockedTimeWeekday(blockedTime.id, index)}
                                className="weekday-checkbox"
                              />
                              {dayName}
                            </label>
                          ))}
                        </div>
                        {(!blockedTime.recurrence.weekdays || blockedTime.recurrence.weekdays.length === 0) && (
                          <p className="weekday-hint" style={{fontSize: '10px', marginTop: '3px'}}>
                            {t('shifts.selectWeekdaysHint')}
                          </p>
                        )}
                      </div>
                    )}
                </div>
                )}

                <div className="form-actions" style={{marginTop: '10px'}}>
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
              <div className="constraint-display">
                <span>
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

      <div className="form-actions">
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