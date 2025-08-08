import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Shift, Trait } from '../../storage/database-pouchdb';
import { Database } from '../../storage/database-pouchdb';
import { TraitAutocomplete } from '../TraitAutocomplete';
import { ConfirmDialog } from '../ConfirmDialog';
import { toLocalDateTimeInputValue } from '../../utils/datetime';

interface ShiftFormProps {
  initialShift?: Shift | null;
  onSave: (shift: Partial<Shift>, isDestructive?: boolean) => void;
  onCancel: () => void;
}

export function ShiftForm({ initialShift, onSave, onCancel }: ShiftFormProps) {
  const { t } = useTranslation();
  const [traits, setTraits] = useState<Trait[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingShiftData, setPendingShiftData] = useState<Partial<Shift> | null>(null);
  const [formData, setFormData] = useState({
    name: initialShift?.name || '',
    startDateTime: initialShift?.startDateTime
    ? toLocalDateTimeInputValue(initialShift?.startDateTime)
    : (() => {
      const now = new Date();
      now.setSeconds(0, 0); // Clear seconds and milliseconds
      return toLocalDateTimeInputValue(now);
    })(),
    endDateTime: initialShift?.endDateTime
      ? toLocalDateTimeInputValue(initialShift?.endDateTime)
      : (() => {
        const end = new Date();
        end.setSeconds(0, 0); // Clear seconds and milliseconds
        end.setHours(end.getHours() + 8);
        return toLocalDateTimeInputValue(end);
      })(),
    staffCount: initialShift?.requirements.staffCount || 1,
    hasRecurrence: !!initialShift?.recurrence,
    recurrenceType: initialShift?.recurrence?.type || 'weekly',
    recurrenceInterval: initialShift?.recurrence?.interval || 1,
    recurrenceEndDate: initialShift?.recurrence?.endDate || '',
    recurrenceWeekdays: initialShift?.recurrence?.weekdays || [],
    requiredTraits: initialShift?.requirements.requiredTraits || [],
  });

  useEffect(() => {
    const loadTraits = async () => {
      const allTraits = await Database.getTraits();
      setTraits(allTraits);
    };
    loadTraits();
  }, []);

  // Function to detect if changes are destructive (affect timing, recurrence, or traits)
  const isDestructiveChange = (newShiftData: Partial<Shift>): boolean => {
    if (!initialShift) return false; // New shift, not destructive

    // Check timing changes
    if (initialShift.startDateTime.getTime() !== newShiftData.startDateTime?.getTime() ||
        initialShift.endDateTime.getTime() !== newShiftData.endDateTime?.getTime()) {
      return true;
    }

    // Check recurrence changes
    const oldRecurrence = initialShift.recurrence;
    const newRecurrence = newShiftData.recurrence;
    
    if ((!oldRecurrence && newRecurrence) || (oldRecurrence && !newRecurrence)) {
      return true; // Recurrence added or removed
    }
    
    if (oldRecurrence && newRecurrence) {
      if (oldRecurrence.type !== newRecurrence.type ||
          oldRecurrence.interval !== newRecurrence.interval ||
          oldRecurrence.endDate !== newRecurrence.endDate ||
          JSON.stringify(oldRecurrence.weekdays || []) !== JSON.stringify(newRecurrence.weekdays || [])) {
        return true;
      }
    }

    // Check trait requirement changes
    const oldTraits = initialShift.requirements.requiredTraits || [];
    const newTraits = newShiftData.requirements?.requiredTraits ?? [];
    
    if (oldTraits.length !== newTraits.length) return true;
    
    // Check if traits or their min counts changed
    for (let i = 0; i < oldTraits.length; i++) {
      const oldTrait = oldTraits[i];
      const newTrait = newTraits.find(t => t.traitId === oldTrait.traitId);
      
      if (!newTrait || newTrait.minCount !== oldTrait.minCount) {
        return true;
      }
    }

    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that end time is after start time
    if (new Date(formData.endDateTime) <= new Date(formData.startDateTime)) {
      alert(t('validation.endAfterStart'));
      return;
    }
    const shiftData: Partial<Shift> = {
      id: initialShift?.id,
      name: formData.name,
      startDateTime: new Date(formData.startDateTime),
      endDateTime: new Date(formData.endDateTime),
      requirements: {
        staffCount: formData.staffCount,
        requiredTraits: formData.requiredTraits.length > 0 ? formData.requiredTraits : undefined,
      },
      recurrence: formData.hasRecurrence ? {
        type: formData.recurrenceType as 'daily' | 'weekly' | 'monthly',
        interval: formData.recurrenceInterval,
        endDate: formData.recurrenceEndDate || undefined,
        weekdays: formData.recurrenceType === 'weekly' && formData.recurrenceWeekdays.length > 0 ? formData.recurrenceWeekdays : undefined,
      } : undefined,
    };
    
    // Check if this is a destructive change
    if (isDestructiveChange(shiftData)) {
      setPendingShiftData(shiftData);
      setShowConfirmDialog(true);
    } else {
      onSave(shiftData, false);
    }
  };

  const handleConfirmDestructive = () => {
    if (pendingShiftData) {
      onSave(pendingShiftData, true);
      setShowConfirmDialog(false);
      setPendingShiftData(null);
    }
  };

  const handleCancelDestructive = () => {
    setShowConfirmDialog(false);
    setPendingShiftData(null);
  };

  const handleTraitSelect = async (trait: Trait, minCount: number = 1) => {
    let traitToUse = trait;
    
    // If trait doesn't have an ID, create it
    if (!trait.id) {
      traitToUse = await Database.createOrFindTrait(trait.name);
    }

    setFormData(prev => ({
      ...prev,
      requiredTraits: [...prev.requiredTraits, { traitId: traitToUse.id, minCount }]
    }));

    // Always refresh traits list after selection (in case a new trait was created)
    const allTraits = await Database.getTraits();
    setTraits(allTraits);
  };

  const removeRequiredTrait = (index: number) => {
    setFormData(prev => ({
      ...prev,
      requiredTraits: prev.requiredTraits.filter((_, i) => i !== index)
    }));
  };

  const getTraitName = (traitId: string): string => {
    const trait = traits.find(trait => trait.id === traitId);
    return trait ? trait.name : t('staff.unknownTrait');
  };

  const toggleWeekday = (weekday: number) => {
    setFormData(prev => ({
      ...prev,
      recurrenceWeekdays: prev.recurrenceWeekdays.includes(weekday)
        ? prev.recurrenceWeekdays.filter(d => d !== weekday)
        : [...prev.recurrenceWeekdays, weekday].sort((a, b) => a - b)
    }));
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

  return (
    <>
      <form onSubmit={handleSubmit} style={{ maxWidth: '600px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          {t('shifts.shiftName')} *
        </label>
        <input
          type="text"
          value={formData.name}
          required
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          style={{ padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', marginBottom: '15px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            {t('shifts.startDateTime')} *
          </label>
          <input
            type="datetime-local"
            value={formData.startDateTime}
            onChange={(e) => setFormData(prev => ({ ...prev, startDateTime: e.target.value }))}
            required
            style={{ padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            {t('shifts.endDateTime')} *
          </label>
          <input
            type="datetime-local"
            value={formData.endDateTime}
            onChange={(e) => setFormData(prev => ({ ...prev, endDateTime: e.target.value }))}
            min={formData.startDateTime}
            required
            style={{ padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
          />
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          {t('shifts.staffCount')} *
        </label>
        <input
          type="number"
          min="1"
          value={formData.staffCount}
          onChange={(e) => setFormData(prev => ({ ...prev, staffCount: parseInt(e.target.value) }))}
          required
          style={{ width: '150px', padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          {t('shifts.requiredTraits')}
        </label>
        <TraitAutocomplete
          traits={traits}
          selectedTraits={formData.requiredTraits}
          onTraitSelect={handleTraitSelect}
          placeholder={t('shifts.searchCreateTrait')}
          allowMinCount={true}
        />
        {formData.requiredTraits.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            {formData.requiredTraits.map((requiredTrait, index) => (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: 'var(--background-color)', marginBottom: '5px', borderRadius: '4px', border: '1px solid var(--accent-gray)' }}>
                <span>{getTraitName(requiredTrait.traitId)} ({t('shifts.minimum')} {requiredTrait.minCount})</span>
                <button type="button" onClick={() => removeRequiredTrait(index)} className="btn btn-danger btn-xs">
                  {t('shifts.remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="checkbox"
            checked={formData.hasRecurrence}
            onChange={(e) => setFormData(prev => ({ ...prev, hasRecurrence: e.target.checked }))}
          />
          <span style={{ fontWeight: 'bold' }}>{t('shifts.recurring')}</span>
        </label>
      </div>

      {formData.hasRecurrence && (
        <div style={{ backgroundColor: 'var(--background-color)', padding: '15px', borderRadius: '4px', marginBottom: '15px' }}>

          <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                {t('shifts.repeat')}
              </label>
              <select
                value={formData.recurrenceType}
                onChange={(e) => setFormData(prev => ({ ...prev, recurrenceType: e.target.value as 'daily' | 'weekly' | 'monthly' }))}
                style={{ padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
              >
                <option value="daily">{t('shifts.daily')}</option>
                <option value="weekly">{t('shifts.weekly')}</option>
                <option value="monthly">{t('shifts.monthly')}</option>
              </select>
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                {t('shifts.every')} X {formData.recurrenceType === 'daily' ? t('shifts.days') : formData.recurrenceType === 'weekly' ? t('shifts.weeks') : t('shifts.months')}
              </label>
              <input
                type="number"
                min="1"
                placeholder={`${t('shifts.every')} X ${formData.recurrenceType === 'daily' ? t('shifts.days').toLowerCase() : formData.recurrenceType === 'weekly' ? t('shifts.weeks').toLowerCase() : t('shifts.months').toLowerCase()}`}
                value={formData.recurrenceInterval}
                onChange={(e) => setFormData(prev => ({ ...prev, recurrenceInterval: parseInt(e.target.value) }))}
                style={{ padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
              />
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                {t('shifts.endDate')} ({t('common.optional')})
              </label>
              <input
                type="date"
                value={formData.recurrenceEndDate}
                onChange={(e) => setFormData(prev => ({ ...prev, recurrenceEndDate: e.target.value }))}
                style={{ padding: '8px', border: '1px solid var(--accent-gray)', borderRadius: '4px' }}
              />
            </div>
          </div>
          
          {formData.recurrenceType === 'weekly' && (
            <div style={{ marginTop: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                {t('shifts.selectWeekdays')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {weekdayNames.map((dayName, index) => (
                  <label key={index} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    padding: '6px 10px',
                    border: `1px solid var(--accent-gray)`,
                    borderRadius: '4px',
                    backgroundColor: formData.recurrenceWeekdays.includes(index) ? 'var(--primary-color)' : 'var(--white)',
                    color: formData.recurrenceWeekdays.includes(index) ? 'white' : 'var(--text-color)',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.recurrenceWeekdays.includes(index)}
                      onChange={() => toggleWeekday(index)}
                      style={{ display: 'none' }}
                    />
                    {dayName}
                  </label>
                ))}
              </div>
              {formData.recurrenceWeekdays.length === 0 && (
                <p style={{ fontSize: '12px', color: 'var(--secondary-color)', marginTop: '5px' }}>
                  {t('shifts.selectWeekdaysHint')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          {t('shifts.cancel')}
        </button>
        <button type="submit" className="btn btn-primary">
          {initialShift ? t('shifts.updateShift') : t('shifts.createShift')}
        </button>
      </div>
    </form>

    <ConfirmDialog
      isOpen={showConfirmDialog}
      title={t('shifts.confirmDestructiveChanges')}
      message={t('shifts.destructiveChangesWarning')}
      question={t('shifts.destructiveChangesQuestion')}
      confirmText={t('shifts.continueAndRecreate')}
      cancelText={t('shifts.keepOriginal')}
      onConfirm={handleConfirmDestructive}
      onCancel={handleCancelDestructive}
    />
    </>
  );
}