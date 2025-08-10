import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const { login, isLoading, error } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username.trim() || !formData.password) {
      return;
    }

    const success = await login(formData.username.trim(), formData.password);
    if (success && onSuccess) {
      onSuccess();
    }
  };

  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <div className="login-form-container">
      <div className="login-form-header">
        <h2>{t('auth.signIn', 'Sign In')}</h2>
        <p className="login-form-subtitle">
          {t('auth.signInSubtitle', 'Access your shift planning workspace')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="username" className="form-label">
            {t('auth.username', 'Username')}
          </label>
          <input
            type="text"
            id="username"
            className="form-input"
            value={formData.username}
            onChange={handleInputChange('username')}
            required
            autoComplete="username"
            placeholder={t('auth.usernamePlaceholder', 'Enter your username')}
          />
        </div>

        <div className="form-group">
          <label htmlFor="password" className="form-label">
            {t('auth.password', 'Password')}
          </label>
          <div className="password-input-container">
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              className="form-input"
              value={formData.password}
              onChange={handleInputChange('password')}
              required
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message" role="alert">
            {t('auth.loginError', 'Login failed')}: {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary login-submit"
          disabled={isLoading || !formData.username.trim() || !formData.password}
        >
          {isLoading ? t('auth.signingIn', 'Signing in...') : t('auth.signIn', 'Sign In')}
        </button>
      </form>

      <div className="login-form-footer">
        <p className="login-help-text">
          {t('auth.needHelp', 'Need help signing in? Contact your administrator.')}
        </p>
      </div>
    </div>
  );
}