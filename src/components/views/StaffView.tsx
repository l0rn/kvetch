import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffMember, Trait } from '../../storage/database-pouchdb';
import { Database } from '../../storage/database-pouchdb';
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>{t('staff.title')}</h2>
        <button onClick={onShowStaffForm} className="btn btn-primary">
          {t('staff.createStaff')}
        </button>
      </div>

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

      <div className="staff-list">
        {staff.map(member => (
          <div key={member.id} className="staff-item" style={{ border: '1px solid #ddd', padding: '15px', marginBottom: '10px', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h3>{member.name}</h3>
                <p><strong>{t('staff.traits')}:</strong> {member.traitIds.length > 0 ? member.traitIds.map(getTraitName).join(', ') : t('staff.none')}</p>
                <div style={{ marginTop: '10px' }}>
                  {member.constraints.maxShiftsPerWeek && <p><strong>{t('staff.maxShiftsPerWeek')}:</strong> {member.constraints.maxShiftsPerWeek}</p>}
                  {member.constraints.maxShiftsPerMonth && <p><strong>{t('staff.maxShiftsPerMonth')}:</strong> {member.constraints.maxShiftsPerMonth}</p>}
                  {member.constraints.maxShiftsPerYear && <p><strong>{t('staff.maxShiftsPerYear')}:</strong> {member.constraints.maxShiftsPerYear}</p>}
                  {member.constraints.incompatibleWith.length > 0 && (
                    <p><strong>{t('staff.incompatibleWith')}:</strong> {member.constraints.incompatibleWith.join(', ')}</p>
                  )}
                </div>
                {member.blockedTimes.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <p><strong>{t('staff.blockedTimes')}:</strong> {t('staff.blockedTimeEntries', { count: member.blockedTimes.length })}</p>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {member.blockedTimes.slice(0, 3).map((bt, index) => (
                        <div key={index}>
                          {new Date(bt.startDateTime).toLocaleDateString(i18n.language)} {bt.isFullDay ? `(${t('staff.fullDay')})` : `${new Date(bt.startDateTime).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}-${new Date(bt.endDateTime).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}`}
                          {bt.recurrence && ` (${bt.recurrence.type})`}
                        </div>
                      ))}
                      {member.blockedTimes.length > 3 && <div>{t('staff.andMore', { count: member.blockedTimes.length - 3 })}</div>}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <button onClick={() => onEditStaff(member)} className="btn btn-secondary btn-small" style={{ marginRight: '10px' }}>
                  {t('staff.edit')}
                </button>
                <button onClick={() => handleDeleteStaff(member)} className="btn btn-danger btn-small">
                  {t('staff.delete')}
                </button>
              </div>
            </div>
          </div>
        ))}
        {staff.length === 0 && (
          <p>{t('staff.noStaff')}</p>
        )}
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