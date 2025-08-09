import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../Modal';

interface UserProfileProps {
  showLogoutConfirm?: boolean;
}

export function UserProfile({ showLogoutConfirm = true }: UserProfileProps) {
  const { t } = useTranslation();
  const { user, logout, isLoading } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    setShowLogoutModal(false);
  };

  const getRoleDisplayName = (role: string) => {
    const roleMap: Record<string, string> = {
      'admin': t('auth.roles.admin', 'Administrator'),
      'instance-admin': t('auth.roles.instanceAdmin', 'Instance Admin'),
      'instance-manager': t('auth.roles.manager', 'Manager'),
      'instance-staff': t('auth.roles.staff', 'Staff')
    };
    return roleMap[role] || role;
  };

  const getRoleBadgeClass = (role: string) => {
    const classMap: Record<string, string> = {
      'admin': 'role-badge-admin',
      'instance-admin': 'role-badge-instance-admin',
      'instance-manager': 'role-badge-manager',
      'instance-staff': 'role-badge-staff'
    };
    return `role-badge ${classMap[role] || 'role-badge-default'}`;
  };

  return (
    <>
      <div className="user-profile">
        <div className="user-info">
          <div className="user-avatar">
            {user.name?.charAt(0).toUpperCase() || user.username.charAt(0).toUpperCase()}
          </div>
          <div className="user-details">
            <div className="user-name">
              {user.name || user.username}
            </div>
            <div className={getRoleBadgeClass(user.role)}>
              {getRoleDisplayName(user.role)}
            </div>
            {user.instanceIds.length > 0 && (
              <div className="user-instances">
                {t('auth.instances', 'Instances')}: {user.instanceIds.join(', ')}
              </div>
            )}
          </div>
        </div>

        <div className="user-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => showLogoutConfirm ? setShowLogoutModal(true) : handleLogout()}
            disabled={isLoading}
          >
            {isLoading ? t('auth.signingOut', 'Signing out...') : t('auth.signOut', 'Sign Out')}
          </button>
        </div>
      </div>

      {showLogoutConfirm && (
        <Modal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          title={t('auth.confirmSignOut', 'Confirm Sign Out')}
        >
          <div className="logout-confirm-content">
            <p>{t('auth.signOutMessage', 'Are you sure you want to sign out?')}</p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowLogoutModal(false)}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleLogout}
                disabled={isLoading}
              >
                {isLoading ? t('auth.signingOut', 'Signing out...') : t('auth.signOut', 'Sign Out')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}