import { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastProps {
  message: ToastMessage;
  onClose: (id: string) => void;
}

function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    const duration = message.duration || 5000;
    const timer = setTimeout(() => {
      onClose(message.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [message.id, message.duration, onClose]);

  const getBackgroundColor = () => {
    switch (message.type) {
      case 'success': return '#d4edda';
      case 'warning': return '#fff3cd';
      case 'error': return '#f8d7da';
      case 'info': return '#d1ecf1';
    }
  };

  const getBorderColor = () => {
    switch (message.type) {
      case 'success': return '#c3e6cb';
      case 'warning': return '#ffeaa7';
      case 'error': return '#f5c6cb';
      case 'info': return '#bee5eb';
    }
  };

  const getTextColor = () => {
    switch (message.type) {
      case 'success': return '#155724';
      case 'warning': return '#856404';
      case 'error': return '#721c24';
      case 'info': return '#0c5460';
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: getBackgroundColor(),
        border: `1px solid ${getBorderColor()}`,
        borderRadius: '4px',
        padding: '12px 16px',
        marginBottom: '8px',
        color: getTextColor(),
        fontSize: '14px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <button
        onClick={() => onClose(message.id)}
        style={{
          position: 'absolute',
          top: '8px',
          right: '12px',
          background: 'none',
          border: 'none',
          color: getTextColor(),
          cursor: 'pointer',
          fontSize: '18px',
          fontWeight: 'bold',
          padding: '0',
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title="Close"
      >
        ×
      </button>
      
      <div style={{ marginRight: '24px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: message.message ? '4px' : '0' }}>
          {message.title}
        </div>
        {message.message && (
          <div style={{ 
            fontSize: '12px', 
            lineHeight: '1.4',
            whiteSpace: 'pre-line'
          }}>
            {message.message}
          </div>
        )}
      </div>
    </div>
  );
}

interface ToastContainerProps {
  messages: ToastMessage[];
  onClose: (id: string) => void;
}

export function ToastContainer({ messages, onClose }: ToastContainerProps) {
  if (messages.length === 0) return null;

  return (
    <div
      className="toast-container"
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        maxWidth: '400px',
        minWidth: '300px'
      }}
    >
      {messages.map(message => (
        <Toast key={message.id} message={message} onClose={onClose} />
      ))}
    </div>
  );
}