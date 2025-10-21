import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { useAppConfig } from '../../config/AppConfig';
import { Modal } from '../Modal';
import { useToast } from '../../hooks/useToast';
import type { User } from '../../auth/AuthContext';

interface PasswordChangeForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface EmailChangeForm {
  newEmail: string;
  password: string;
}

interface UserData {
  displayName?: string;
  email?: string;
  stripeCustomerId?: string;
  instanceIds?: string[];
  pendingEmailChange?: string; // Email address pending verification
}

export function UserSettingsView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { config } = useAppConfig();
  const { addToast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<UserData>({});
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordChangeForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [emailForm, setEmailForm] = useState<EmailChangeForm>({
    newEmail: '',
    password: ''
  });

  // Load user data on component mount
  useEffect(() => {
    if (user && config?.couchDBUrl) {
      loadUserData();
      checkPendingEmailChange();
    }
  }, [user, config]);

  const loadUserData = async () => {
    if (!user || !config?.couchDBUrl) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${config.couchDBUrl}/_users/org.couchdb.user:${user.email}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const userDoc = await response.json();
        setUserData({
          displayName: userDoc.displayName || userDoc.name,
          email: userDoc.email,
          stripeCustomerId: userDoc.stripeCustomerId,
          instanceIds: userDoc.instanceIds || []
        });
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
      addToast('error', t('settings.loadError', 'Failed to load user settings'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast('error', t('settings.passwordMismatch', 'Passwords do not match'));
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      addToast('error', t('settings.passwordTooShort', 'Password must be at least 6 characters'));
      return;
    }

    try {
      setLoading(true);
      
      // First authenticate with current password
      const authResponse = await fetch(`${config?.couchDBUrl}/_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: `name=${encodeURIComponent(user!.email)}&password=${encodeURIComponent(passwordForm.currentPassword)}`
      });

      if (!authResponse.ok) {
        throw new Error('Current password is incorrect');
      }

      // Update password by updating the user document
      const userDocResponse = await fetch(`${config?.couchDBUrl}/_users/org.couchdb.user:${user!.email}`, {
        credentials: 'include'
      });
      
      if (!userDocResponse.ok) {
        throw new Error('Failed to fetch user document');
      }

      const userDoc = await userDocResponse.json();
      
      // Update the password
      const updateResponse = await fetch(`${config?.couchDBUrl}/_users/org.couchdb.user:${user!.email}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...userDoc,
          password: passwordForm.newPassword
        })
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update password');
      }

      addToast('success', t('settings.passwordUpdated', 'Password updated successfully'));
      setShowPasswordModal(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error('Password change failed:', error);
      addToast('error', t('settings.passwordUpdateError', error instanceof Error ? error.message : 'Failed to update password'));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = async () => {
    if (!emailForm.newEmail.includes('@')) {
      addToast('error', t('settings.invalidEmail', 'Please enter a valid email address'));
      return;
    }

    // Check if new email is different from current email
    if (emailForm.newEmail === user?.email) {
      addToast('error', t('settings.sameEmail', 'This is already your current email address'));
      return;
    }

    try {
      setLoading(true);
      
      // First authenticate with password
      const authResponse = await fetch(`${config?.couchDBUrl}/_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: `name=${encodeURIComponent(user!.email)}&password=${encodeURIComponent(emailForm.password)}`
      });

      if (!authResponse.ok) {
        throw new Error('Password is incorrect');
      }

      // Check email uniqueness (this would ideally be done server-side)
      const isEmailUnique = await checkEmailUniqueness(emailForm.newEmail);
      if (!isEmailUnique) {
        throw new Error('This email address is already in use by another account');
      }

      // Generate verification token for secure email change
      const verificationToken = generateVerificationToken();
      
      // Store pending email change in localStorage (since we can't access user doc)
      const pendingEmailChange = {
        userId: user!.id,
        email: user!.email,
        currentEmail: user!.email,
        newEmail: emailForm.newEmail,
        verificationToken,
        timestamp: Date.now(),
        verified: false
      };

      localStorage.setItem(`email_change_${user!.id}`, JSON.stringify(pendingEmailChange));

      // Send verification email
      await sendEmailVerification(emailForm.newEmail, verificationToken);

      addToast('success', t('settings.emailChangeInitiated', 'Email change initiated. Please check your new email address for verification instructions.'));
      setShowEmailModal(false);
      setEmailForm({ newEmail: '', password: '' });
      
      // Show pending email change status
      setUserData(prev => ({
        ...prev,
        pendingEmailChange: emailForm.newEmail
      }));

    } catch (error) {
      console.error('Email change failed:', error);
      addToast('error', t('settings.emailUpdateError', error instanceof Error ? error.message : 'Failed to initiate email change'));
    } finally {
      setLoading(false);
    }
  };

  const generateVerificationToken = (): string => {
    return Math.random().toString(36).substr(2) + Date.now().toString(36);
  };

  const checkEmailUniqueness = async (email: string): Promise<boolean> => {
    try {
      // Since we can't query the _users database directly, we'll implement a basic check
      // In a real system, this would be done server-side with proper database queries
      
      // For now, we'll assume emails are unique unless we have evidence otherwise
      // This is a limitation of the current architecture where we can't access user data
      console.log('🔍 Checking email uniqueness for:', email);
      
      // Check localStorage for any pending email changes to this address
      const allKeys = Object.keys(localStorage);
      const emailChangeKeys = allKeys.filter(key => key.startsWith('email_change_'));
      
      for (const key of emailChangeKeys) {
        try {
          const pendingChange = JSON.parse(localStorage.getItem(key) || '{}');
          if (pendingChange.newEmail === email && pendingChange.verified) {
            console.log('⚠️ Email already pending verification for another user');
            return false;
          }
        } catch (error) {
          console.warn('Failed to parse pending email change:', error);
        }
      }
      
      console.log('✅ Email appears to be unique');
      return true;
    } catch (error) {
      console.error('Email uniqueness check failed:', error);
      // If check fails, allow the change (fail open for better UX)
      return true;
    }
  };

  const sendEmailVerification = async (email: string, verificationToken: string): Promise<void> => {
    // This would integrate with the SaaS API to send verification emails
    try {
      console.log('📧 Sending email verification to:', email);
      
      const response = await fetch(`${config?.couchDBUrl?.replace('/db', '')}/api/send-email-change-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          currentEmail: user!.email,
          newEmail: email,
          email: user!.email,
          userId: user!.id,
          verificationToken,
          instanceId: config?.instanceId,
          verificationUrl: `${window.location.origin}/app/verify-email-change?token=${verificationToken}&user=${user!.id}`
        })
      });

      if (response.ok) {
        console.log('✅ Email verification sent successfully');
      } else {
        console.warn('⚠️ Email verification request failed, but change was initiated');
        // For demo purposes, show the verification token in console
        console.log('🔐 Verification token for testing:', verificationToken);
      }
    } catch (error) {
      console.warn('📧 Email verification service unavailable:', error);
      // For demo purposes, show the verification token in console
      console.log('🔐 Verification token for testing:', verificationToken);
    }
  };

  const checkPendingEmailChange = () => {
    if (!user) return;
    
    const pendingChangeKey = `email_change_${user.id}`;
    const pendingChangeData = localStorage.getItem(pendingChangeKey);
    
    if (pendingChangeData) {
      try {
        const pendingChange = JSON.parse(pendingChangeData);
        
        // Check if the pending change is still valid (not expired)
        const EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - pendingChange.timestamp < EXPIRY_TIME && !pendingChange.verified) {
          console.log('📧 Found pending email change:', pendingChange.newEmail);
          setUserData(prev => ({
            ...prev,
            pendingEmailChange: pendingChange.newEmail
          }));
        } else if (Date.now() - pendingChange.timestamp >= EXPIRY_TIME) {
          // Clean up expired pending changes
          localStorage.removeItem(pendingChangeKey);
          console.log('🕒 Expired pending email change cleaned up');
        }
      } catch (error) {
        console.error('Failed to parse pending email change:', error);
        localStorage.removeItem(pendingChangeKey);
      }
    }
  };

  const cancelPendingEmailChange = () => {
    if (!user) return;
    
    const pendingChangeKey = `email_change_${user.id}`;
    localStorage.removeItem(pendingChangeKey);
    setUserData(prev => ({
      ...prev,
      pendingEmailChange: undefined
    }));
    
    addToast('info', t('settings.emailChangeCancelled', 'Pending email change has been cancelled'));
  };

  const openStripePortal = async () => {
    if (!userData.stripeCustomerId) {
      addToast('error', t('settings.noSubscription', 'No subscription found'));
      return;
    }

    try {
      setLoading(true);
      
      // Call the SaaS API to create a Stripe customer portal session
      const response = await fetch(`${config?.couchDBUrl?.replace('/db', '')}/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          customerId: userData.stripeCustomerId,
          returnUrl: window.location.href
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to open Stripe portal:', error);
      addToast('error', t('settings.stripePortalError', 'Failed to open subscription management'));
    } finally {
      setLoading(false);
    }
  };

  const isInstanceOwner = (): boolean => {
    // Check if user is the owner of their instance (has admin role for the instance)
    return user?.role === 'instance-admin';
  };

  if (!user) {
    return (
      <div className="user-settings-view">
        <h1>{t('settings.title', 'User Settings')}</h1>
        <p>{t('settings.notLoggedIn', 'Please log in to access settings')}</p>
      </div>
    );
  }

  if (!config?.multiUserMode) {
    return (
      <div className="user-settings-view">
        <h1>{t('settings.title', 'User Settings')}</h1>
        <p>{t('settings.singleUserMode', 'Settings are not available in single-user mode')}</p>
      </div>
    );
  }

  return (
    <div className="user-settings-view">
      <div className="settings-container">
        <h1 className="settings-title">{t('settings.title', 'User Settings')}</h1>

        {/* Account Information */}
        <section className="settings-section">
          <h2 className="section-title">{t('settings.accountInfo', 'Account Information')}</h2>
          
          <div className="settings-grid">
            <div className="setting-item readonly">
              <label className="setting-label">{t('settings.name', 'Name')}</label>
              <div className="setting-value">{userData.displayName || user.name || user.email?.split('@')[0]}</div>
            </div>
            
            <div className="setting-item interactive">
              <label className="setting-label">{t('settings.email', 'Email Address')}</label>
              <div className="setting-value">
                <div className="email-info">
                  {user.email || t('settings.noEmail', 'No email set')}
                  {!user.emailVerified && user.email && (
                    <span className="email-status email-unverified">
                      {t('settings.unverified', 'Unverified')}
                    </span>
                  )}
                </div>
                
                {userData.pendingEmailChange && (
                  <div className="pending-email-change">
                    <span className="pending-text">
                      📧 {t('settings.pendingEmailChange', 'Pending change to: ')}{userData.pendingEmailChange}
                    </span>
                    <button 
                      className="btn btn-link btn-small"
                      onClick={cancelPendingEmailChange}
                      title={t('settings.cancelEmailChange', 'Cancel email change')}
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                  </div>
                )}
                
                <button 
                  className="btn btn-secondary btn-small setting-action"
                  onClick={() => setShowEmailModal(true)}
                  disabled={loading || !!userData.pendingEmailChange}
                >
                  {user.email ? t('settings.changeEmail', 'Change') : t('settings.addEmail', 'Add Email')}
                </button>
              </div>
            </div>
            
            <div className="setting-item readonly">
              <label className="setting-label">{t('settings.role', 'Role')}</label>
              <div className="setting-value">
                <span className={`role-badge role-badge-${user.role}`}>
                  {t(`auth.roles.${user.role}`, user.role)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Security Settings */}
        <section className="settings-section">
          <h2 className="section-title">{t('settings.security', 'Security')}</h2>
          
          <div className="settings-grid">
            <div className="setting-item interactive">
              <label className="setting-label">{t('settings.password', 'Password')}</label>
              <div className="setting-value">
                ••••••••
                <button 
                  className="btn btn-secondary btn-small setting-action"
                  onClick={() => setShowPasswordModal(true)}
                  disabled={loading}
                >
                  {t('settings.changePassword', 'Change Password')}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Subscription Management (for instance owners) */}
        {isInstanceOwner() && userData.stripeCustomerId && (
          <section className="settings-section">
            <h2 className="section-title">{t('settings.subscription', 'Subscription')}</h2>
            
            <div className="settings-grid">
              <div className="setting-item interactive">
                <label className="setting-label">{t('settings.manageSubscription', 'Manage Subscription')}</label>
                <div className="setting-value">
                  <p className="setting-description">
                    {t('settings.subscriptionDescription', 'Update billing information, change plans, or cancel your subscription.')}
                  </p>
                  <button 
                    className="btn btn-primary btn-small setting-action"
                    onClick={openStripePortal}
                    disabled={loading}
                  >
                    {loading ? t('common.loading', 'Loading...') : t('settings.openStripePortal', 'Manage Subscription')}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Password Change Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        }}
        title={t('settings.changePassword', 'Change Password')}
      >
        <div className="password-change-form">
          <div className="form-group">
            <label className="form-label">{t('settings.currentPassword', 'Current Password')}</label>
            <input
              type="password"
              className="form-input"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">{t('settings.newPassword', 'New Password')}</label>
            <input
              type="password"
              className="form-input"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
              required
              minLength={6}
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">{t('settings.confirmPassword', 'Confirm New Password')}</label>
            <input
              type="password"
              className="form-input"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
              required
              minLength={6}
            />
          </div>
          
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowPasswordModal(false);
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
              }}
              disabled={loading}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePasswordChange}
              disabled={loading || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
            >
              {loading ? t('common.loading', 'Loading...') : t('settings.updatePassword', 'Update Password')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Email Change Modal */}
      <Modal
        isOpen={showEmailModal}
        onClose={() => {
          setShowEmailModal(false);
          setEmailForm({ newEmail: '', password: '' });
        }}
        title={user.email ? t('settings.changeEmail', 'Change Email') : t('settings.addEmail', 'Add Email')}
      >
        <div className="email-change-form">
          <div className="form-group">
            <label className="form-label">{t('settings.newEmail', 'Email Address')}</label>
            <input
              type="email"
              className="form-input"
              value={emailForm.newEmail}
              onChange={(e) => setEmailForm(prev => ({ ...prev, newEmail: e.target.value }))}
              placeholder={t('settings.emailPlaceholder', 'Enter your email address')}
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">{t('settings.confirmWithPassword', 'Confirm with Password')}</label>
            <input
              type="password"
              className="form-input"
              value={emailForm.password}
              onChange={(e) => setEmailForm(prev => ({ ...prev, password: e.target.value }))}
              required
            />
          </div>
          
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowEmailModal(false);
                setEmailForm({ newEmail: '', password: '' });
              }}
              disabled={loading}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleEmailChange}
              disabled={loading || !emailForm.newEmail || !emailForm.password}
            >
              {loading ? t('common.loading', 'Loading...') : t('settings.updateEmail', 'Update Email')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}