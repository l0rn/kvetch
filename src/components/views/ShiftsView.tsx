import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Shift, ShiftOccurrence, Trait } from "../../storage/database";
import { Database } from "../../storage/database";
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
      <div className="view-header">
        <h1>{t('shifts.title')}</h1>
        <button onClick={onShowShiftForm} className="btn btn-primary">
          {t('shifts.createShift')}
        </button>
      </div>

      <div className="view-content">

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

        <div className="shifts-table-container">
          <table className="shifts-table users-table">
            <thead>
              <tr>
                <th>{t('shifts.name')}</th>
                <th>{t('shifts.schedule')}</th>
                <th>{t('shifts.requirements')}</th>
                <th>{t('shifts.assignmentStatus')}</th>
                <th>{t('shifts.recurrence')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map(shift => {
                const stats = getShiftAssignmentStats(shift.id);
                return (
                  <tr key={shift.id}>
                    <td>
                      <div className="shift-name">{shift.name}</div>
                    </td>
                    <td>
                      <div className="shift-schedule">
                        <div className="shift-time">
                          {new Date(shift.startDateTime).toLocaleString(i18n.language, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                        </div>
                        <div className="shift-duration">
                          {new Date(shift.endDateTime).toLocaleTimeString(i18n.language, {hour: '2-digit', minute: '2-digit'})}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="shift-requirements">
                        <div><strong>{t('shifts.staffCountShort')}:</strong> {shift.requirements.staffCount}</div>
                        {shift.requirements.requiredTraits && shift.requirements.requiredTraits.length > 0 && (
                          <div className="required-traits">
                            <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '2px' }}>{t('shifts.required')}:</div>
                            {shift.requirements.requiredTraits.map(rt => (
                              <span key={rt.traitId} className="trait-requirement">
                                {getTraitName(rt.traitId)} ({rt.minCount})
                              </span>
                            ))}
                          </div>
                        )}
                        {shift.requirements.excludedTraits && shift.requirements.excludedTraits.length > 0 && (
                          <div className="excluded-traits" style={{ marginTop: '4px' }}>
                            <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '2px' }}>{t('shifts.excluded')}:</div>
                            {shift.requirements.excludedTraits.map(traitId => (
                              <span key={traitId} className="trait-requirement" style={{ backgroundColor: '#fee', color: '#c33' }}>
                                {getTraitName(traitId)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="assignment-status">
                        <span className={`assignment-ratio ${stats.totalAssigned >= stats.totalRequired ? 'assignment-complete' : 'assignment-incomplete'}`}>
                          {stats.totalAssigned}/{stats.totalRequired}
                        </span>
                        <div className="assignment-occurrences">
                          {t('shifts.acrossOccurrencesShort', { count: stats.totalOccurrences })}
                        </div>
                      </div>
                    </td>
                    <td>
                      {shift.recurrence ? (
                        <div className="recurrence-info">
                          <span className="recurrence-type">{t(`shifts.${shift.recurrence.type}`)}</span>
                          <div className="recurrence-details">
                            {t('shifts.every')} {shift.recurrence.interval}
                            {shift.recurrence.endDate && (
                              <div>{t('shifts.until', { date: new Date(shift.recurrence.endDate).toLocaleDateString(i18n.language) })}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="empty-state-inline">{t('shifts.oneTime')}</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button onClick={() => onEditShift(shift)} className="btn btn-sm btn-secondary" style={{ marginRight: '0.5rem' }}>
                          {t('shifts.edit')}
                        </button>
                        <button onClick={() => handleDeleteShift(shift)} className="btn btn-sm btn-danger">
                          {t('shifts.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shifts.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    {t('shifts.noShifts')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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