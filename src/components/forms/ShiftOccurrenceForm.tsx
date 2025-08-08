import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ShiftOccurrence, StaffMember, Trait } from '../../storage/database-pouchdb';
import { Database } from '../../storage/database-pouchdb';
import { StaffAutocomplete } from '../StaffAutocomplete';
import { StaffingStatusBar } from '../StaffingStatusBar';
import { calculateStaffingStatus } from '../../utils/staffingStatus';
import { toLocalDateTimeInputValue } from '../../utils/datetime';

interface ShiftOccurrenceFormProps {
  occurrence: ShiftOccurrence;
  onSave: (occurrence: ShiftOccurrence) => void;
  onCancel: () => void;
}

export function ShiftOccurrenceForm({ occurrence, onSave, onCancel }: ShiftOccurrenceFormProps) {
  const { t, i18n } = useTranslation();
  const [formData, setFormData] = useState({
    name: occurrence.name,
    startDateTime: toLocalDateTimeInputValue(occurrence.startDateTime),
    endDateTime: toLocalDateTimeInputValue(occurrence.endDateTime),
    staffCount: occurrence.requirements.staffCount,
    requiredTraits: occurrence.requirements.requiredTraits || [],
    assignedStaff: occurrence.assignedStaff || [],
  });

  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [allTraits, setAllTraits] = useState<Trait[]>([]);
  const [allShiftOccurrences, setAllShiftOccurrences] = useState<ShiftOccurrence[]>([]);
  const [assignedStaffMembers, setAssignedStaffMembers] = useState<StaffMember[]>([]);

  // Load staff, traits, and shift occurrences on component mount
  useEffect(() => {
    const loadData = async () => {
      const [staff, traits, occurrences] = await Promise.all([
        Database.getStaffMembers(),
        Database.getTraits(),
        Database.getShiftOccurrences()
      ]);
      setAllStaff(staff);
      setAllTraits(traits);
      setAllShiftOccurrences(occurrences);
    };
    loadData();
  }, []);

  // Update assigned staff members when formData.assignedStaff changes
  useEffect(() => {
    const assigned = allStaff.filter(staff => formData.assignedStaff.includes(staff.id));
    setAssignedStaffMembers(assigned);
  }, [formData.assignedStaff, allStaff]);

  const [traitInput, setTraitInput] = useState({ traitId: '', minCount: 1 });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that end time is after start time
    if (new Date(formData.endDateTime) <= new Date(formData.startDateTime)) {
      alert(t('validation.endAfterStart'));
      return;
    }
    
    const updatedOccurrence: ShiftOccurrence = {
      ...occurrence,
      name: formData.name,
      startDateTime: new Date(formData.startDateTime),
      endDateTime: new Date(formData.endDateTime),
      requirements: {
        staffCount: formData.staffCount,
        requiredTraits: formData.requiredTraits.length > 0 ? formData.requiredTraits : undefined,
      },
      assignedStaff: formData.assignedStaff,
      isModified: true, // Mark as modified since it's different from parent shift
    };

    onSave(updatedOccurrence);
  };

  const addTrait = () => {
    if (traitInput.traitId.trim()) {
      setFormData(prev => ({
        ...prev,
        requiredTraits: [...prev.requiredTraits, { traitId: traitInput.traitId.trim(), minCount: traitInput.minCount }]
      }));
      setTraitInput({ traitId: '', minCount: 1 });
    }
  };

  const removeTrait = (index: number) => {
    setFormData(prev => ({
      ...prev,
      requiredTraits: prev.requiredTraits.filter((_, i) => i !== index)
    }));
  };

  const handleStaffSelect = (staffMember: StaffMember) => {
    setFormData(prev => ({
      ...prev,
      assignedStaff: [...prev.assignedStaff, staffMember.id]
    }));
  };

  const removeStaff = (staffId: string) => {
    setFormData(prev => ({
      ...prev,
      assignedStaff: prev.assignedStaff.filter(id => id !== staffId)
    }));
  };

  // Calculate staffing status
  const staffingStatus = calculateStaffingStatus(
    {
      ...occurrence,
      requirements: {
        staffCount: formData.staffCount,
        requiredTraits: formData.requiredTraits.length > 0 ? formData.requiredTraits : undefined
      },
      assignedStaff: formData.assignedStaff
    },
    assignedStaffMembers,
    allTraits,
    t,
    i18n.language,
    allShiftOccurrences,
    allStaff
  );

  return (
    <form onSubmit={handleSubmit}>
      {/* Warning about editing occurrence vs shift */}
      <div style={{ 
        backgroundColor: '#fff3cd', 
        border: '1px solid #ffeaa7', 
        borderRadius: '4px', 
        padding: '12px', 
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '18px', marginRight: '8px' }}>⚠️</span>
          <strong style={{ color: '#856404' }}>{t('shiftOccurrence.editingOccurrence')}</strong>
        </div>
        <p style={{ margin: '0 0 8px 0', color: '#856404', fontSize: '14px' }}>
          {t('shiftOccurrence.editingOccurrenceDescription', { date: new Date(occurrence.startDateTime).toLocaleDateString(i18n.language) })}
        </p>
        <Link 
          to="/shifts" 
          onClick={onCancel}
          style={{ 
            color: '#007bff', 
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          {t('shiftOccurrence.editRecurringShift')}
        </Link>
      </div>
      
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          {t('shifts.shiftName')} *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          required
          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            {t('shifts.startDateTime')} *
          </label>
          <input
            type="datetime-local"
            value={formData.startDateTime}
            onChange={(e) => setFormData(prev => ({ ...prev, startDateTime: e.target.value }))}
            required
            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            {t('shifts.endDateTime')} *
          </label>
          <input
            type="datetime-local"
            value={formData.endDateTime}
            onChange={(e) => setFormData(prev => ({ ...prev, endDateTime: e.target.value }))}
            min={formData.startDateTime}
            required
            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
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
          style={{ width: '150px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          {t('shifts.requiredTraits')}
        </label>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <input
            type="text"
            placeholder={t('shiftOccurrence.traitName')}
            value={traitInput.traitId}
            onChange={(e) => setTraitInput(prev => ({ ...prev, traitId: e.target.value }))}
            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
          <input
            type="number"
            min="1"
            placeholder={t('shiftOccurrence.minCount')}
            value={traitInput.minCount}
            onChange={(e) => setTraitInput(prev => ({ ...prev, minCount: parseInt(e.target.value) }))}
            style={{ width: '100px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
          <button type="button" onClick={addTrait} className="btn btn-success">
            {t('shiftOccurrence.add')}
          </button>
        </div>
        {formData.requiredTraits.length > 0 && (
          <div>
            {formData.requiredTraits.map((trait, index) => (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px', backgroundColor: '#e9ecef', marginBottom: '5px', borderRadius: '4px' }}>
                <span>{allTraits.find(t => trait.traitId === t.id)?.name ?? 'Unknown Trait'} (minimum {trait.minCount})</span>
                <button type="button" onClick={() => removeTrait(index)} className="btn btn-danger btn-xs">
                  {t('staff.remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Staffing Status */}
      <StaffingStatusBar status={staffingStatus} />

      {/* Staff Assignment Section */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>  
          {t('shiftOccurrence.assignStaff')}
        </label>
        
        <div style={{ marginBottom: '10px' }}>
          <StaffAutocomplete
            staff={allStaff}
            traits={allTraits}
            selectedStaffIds={formData.assignedStaff}
            onStaffSelect={handleStaffSelect}
            placeholder={t('shiftOccurrence.searchStaff')}
          />
        </div>

        {/* Display assigned staff */}
        {assignedStaffMembers.length > 0 && (
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
              {t('shiftOccurrence.assignedStaff', { assigned: assignedStaffMembers.length, required: formData.staffCount })}:
            </div>
            {assignedStaffMembers.map(staffMember => {
              const staffTraitNames = staffMember.traitIds
                .map(traitId => allTraits.find(t => t.id === traitId)?.name || 'Unknown')
                .join(', ');
              
              return (
                <div 
                  key={staffMember.id} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '8px', 
                    backgroundColor: '#e9ecef', 
                    marginBottom: '5px', 
                    borderRadius: '4px' 
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{staffMember.name}</div>
                    {staffTraitNames && (
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {t('staff.traits')}: {staffTraitNames}
                      </div>
                    )}
                  </div>
                  <button 
                    type="button" 
                    onClick={() => removeStaff(staffMember.id)} 
                    style={{ 
                      padding: '4px 8px', 
                      backgroundColor: '#dc3545', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    {t('staff.remove')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          {t('shifts.cancel')}
        </button>
        <button type="submit" className="btn btn-primary">
          {t('shiftOccurrence.updateOccurrence')}
        </button>
      </div>
    </form>
  );
}