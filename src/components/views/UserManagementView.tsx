import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { AppConfigManager } from '../../config/AppConfig';
import { Modal } from '../Modal';

interface UserData {
  name: string;
  role: 'instance-admin' | 'instance-manager' | 'instance-staff';
  password: string;
  confirmPassword: string;
  instanceIds: string[];
}

interface SyncGatewayUser {
  name: string;
  admin_channels: string[];
  all_channels?: string[];
  disabled?: boolean;
}

export function UserManagementView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [users, setUsers] = useState<SyncGatewayUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [, setEditingUser] = useState<SyncGatewayUser | null>(null);
  const [formData, setFormData] = useState<UserData>({
    name: '',
    role: 'instance-staff',
    password: '',
    confirmPassword: '',
    instanceIds: []
  });

  // Check if current user can manage users
  const canManageUsers = user?.role === 'admin' || user?.role === 'instance-admin';

  useEffect(() => {
    if (canManageUsers) {
      loadUsers();
    } else {
      setLoading(false);
    }
  }, [canManageUsers]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const config = await AppConfigManager.getConfig();
      
      if (!config.remote?.adminApiUrl) {
        throw new Error('Admin API not configured');
      }

      const response = await fetch(`${config.remote.adminApiUrl}/${config.remote.databaseName}/_user/`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load users: ${response.status}`);
      }

      const userData = await response.json();
      
      // Extract user list from response (format varies by Sync Gateway version)
      const userList = Array.isArray(userData) ? userData : Object.values(userData);
      setUsers(userList as SyncGatewayUser[]);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load users';
      setError(errorMessage);
      console.error('Load users error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      if (formData.password !== formData.confirmPassword) {
        setError(t('userManagement.passwordMismatch', 'Passwords do not match'));
        return;
      }

      if (formData.password.length < 6) {
        setError(t('userManagement.passwordTooShort', 'Password must be at least 6 characters'));
        return;
      }

      const config = await AppConfigManager.getConfig();
      if (!config.remote?.adminApiUrl) {
        throw new Error('Admin API not configured');
      }

      // Generate channels based on role and instance IDs
      const channels = generateChannelsForRole(formData.role, formData.instanceIds);

      const userData = {
        name: formData.name,
        password: formData.password,
        admin_channels: channels
      };

      const response = await fetch(
        `${config.remote.adminApiUrl}/${config.remote.databaseName}/_user/${formData.name}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(userData)
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.reason || `Failed to create user: ${response.status}`);
      }

      await loadUsers();
      setShowUserForm(false);
      resetForm();
      setError(null);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create user';
      setError(errorMessage);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!confirm(t('userManagement.confirmDelete', 'Are you sure you want to delete this user?'))) {
      return;
    }

    try {
      const config = await AppConfigManager.getConfig();
      if (!config.remote?.adminApiUrl) {
        throw new Error('Admin API not configured');
      }

      const response = await fetch(
        `${config.remote.adminApiUrl}/${config.remote.databaseName}/_user/${username}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to delete user: ${response.status}`);
      }

      await loadUsers();
      setError(null);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete user';
      setError(errorMessage);
    }
  };

  const generateChannelsForRole = (role: string, instanceIds: string[]): string[] => {
    const channels: string[] = [];
    
    instanceIds.forEach(instanceId => {
      switch (role) {
        case 'instance-admin':
          channels.push(`instance-${instanceId}-admin`);
          channels.push(`instance-${instanceId}-managers`);
          channels.push(`instance-${instanceId}-staff`);
          break;
        case 'instance-manager':
          channels.push(`instance-${instanceId}-managers`);
          channels.push(`instance-${instanceId}-staff`);
          break;
        case 'instance-staff':
          channels.push(`instance-${instanceId}-staff`);
          break;
      }
    });

    return channels;
  };

  const resetForm = () => {
    setFormData({
      name: '',
      role: 'instance-staff',
      password: '',
      confirmPassword: '',
      instanceIds: []
    });
    setEditingUser(null);
  };

  const getRoleFromChannels = (channels: string[]): string => {
    if (channels.some(c => c.includes('admin'))) {
      return 'instance-admin';
    }
    if (channels.some(c => c.includes('managers'))) {
      return 'instance-manager';
    }
    return 'instance-staff';
  };

  const getInstancesFromChannels = (channels: string[]): string[] => {
    const instances = new Set<string>();
    channels.forEach(channel => {
      const match = channel.match(/^instance-([^-]+)-/);
      if (match) {
        instances.add(match[1]);
      }
    });
    return Array.from(instances);
  };

  if (!canManageUsers) {
    return (
      <div className="user-management-view">
        <div className="access-denied">
          <h2>{t('userManagement.accessDenied', 'Access Denied')}</h2>
          <p>{t('userManagement.accessDeniedMessage', 'You do not have permission to manage users.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management-view">
      <div className="view-header">
        <h1>{t('userManagement.title', 'User Management')}</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowUserForm(true)}
        >
          {t('userManagement.addUser', 'Add User')}
        </button>
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-spinner">{t('common.loading', 'Loading...')}</div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>{t('userManagement.username', 'Username')}</th>
                <th>{t('userManagement.role', 'Role')}</th>
                <th>{t('userManagement.instances', 'Instances')}</th>
                <th>{t('userManagement.status', 'Status')}</th>
                <th>{t('userManagement.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.name}>
                  <td>{user.name}</td>
                  <td>
                    <span className={`role-badge role-badge-${getRoleFromChannels(user.admin_channels)}`}>
                      {getRoleFromChannels(user.admin_channels)}
                    </span>
                  </td>
                  <td>{getInstancesFromChannels(user.admin_channels).join(', ') || '-'}</td>
                  <td>
                    <span className={`status-badge ${user.disabled ? 'status-disabled' : 'status-active'}`}>
                      {user.disabled ? t('userManagement.disabled', 'Disabled') : t('userManagement.active', 'Active')}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteUser(user.name)}
                        disabled={user.name === 'admin'} // Protect admin user
                      >
                        {t('common.delete', 'Delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    {t('userManagement.noUsers', 'No users found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User Modal */}
      <Modal
        isOpen={showUserForm}
        onClose={() => {
          setShowUserForm(false);
          resetForm();
          setError(null);
        }}
        title={t('userManagement.addUser', 'Add User')}
      >
        <form onSubmit={(e) => { e.preventDefault(); handleCreateUser(); }} className="user-form">
          <div className="form-group">
            <label className="form-label">
              {t('userManagement.username', 'Username')}
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
              {t('userManagement.role', 'Role')}
            </label>
            <select
              className="form-select"
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as any }))}
            >
              <option value="instance-staff">{t('auth.roles.staff', 'Staff')}</option>
              <option value="instance-manager">{t('auth.roles.manager', 'Manager')}</option>
              <option value="instance-admin">{t('auth.roles.instanceAdmin', 'Instance Admin')}</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('userManagement.instanceId', 'Instance ID')}
            </label>
            <input
              type="text"
              className="form-input"
              value={formData.instanceIds.join(', ')}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                instanceIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              }))}
              placeholder={t('userManagement.instanceIdPlaceholder', 'demo, company-a')}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('auth.password', 'Password')}
            </label>
            <input
              type="password"
              className="form-input"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('userManagement.confirmPassword', 'Confirm Password')}
            </label>
            <input
              type="password"
              className="form-input"
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowUserForm(false);
                resetForm();
                setError(null);
              }}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!formData.name || !formData.password || formData.password !== formData.confirmPassword}
            >
              {t('userManagement.createUser', 'Create User')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}