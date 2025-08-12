import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffMember, Trait } from "../../storage/database";
import { Database } from "../../storage/database";
import { StaffForm } from '../forms/StaffForm';
import { Modal } from '../Modal';
import { ConfirmDialog } from '../ConfirmDialog';

interface StaffViewProps {
  staff: StaffMember[];
  showStaffForm: boolean;
  editingStaff: StaffMember | null;
  onShowStaffForm: () => void;
  onSaveStaff: (staff: Omit<StaffMember, 'id'>) => void;
  onEditStaff: (staff: StaffMember) => void;
  onDeleteStaff: (staffId: string) => void;
  onCancelStaffForm: () => void;
}

export function StaffView({
  staff,
  showStaffForm,
  editingStaff,
  onShowStaffForm,
  onSaveStaff,
  onEditStaff,
  onDeleteStaff,
  onCancelStaffForm
}: StaffViewProps) {
  const { t, i18n } = useTranslation();
  const [traits, setTraits] = useState<Trait[]>([]);
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<StaffMember | null>(null);

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

  const handleDeleteStaff = (staff: StaffMember) => {
    setDeleteConfirmStaff(staff);
  };

  const confirmDeleteStaff = () => {
    if (deleteConfirmStaff) {
      onDeleteStaff(deleteConfirmStaff.id);
      setDeleteConfirmStaff(null);
    }
  };

  const cancelDeleteStaff = () => {
    setDeleteConfirmStaff(null);
  };

  return (
    <div className="staff-view">
      <div className="view-header">
        <h1>{t('staff.title')}</h1>
        <button onClick={onShowStaffForm} className="btn btn-primary">
          {t('staff.createStaff')}
        </button>
      </div>

      <div className="view-content">

      <Modal
        isOpen={showStaffForm}
        onClose={onCancelStaffForm}
        title={editingStaff ? t('staff.editStaff') : t('staff.createStaff')}
      >
        <StaffForm
          initialStaff={editingStaff}
          onSave={onSaveStaff}
          onCancel={onCancelStaffForm}
        />
      </Modal>

        <div className="staff-table-container">
          <table className="staff-table users-table">
            <thead>
              <tr>
                <th>{t('staff.name')}</th>
                <th>{t('staff.email')}</th>
                <th>{t('staff.traits')}</th>
                <th>{t('staff.constraints')}</th>
                <th>{t('staff.blockedTimes')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(member => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td>{member.email || t('common.notAvailable')}</td>
                  <td>
                    {member.traitIds.length > 0 ? (
                      <div className="traits-list">
                        {member.traitIds.map(traitId => (
                          <span key={traitId} className="trait-badge">{getTraitName(traitId)}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="empty-state-inline">{t('staff.none')}</span>
                    )}
                  </td>
                  <td>
                    <div className="constraints-list">
                      {member.constraints.maxShiftsPerWeek && <div><strong>{t('staff.maxShiftsPerWeekShort')}:</strong> {member.constraints.maxShiftsPerWeek}</div>}
                      {member.constraints.maxShiftsPerMonth && <div><strong>{t('staff.maxShiftsPerMonthShort')}:</strong> {member.constraints.maxShiftsPerMonth}</div>}
                      {member.constraints.maxShiftsPerYear && <div><strong>{t('staff.maxShiftsPerYearShort')}:</strong> {member.constraints.maxShiftsPerYear}</div>}
                      {member.constraints.incompatibleWith.length > 0 && (
                        <div><strong>{t('staff.incompatibleWithShort')}:</strong> {staff.find(s => s.id === member.constraints.incompatibleWith[0])?.name}</div>
                      )}
                    </div>
                  </td>
                  <td>
                    {member.blockedTimes.length > 0 ? (
                      <div className="blocked-times-summary">
                        <span className="blocked-times-count">{t('staff.blockedTimeEntries', { count: member.blockedTimes.length })}</span>
                        <div className="blocked-times-preview">
                          {member.blockedTimes.slice(0, 2).map((bt, index) => (
                            <div key={index} className="blocked-time-item">
                              {new Date(bt.startDateTime).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
                              {bt.recurrence && <span className="recurrence-indicator">⟲</span>}
                            </div>
                          ))}
                          {member.blockedTimes.length > 2 && <div className="blocked-times-more">+{member.blockedTimes.length - 2}</div>}
                        </div>
                      </div>
                    ) : (
                      <span className="empty-state-inline">{t('common.none')}</span>
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button onClick={() => onEditStaff(member)} className="btn btn-sm btn-secondary" style={{ marginRight: '0.5rem' }}>
                        {t('staff.edit')}
                      </button>
                      <button onClick={() => handleDeleteStaff(member)} className="btn btn-sm btn-danger">
                        {t('staff.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    {t('staff.noStaff')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

        <ConfirmDialog
          isOpen={deleteConfirmStaff !== null}
          title={t('staff.confirmDelete')}
          message={t('staff.confirmDeleteMessage', { name: deleteConfirmStaff?.name })}
          question={t('staff.confirmDeleteQuestion')}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          onConfirm={confirmDeleteStaff}
          onCancel={cancelDeleteStaff}
        />
    </div>
  );
}