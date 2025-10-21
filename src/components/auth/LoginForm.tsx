import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { AppConfigManager } from '../../config/AppConfig';

interface LoginFormProps {
  onSuccess?: () => void;
  instanceName?: string;
}

export function LoginForm({ onSuccess, instanceName }: LoginFormProps) {
  const { t } = useTranslation();
  const { login, isLoading, error } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [currentInstanceName, setCurrentInstanceName] = useState(instanceName);

  useEffect(() => {
    if (!instanceName) {
      // Try to get instance name from config
      const getInstanceName = async () => {
        const config = await AppConfigManager.getConfig();
        if (config.multiUserMode && config?.isSaaSMode) {
          const validation = await AppConfigManager.validateInstance();
          if (validation.valid && validation.instanceName) {
            setCurrentInstanceName(validation.instanceName);
          } else {
            setCurrentInstanceName(config.instanceId || 'Unknown');
          }
        }
      };
      getInstanceName();
    }
  }, [instanceName]);

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
        {currentInstanceName && (
          <div className="instance-branding">
            <span className="instance-label">{t('auth.workspace', 'Workspace')}</span>
            <span className="instance-name">{currentInstanceName}</span>
          </div>
        )}
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
          <div className="auth-error-message" role="alert">
            <div className="error-icon">⚠️</div>
            <div className="error-content">
              <div className="error-title">{t('auth.loginError', 'Login failed')}</div>
              <div className="error-details">{error}</div>
            </div>
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
        <div className="login-help-links">
          <button
            type="button"
            className="forgot-password-link"
            onClick={() => {
              // This will be handled by the parent component
              const event = new CustomEvent('showForgotPassword');
              window.dispatchEvent(event);
            }}
          >
            {t('auth.forgotPassword', 'Forgot Password?')}
          </button>
        </div>
        <p className="login-help-text">
          {t('auth.needHelp', 'Need help signing in? Contact your administrator.')}
        </p>
      </div>
    </div>
  );
}