import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { Database } from '../../storage/database';
import type { User, UserDoc, StaffMember } from '../../storage/database';
import { Modal } from '../Modal';
import { ConfirmDialog } from '../ConfirmDialog';

interface UserData {
  name: string;
  email: string;
  role: 'instance-admin' | 'instance-manager' | 'instance-staff';
  password: string;
  confirmPassword: string;
  createStaffMember: boolean;
  linkToExistingStaff?: string;
}

export function UserManagementView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserData>({
    name: '',
    email: '',
    role: 'instance-staff',
    password: '',
    confirmPassword: '',
    createStaffMember: false,
    linkToExistingStaff: undefined
  });

  // Check if current user can manage users
  const canManageUsers = user?.role === 'admin' || user?.role === 'instance-admin' || user?.role === 'instance-manager';

  // Load initial data
  useEffect(() => {
    if (canManageUsers) {
      Database.getUsers().then(setUsers);
      Database.getStaffMembers().then(setStaff);
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [canManageUsers]);

  // Live updates for users and staff
  useEffect(() => {
    if (!canManageUsers) return;

    const userListener = Database.liveGetUsers((change: PouchDB.Core.ChangesResultChange<UserDoc>) => {
      if (change.deleted) {
        setUsers(prev => prev.filter(u => u.id !== change.id.replace('user:', '')));
      } else if (change.doc) {
        const updatedUser = Database.docToUser(change.doc);
        setUsers(prev => {
          const index = prev.findIndex(u => u.id === updatedUser.id);
          if (index > -1) {
            const newUsers = [...prev];
            newUsers[index] = updatedUser;
            return newUsers;
          }
          return [...prev, updatedUser];
        });
      }
    });

    const staffListener = Database.liveGetStaffMembers((change: any) => {
      if (change.deleted) {
        setStaff(prev => prev.filter(s => s.id !== change.id.replace('staff:', '')));
      } else if (change.doc) {
        const member = Database.docToStaffMember(change.doc);
        setStaff(prev => {
          const index = prev.findIndex(s => s.id === member.id);
          if (index > -1) {
            const newStaff = [...prev];
            newStaff[index] = member;
            return newStaff;
          }
          return [...prev, member];
        });
      }
    });

    return () => {
      userListener.cancel();
      staffListener.cancel();
    };
  }, [canManageUsers]);

  const generateUserId = (name: string): string => {
    const timestamp = Date.now();
    const safeName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return `${safeName}-${timestamp}`;
  };

  const handleCreateUser = async () => {
    try {
      // Only validate password for new users or when password is provided for editing
      if (!editingUser || formData.password) {
        if (formData.password !== formData.confirmPassword) {
          setError(t('userManagement.passwordMismatch', 'Passwords do not match'));
          return;
        }

        if (formData.password.length < 6) {
          setError(t('userManagement.passwordTooShort', 'Password must be at least 6 characters'));
          return;
        }
      }

      // Generate unique user ID for new users, use existing for edits
      const userId = editingUser?.id || generateUserId(formData.name);
      
      const updatedUser: User = {
        id: userId,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        isActive: editingUser?.isActive ?? true,
        createdAt: editingUser?.createdAt || new Date().toISOString(),
        linkedStaffId: formData.linkToExistingStaff || undefined
      };

      await Database.saveUser(updatedUser);

      // Create linked staff member if requested (only for new users)
      if (!editingUser && formData.createStaffMember && !formData.linkToExistingStaff) {
        try {
          const staffId = generateUserId(formData.name);
          const newStaffMember: StaffMember = {
            id: staffId,
            name: formData.name,
            traitIds: [],
            constraints: {
              maxShiftsPerWeek: 40,
              maxShiftsPerMonth: 160,  
              maxShiftsPerYear: 2000,
              incompatibleWith: []
            },
            blockedTimes: [],
            linkedUserId: userId,
            email: formData.email
          };

          await Database.saveStaffMember(newStaffMember);
          
          // Update user with staff link
          updatedUser.linkedStaffId = staffId;
          await Database.saveUser(updatedUser);
        } catch (staffErr) {
          console.error('Failed to create linked staff member:', staffErr);
          setError(t('userManagement.userCreatedStaffFailed', 'User saved successfully, but failed to create linked staff member'));
        }
      }

      setShowUserForm(false);
      resetForm();
      if (!formData.createStaffMember) {
        setError(null);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save user';
      setError(errorMessage);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      password: '',
      confirmPassword: '',
      createStaffMember: false,
      linkToExistingStaff: user.linkedStaffId || undefined
    });
    setShowUserForm(true);
  };

  const handleDeleteUser = (user: User) => {
    setDeleteConfirmUser(user);
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirmUser) return;

    try {
      await Database.deleteUser(deleteConfirmUser.id);
      setError(null);
      setDeleteConfirmUser(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete user';
      setError(errorMessage);
    }
  };

  const cancelDeleteUser = () => {
    setDeleteConfirmUser(null);
  };

  const getAvailableStaff = () => {
    // Return staff that are not already linked to users, or the current user's staff when editing
    return staff.filter(s => {
      const isLinkedToOtherUser = users.some(u => u.linkedStaffId === s.id && u.id !== editingUser?.id);
      return !isLinkedToOtherUser;
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: 'instance-staff',
      password: '',
      confirmPassword: '',
      createStaffMember: false,
      linkToExistingStaff: undefined
    });
    setEditingUser(null);
  };

  const getLinkedStaffName = (staffId?: string): string => {
    if (!staffId) return t('common.none');
    const staffMember = staff.find(s => s.id === staffId);
    return staffMember ? staffMember.name : t('userManagement.unknownStaff');
  };

  const getRoleDisplayName = (role: string): string => {
    switch (role) {
      case 'instance-admin': return t('auth.roles.instanceAdmin');
      case 'instance-manager': return t('auth.roles.manager');
      case 'instance-staff': return t('auth.roles.staff');
      default: return role;
    }
  };

  if (!canManageUsers) {
    return (
      <div className="user-management-view">
        <div className="access-denied">
          <h2>{t('userManagement.accessDenied')}</h2>
          <p>{t('userManagement.accessDeniedMessage')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management-view">
      <div className="view-header">
        <h1>{t('userManagement.title')}</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowUserForm(true)}
        >
          {t('userManagement.addUser')}
        </button>
      </div>

      <div className="view-content">
        {error && (
          <div className="error-message" role="alert" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

      {loading ? (
        <div className="loading-spinner">{t('common.loading')}</div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>{t('userManagement.username')}</th>
                <th>{t('userManagement.email')}</th>
                <th>{t('userManagement.role')}</th>
                <th>{t('userManagement.linkedStaff')}</th>
                <th>{t('userManagement.status')}</th>
                <th>{t('userManagement.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`role-badge role-badge-${user.role.replace('instance-', '')}`}>
                      {getRoleDisplayName(user.role)}
                    </span>
                  </td>
                  <td>{getLinkedStaffName(user.linkedStaffId)}</td>
                  <td>
                    <span className={`status-badge ${user.isActive ? 'status-active' : 'status-disabled'}`}>
                      {user.isActive ? t('userManagement.active') : t('userManagement.disabled')}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleEditUser(user)}
                        style={{ marginRight: '0.5rem' }}
                      >
                        {t('common.edit', 'Edit')}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteUser(user)}
                      >
                        {t('common.delete', 'Delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    {t('userManagement.noUsers')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {/* Add User Modal */}
      <Modal
        isOpen={showUserForm}
        onClose={() => {
          setShowUserForm(false);
          resetForm();
          setError(null);
        }}
        title={editingUser ? t('userManagement.editUser') : t('userManagement.addUser')}
      >
        <form onSubmit={(e) => { e.preventDefault(); handleCreateUser(); }} className="user-form">
          <div className="form-group">
            <label className="form-label">
              {t('userManagement.username')}
            </label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('userManagement.role')}
            </label>
            <select
              className="form-select"
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as any }))}
            >
              <option value="instance-staff">{t('auth.roles.staff')}</option>
              <option value="instance-manager">{t('auth.roles.manager')}</option>
              <option value="instance-admin">{t('auth.roles.instanceAdmin')}</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('userManagement.email')}
            </label>
            <input
              type="email"
              className="form-input"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('auth.password')} {editingUser && <span style={{ fontWeight: 'normal', opacity: 0.7 }}>({t('userManagement.optionalForEdit')})</span>}
            </label>
            <input
              type="password"
              className="form-input"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              required={!editingUser}
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('userManagement.confirmPassword')}
            </label>
            <input
              type="password"
              className="form-input"
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              required={!editingUser}
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('userManagement.linkToStaff')}
            </label>
            <select
              className="form-select"
              value={formData.linkToExistingStaff || ''}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                linkToExistingStaff: e.target.value || undefined,
                createStaffMember: !e.target.value // Disable create if linking to existing
              }))}
            >
              <option value="">{t('userManagement.noStaffLink')}</option>
              {getAvailableStaff().map(staff => (
                <option key={staff.id} value={staff.id}>{staff.name}</option>
              ))}
            </select>
          </div>

          {!formData.linkToExistingStaff && (
            <div className="form-group">
              <div className="form-checkbox">
                <input
                  type="checkbox"
                  id="createStaffMember"
                  checked={formData.createStaffMember}
                  onChange={(e) => setFormData(prev => ({ ...prev, createStaffMember: e.target.checked }))}
                />
                <label htmlFor="createStaffMember" className="form-label">
                  {t('userManagement.createStaffMember')}
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowUserForm(false);
                resetForm();
                setError(null);
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!formData.name || (!editingUser && !formData.password) || (formData.password && formData.password !== formData.confirmPassword)}
            >
              {editingUser ? t('userManagement.updateUser') : t('userManagement.createUser')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmUser !== null}
        title={t('userManagement.confirmDelete')}
        message={t('userManagement.confirmDeleteMessage', { name: deleteConfirmUser?.name })}
        question={t('userManagement.confirmDeleteQuestion')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDeleteUser}
        onCancel={cancelDeleteUser}
      />
    </div>
  );
}