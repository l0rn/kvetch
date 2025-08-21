import './InstanceNotFound.css';

interface InstanceNotFoundProps {
  instanceId?: string;
  error?: string;
}

export function InstanceNotFound({ instanceId, error }: InstanceNotFoundProps) {
  return (
    <div className="instance-not-found">
      <div className="instance-not-found-content">
        <div className="error-icon">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="m15 9-6 6"/>
            <path d="m9 9 6 6"/>
          </svg>
        </div>
        
        <h1 className="error-title">Instance Not Found</h1>
        
        <div className="error-details">
          <p className="error-message">
            The requested workspace "{instanceId}" could not be found or is no longer available.
          </p>
          
          {error && (
            <p className="error-technical">
              Technical details: {error}
            </p>
          )}
        </div>
        
        <div className="error-actions">
          <p className="help-text">
            This might happen if:
          </p>
          <ul className="help-list">
            <li>The workspace URL is incorrect</li>
            <li>The workspace has been deactivated</li>
            <li>You don't have access to this workspace</li>
          </ul>
          
          <div className="contact-support">
            <p>Need help? Contact your administrator or support team.</p>
          </div>
        </div>
      </div>
    </div>
  );
}