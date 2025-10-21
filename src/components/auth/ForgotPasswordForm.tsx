import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '../../config/AppConfig';

interface ForgotPasswordFormProps {
  onBack: () => void;
  onSuccess?: () => void;
}

export function ForgotPasswordForm({ onBack, onSuccess }: ForgotPasswordFormProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setMessage({ type: 'error', text: t('auth.emailRequired', 'Email is required') });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const apiUrl = config?.couchDBUrl?.replace('/db', '') || 'http://localhost:3004';
      const response = await fetch(`${apiUrl}/api/request-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({
          type: 'success',
          text: data.message || t('auth.resetEmailSent', 'If an account with this email exists, a password reset link has been sent.')
        });
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setMessage({
          type: 'error',
          text: data.error || t('auth.resetRequestFailed', 'Failed to send reset email. Please try again.')
        });
      }
    } catch (error) {
      console.error('Password reset request failed:', error);
      setMessage({
        type: 'error',
        text: t('auth.resetRequestError', 'Unable to send reset email. Please check your connection and try again.')
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-form-container">
      <div className="login-form-header">
        <h2>{t('auth.forgotPassword', 'Forgot Password?')}</h2>
        <p className="login-form-subtitle">
          {t('auth.forgotPasswordSubtitle', "Enter your email address and we'll send you a link to reset your password.")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="reset-email" className="form-label">
            {t('auth.emailAddress', 'Email Address')}
          </label>
          <input
            type="email"
            id="reset-email"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder', 'Enter your email address')}
          />
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

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBack}
            disabled={isLoading}
          >
            {t('common.back', 'Back')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || !email.trim()}
          >
            {isLoading ? t('auth.sending', 'Sending...') : t('auth.sendResetLink', 'Send Reset Link')}
          </button>
        </div>
      </form>
    </div>
  );
}