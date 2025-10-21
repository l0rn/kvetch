import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAppConfig } from '../../config/AppConfig';
import { useToast } from '../../hooks/useToast';

export function EmailVerificationView() {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      verifyEmail(token);
    } else {
      setError(t('emailVerification.noToken', 'No verification token provided'));
      setLoading(false);
    }
  }, [searchParams]);

  const verifyEmail = async (token: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${config?.remote?.couchDBUrl?.replace('/db', '')}/api/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token })
      });

      const result = await response.json();

      if (response.ok) {
        setVerified(true);
        addToast('success', t('emailVerification.success', 'Email verified successfully!'));
        
        // Redirect to settings after 3 seconds
        setTimeout(() => {
          navigate('/settings');
        }, 3000);
      } else {
        throw new Error(result.error || 'Verification failed');
      }
    } catch (error) {
      console.error('Email verification failed:', error);
      setError(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const goToSettings = () => {
    navigate('/settings');
  };

  const goHome = () => {
    navigate('/');
  };

  if (!config?.multiUserMode) {
    return (
      <div className="email-verification-view">
        <div className="verification-container">
          <h1>{t('emailVerification.title', 'Email Verification')}</h1>
          <p>{t('emailVerification.singleUserMode', 'Email verification is not available in single-user mode')}</p>
          <button className="btn btn-primary" onClick={goHome}>
            {t('common.goHome', 'Go Home')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="email-verification-view">
      <div className="verification-container">
        <div className="verification-icon">
          {loading && <div className="spinner large"></div>}
          {!loading && verified && (
            <div className="success-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
            </div>
          )}
          {!loading && error && (
            <div className="error-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
          )}
        </div>

        <h1 className="verification-title">
          {loading && t('emailVerification.verifying', 'Verifying Email...')}
          {!loading && verified && t('emailVerification.success', 'Email Verified!')}
          {!loading && error && t('emailVerification.failed', 'Verification Failed')}
        </h1>

        <div className="verification-message">
          {loading && (
            <p>{t('emailVerification.processing', 'Please wait while we verify your email address...')}</p>
          )}
          
          {!loading && verified && (
            <>
              <p className="success-message">
                {t('emailVerification.successMessage', 'Your email address has been successfully verified. You can now use all features of your account.')}
              </p>
              <p className="redirect-message">
                {t('emailVerification.redirecting', 'You will be redirected to your settings page in a moment...')}
              </p>
            </>
          )}
          
          {!loading && error && (
            <>
              <p className="error-message">
                {error}
              </p>
              <div className="error-help">
                <h3>{t('emailVerification.troubleshoot', 'Troubleshooting')}</h3>
                <ul>
                  <li>{t('emailVerification.linkExpired', 'The verification link may have expired (links are valid for 24 hours)')}</li>
                  <li>{t('emailVerification.alreadyVerified', 'Your email may already be verified')}</li>
                  <li>{t('emailVerification.incorrectLink', 'Make sure you clicked the correct link from your email')}</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="verification-actions">
          {!loading && verified && (
            <button className="btn btn-primary" onClick={goToSettings}>
              {t('emailVerification.goToSettings', 'Go to Settings')}
            </button>
          )}
          
          {!loading && error && (
            <>
              <button className="btn btn-primary" onClick={goToSettings}>
                {t('emailVerification.goToSettings', 'Go to Settings')}
              </button>
              <button className="btn btn-secondary" onClick={goHome}>
                {t('common.goHome', 'Go Home')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}