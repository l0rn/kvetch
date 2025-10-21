import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../../config/AppConfig';

interface ResetPasswordFormProps {
  token: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function ResetPasswordForm({ token, onSuccess, onError }: ResetPasswordFormProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Validate token on component mount
  useEffect(() => {
    if (!token) {
      setMessage({
        type: 'error',
        text: t('auth.invalidResetToken', 'Invalid reset token. Please request a new password reset.')
      });
      if (onError) {
        onError('Invalid reset token');
      }
    }
  }, [token, t, onError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.newPassword.trim() || !formData.confirmPassword.trim()) {
      setMessage({ type: 'error', text: t('auth.passwordsRequired', 'Both password fields are required') });
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setMessage({ type: 'error', text: t('auth.passwordMismatch', 'Passwords do not match') });
      return;
    }

    if (formData.newPassword.length < 6) {
      setMessage({ type: 'error', text: t('auth.passwordTooShort', 'Password must be at least 6 characters long') });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const apiUrl = config?.couchDBUrl?.replace('/db', '') || 'http://localhost:3004';
      const response = await fetch(`${apiUrl}/api/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          token: token,
          newPassword: formData.newPassword 
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({
          type: 'success',
          text: data.message || t('auth.passwordResetSuccess', 'Your password has been reset successfully! You can now log in with your new password.')
        });
        setFormData({ newPassword: '', confirmPassword: '' });
        if (onSuccess) {
          onSuccess();
        }
      } else {
        const errorMessage = data.error || t('auth.passwordResetFailed', 'Failed to reset password. Please try again.');
        setMessage({
          type: 'error',
          text: errorMessage
        });
        if (onError) {
          onError(errorMessage);
        }
      }
    } catch (error) {
      console.error('Password reset failed:', error);
      const errorMessage = t('auth.passwordResetError', 'Unable to reset password. Please check your connection and try again.');
      setMessage({
        type: 'error',
        text: errorMessage
      });
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    // Clear message when user starts typing
    if (message) {
      setMessage(null);
    }
  };

  return (
    <div className="login-form-container">
      <div className="login-form-header">
        <h2>{t('auth.resetPassword', 'Reset Password')}</h2>
        <p className="login-form-subtitle">
          {t('auth.resetPasswordSubtitle', 'Enter your new password below.')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="new-password" className="form-label">
            {t('auth.newPassword', 'New Password')}
          </label>
          <div className="password-input-container">
            <input
              type={showPasswords ? 'text' : 'password'}
              id="new-password"
              className="form-input"
              value={formData.newPassword}
              onChange={handleInputChange('newPassword')}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder={t('auth.newPasswordPlaceholder', 'Enter your new password')}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPasswords(!showPasswords)}
              tabIndex={-1}
            >
              {showPasswords ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="confirm-password" className="form-label">
            {t('auth.confirmPassword', 'Confirm Password')}
          </label>
          <div className="password-input-container">
            <input
              type={showPasswords ? 'text' : 'password'}
              id="confirm-password"
              className="form-input"
              value={formData.confirmPassword}
              onChange={handleInputChange('confirmPassword')}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder={t('auth.confirmPasswordPlaceholder', 'Confirm your new password')}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPasswords(!showPasswords)}
              tabIndex={-1}
            >
              {showPasswords ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`auth-message ${message.type === 'error' ? 'auth-error-message' : 'auth-success-message'}`} role="alert">
            <div className={`message-icon ${message.type === 'error' ? 'error-icon' : 'success-icon'}`}>
              {message.type === 'error' ? '⚠️' : '✅'}
            </div>
            <div className="message-content">
              <div className="message-text">{message.text}</div>
            </div>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary login-submit"
          disabled={isLoading || !formData.newPassword.trim() || !formData.confirmPassword.trim()}
        >
          {isLoading ? t('auth.resettingPassword', 'Resetting Password...') : t('auth.resetPasswordButton', 'Reset Password')}
        </button>
      </form>
    </div>
  );
}