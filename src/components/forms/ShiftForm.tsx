import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Shift, Trait } from "../../storage/database";
import { Database } from "../../storage/database";
import { TraitAutocomplete } from '../TraitAutocomplete';
import { ConfirmDialog } from '../ConfirmDialog';
import { toLocalDateTimeInputValue } from '../../utils/datetime';
import '../../styles/forms.css';

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
  const [validationError, setValidationError] = useState<string>('');
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
    excludedTraits: initialShift?.requirements.excludedTraits || [],
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

    // Check excluded traits changes
    const oldExcluded = initialShift.requirements.excludedTraits || [];
    const newExcluded = newShiftData.requirements?.excludedTraits || [];

    if (oldExcluded.length !== newExcluded.length ||
        JSON.stringify(oldExcluded.sort()) !== JSON.stringify(newExcluded.sort())) {
      return true;
    }

    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous validation errors
    setValidationError('');
    
    // Validate that end time is after start time
    if (new Date(formData.endDateTime) <= new Date(formData.startDateTime)) {
      setValidationError(t('validation.endAfterStart'));
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
        excludedTraits: formData.excludedTraits.length > 0 ? formData.excludedTraits : undefined,
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

  const handleExcludedTraitSelect = async (trait: Trait) => {
    let traitToUse = trait;

    // If trait doesn't have an ID, create it
    if (!trait.id) {
      traitToUse = await Database.createOrFindTrait(trait.name);
    }

    setFormData(prev => ({
      ...prev,
      excludedTraits: [...prev.excludedTraits, traitToUse.id]
    }));

    // Always refresh traits list after selection (in case a new trait was created)
    const allTraits = await Database.getTraits();
    setTraits(allTraits);
  };

  const removeExcludedTrait = (index: number) => {
    setFormData(prev => ({
      ...prev,
      excludedTraits: prev.excludedTraits.filter((_, i) => i !== index)
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
      <form onSubmit={handleSubmit} className="form-container">
      
      <div className="form-group">
        <label className="form-label">
          {t('shifts.shiftName')} *
        </label>
        <input
          type="text"
          value={formData.name}
          required
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          className="form-input"
        />
      </div>

      <div className="form-row">
        <div className="form-col">
          <label className="form-label">
            {t('shifts.startDateTime')} *
          </label>
          <input
            type="datetime-local"
            value={formData.startDateTime}
            onChange={(e) => setFormData(prev => ({ ...prev, startDateTime: e.target.value }))}
            required
            className="form-input"
          />
        </div>
        <div className="form-col">
          <label className="form-label">
            {t('shifts.endDateTime')} *
          </label>
          <input
            type="datetime-local"
            value={formData.endDateTime}
            onChange={(e) => setFormData(prev => ({ ...prev, endDateTime: e.target.value }))}
            min={formData.startDateTime}
            required
            className="form-input"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">
          {t('shifts.staffCount')} *
        </label>
        <input
          type="number"
          min="1"
          value={formData.staffCount}
          onChange={(e) => setFormData(prev => ({ ...prev, staffCount: parseInt(e.target.value) }))}
          required
          className="form-input"
          style={{ width: '150px' }}
        />
      </div>

      <div className="form-group">
        <label className="form-label">
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
          <div className="required-trait-list">
            {formData.requiredTraits.map((requiredTrait, index) => (
              <div key={index} className="required-trait-item">
                <span>{getTraitName(requiredTrait.traitId)} ({t('shifts.minimum')} {requiredTrait.minCount})</span>
                <button type="button" onClick={() => removeRequiredTrait(index)} className="btn btn-danger btn-xs">
                  {t('shifts.remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">
          {t('shifts.excludedTraits')}
        </label>
        <TraitAutocomplete
          traits={traits}
          selectedTraits={formData.excludedTraits.map(traitId => ({ traitId, minCount: 1 }))}
          onTraitSelect={handleExcludedTraitSelect}
          placeholder={t('shifts.searchCreateExcludedTrait')}
          allowMinCount={false}
        />
        {formData.excludedTraits.length > 0 && (
          <div className="required-trait-list">
            {formData.excludedTraits.map((traitId, index) => (
              <div key={index} className="required-trait-item">
                <span>{getTraitName(traitId)}</span>
                <button type="button" onClick={() => removeExcludedTrait(index)} className="btn btn-danger btn-xs">
                  {t('shifts.remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="form-group">
        <label className="form-checkbox-label">
          <input
            type="checkbox"
            checked={formData.hasRecurrence}
            onChange={(e) => setFormData(prev => ({ ...prev, hasRecurrence: e.target.checked }))}
          />
          <span>{t('shifts.recurring')}</span>
        </label>
      </div>

      {formData.hasRecurrence && (
        <div className="recurrence-section">

          <div className="form-row">
            <div className="form-col">
              <label className="form-label">
                {t('shifts.repeat')}
              </label>
              <select
                value={formData.recurrenceType}
                onChange={(e) => setFormData(prev => ({ ...prev, recurrenceType: e.target.value as 'daily' | 'weekly' | 'monthly' }))}
                className="form-select"
              >
                <option value="daily">{t('shifts.daily')}</option>
                <option value="weekly">{t('shifts.weekly')}</option>
                <option value="monthly">{t('shifts.monthly')}</option>
              </select>
            </div>
            
            <div className="form-col">
              <label className="form-label">
                {t('shifts.every')} X {formData.recurrenceType === 'daily' ? t('shifts.days') : formData.recurrenceType === 'weekly' ? t('shifts.weeks') : t('shifts.months')}
              </label>
              <input
                type="number"
                min="1"
                placeholder={`${t('shifts.every')} X ${formData.recurrenceType === 'daily' ? t('shifts.days').toLowerCase() : formData.recurrenceType === 'weekly' ? t('shifts.weeks').toLowerCase() : t('shifts.months').toLowerCase()}`}
                value={formData.recurrenceInterval}
                onChange={(e) => setFormData(prev => ({ ...prev, recurrenceInterval: parseInt(e.target.value) }))}
                className="form-input"
              />
            </div>
            
            <div className="form-col">
              <label className="form-label">
                {t('shifts.endDate')} ({t('common.optional')})
              </label>
              <input
                type="date"
                value={formData.recurrenceEndDate}
                onChange={(e) => setFormData(prev => ({ ...prev, recurrenceEndDate: e.target.value }))}
                className="form-input"
              />
            </div>
          </div>
          
          {formData.recurrenceType === 'weekly' && (
            <div style={{ marginTop: '15px' }}>
              <label className="form-label">
                {t('shifts.selectWeekdays')}
              </label>
              <div className="weekday-selector">
                {weekdayNames.map((dayName, index) => (
                  <label key={index} className={`weekday-label ${formData.recurrenceWeekdays.includes(index) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={formData.recurrenceWeekdays.includes(index)}
                      onChange={() => toggleWeekday(index)}
                      className="weekday-checkbox"
                    />
                    {dayName}
                  </label>
                ))}
              </div>
              {formData.recurrenceWeekdays.length === 0 && (
                <p className="weekday-hint">
                  {t('shifts.selectWeekdaysHint')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Validation error */}
      {validationError && (
        <div className="validation-error">
          {validationError}
        </div>
      )}

      <div className="form-actions">
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