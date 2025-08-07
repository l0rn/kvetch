import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Shift, ShiftOccurrence, Trait } from '../../storage/database-pouchdb';
import { Database } from '../../storage/database-pouchdb';
import { ShiftForm } from '../forms/ShiftForm';
import { Modal } from '../Modal';
import { ConfirmDialog } from '../ConfirmDialog';

interface ShiftsViewProps {
  shifts: Shift[];
  shiftOccurrences: ShiftOccurrence[];
  showShiftForm: boolean;
  editingShift: Shift | null;
  onShowShiftForm: () => void;
  onSaveShift: (shift: Partial<Shift>) => void;
  onEditShift: (shift: Shift) => void;
  onDeleteShift: (shiftId: string) => void;
  onCancelShiftForm: () => void;
}

export function ShiftsView({
  shifts,
  shiftOccurrences,
  showShiftForm,
  editingShift,
  onShowShiftForm,
  onSaveShift,
  onEditShift,
  onDeleteShift,
  onCancelShiftForm
}: ShiftsViewProps) {
  const { t, i18n } = useTranslation();
  const [traits, setTraits] = useState<Trait[]>([]);
  const [deleteConfirmShift, setDeleteConfirmShift] = useState<Shift | null>(null);

  useEffect(() => {
    const loadTraits = async () => {
      const allTraits = await Database.getTraits();
      setTraits(allTraits);
    };
    loadTraits();
  }, []);

  const getTraitName = (traitId: string): string => {
    const trait = traits.find(t => t.id === traitId);
    return trait ? trait.name : t('staff.unknownTrait');
  };

  // Helper function to get assignment stats for a shift
  const getShiftAssignmentStats = (shiftId: string) => {
    const occurrences = shiftOccurrences.filter(occ => occ.parentShiftId === shiftId && !occ.isDeleted);
    const totalOccurrences = occurrences.length;
    const totalAssigned = occurrences.reduce((sum, occ) => sum + occ.assignedStaff.length, 0);
    const totalRequired = occurrences.reduce((sum, occ) => sum + occ.requirements.staffCount, 0);
    return { totalOccurrences, totalAssigned, totalRequired };
  };

  const handleDeleteShift = (shift: Shift) => {
    setDeleteConfirmShift(shift);
  };

  const confirmDeleteShift = () => {
    if (deleteConfirmShift) {
      onDeleteShift(deleteConfirmShift.id);
      setDeleteConfirmShift(null);
    }
  };

  const cancelDeleteShift = () => {
    setDeleteConfirmShift(null);
  };
  return (
    <div className="shifts-view">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>{t('shifts.title')}</h2>
        <button onClick={onShowShiftForm} className="btn btn-primary">
          {t('shifts.createShift')}
        </button>
      </div>

      <Modal
        isOpen={showShiftForm}
        onClose={onCancelShiftForm}
        title={editingShift ? t('shifts.editShift') : t('shifts.createShift')}
      >
        <ShiftForm
          initialShift={editingShift}
          onSave={onSaveShift}
          onCancel={onCancelShiftForm}
        />
      </Modal>

      <div className="shifts-list">
        {shifts.map(shift => (
          <div key={shift.id} className="shift-item" style={{ border: '1px solid #ddd', padding: '15px', marginBottom: '10px', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h3>{shift.name}</h3>
                <p><strong>{t('shifts.startDateTime')}:</strong> {new Date(shift.startDateTime).toLocaleString(i18n.language, {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</p>
                <p><strong>{t('shifts.endDateTime')}:</strong> {new Date(shift.endDateTime).toLocaleString(i18n.language, {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</p>
                <p><strong>{t('shifts.staffCount')}:</strong> {shift.requirements.staffCount}</p>
                {(() => {
                  const stats = getShiftAssignmentStats(shift.id);
                  return (
                    <p><strong>{t('shifts.assignmentStatus')}:</strong> {stats.totalAssigned}/{stats.totalRequired} {t('shifts.acrossOccurrences', { count: stats.totalOccurrences })}</p>
                  );
                })()}
                {shift.requirements.requiredTraits && shift.requirements.requiredTraits.length > 0 && (
                  <p><strong>{t('shifts.requiredTraits')}:</strong> {shift.requirements.requiredTraits.map(rt => `${getTraitName(rt.traitId)} (${rt.minCount})`).join(', ')}</p>
                )}
                {shift.recurrence && (
                  <p><strong>{t('shifts.recurrence')}:</strong> {t(`shifts.${shift.recurrence.type}`)} {t('shifts.every')} {shift.recurrence.interval} {shift.recurrence.endDate ? t('shifts.until', { date: shift.recurrence.endDate }) : ''}</p>
                )}
              </div>
              <div>
                <button onClick={() => onEditShift(shift)} className="btn btn-secondary btn-small" style={{ marginRight: '10px' }}>
                  {t('shifts.edit')}
                </button>
                <button onClick={() => handleDeleteShift(shift)} className="btn btn-danger btn-small">
                  {t('shifts.delete')}
                </button>
              </div>
            </div>
          </div>
        ))}
        {shifts.length === 0 && (
          <p>{t('shifts.noShifts')}</p>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirmShift !== null}
        title={t('shifts.confirmDelete')}
        message={t('shifts.confirmDeleteMessage', { name: deleteConfirmShift?.name })}
        question={t('shifts.confirmDeleteQuestion')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDeleteShift}
        onCancel={cancelDeleteShift}
      />
    </div>
  );
}