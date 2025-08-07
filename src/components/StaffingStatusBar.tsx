import { useTranslation } from 'react-i18next';
import type { StaffingStatus } from '../utils/staffingStatus';

interface StaffingStatusBarProps {
  status: StaffingStatus;
}

export function StaffingStatusBar({ status }: StaffingStatusBarProps) {
  const { t } = useTranslation();
  const getBackgroundColor = () => {
    switch (status.color) {
      case 'green':
        return '#d4edda';
      case 'orange':
        return '#fff3cd';
      case 'red':
        return '#f8d7da';
      default:
        return '#f8f9fa';
    }
  };

  const getBorderColor = () => {
    switch (status.color) {
      case 'green':
        return '#c3e6cb';
      case 'orange':
        return '#ffeaa7';
      case 'red':
        return '#f5c6cb';
      default:
        return '#dee2e6';
    }
  };

  const getTextColor = () => {
    switch (status.color) {
      case 'green':
        return '#155724';
      case 'orange':
        return '#856404';
      case 'red':
        return '#721c24';
      default:
        return '#6c757d';
    }
  };

  const getIcon = () => {
    switch (status.status) {
      case 'properly-staffed':
        return '✓';
      case 'understaffed':
      case 'not-staffed':
        return '⚠️';
      case 'overstaffed':
        return '⚡';
      case 'constraint-violation':
        return '🚫';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div
      style={{
        backgroundColor: getBackgroundColor(),
        border: `1px solid ${getBorderColor()}`,
        borderRadius: '4px',
        padding: '12px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center'
      }}
    >
      <span style={{ fontSize: '18px', marginRight: '8px' }}>
        {getIcon()}
      </span>
      <div>
        <div style={{ 
          color: getTextColor(), 
          fontWeight: 'bold',
          fontSize: '14px'
        }}>
          {status.message}
        </div>
        {status.missingTraits && status.missingTraits.length > 0 && (
          <div style={{ 
            color: getTextColor(), 
            fontSize: '12px', 
            marginTop: '4px' 
          }}>
            {status.missingTraits.map((trait, index) => (
              <div key={index}>
                • {trait.traitName}: {trait.assigned}/{trait.required} {t('staffing.assigned')}
              </div>
            ))}
          </div>
        )}
        {status.constraintViolations && status.constraintViolations.length > 0 && (
          <div style={{ 
            color: getTextColor(), 
            fontSize: '12px', 
            marginTop: '4px' 
          }}>
            {status.constraintViolations.map((violation, index) => (
              <div key={index} style={{ marginBottom: '2px' }}>
                • <strong>{violation.staffMemberName}</strong> {violation.violationMessage}
                {violation.violationType === 'incompatible-staff' && ' ⚠️'}
                {violation.violationType === 'blocked-time' && ' 🕒'}
                {violation.violationType === 'shift-count' && ' 📊'}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}