import { useState, useCallback } from 'react';
import type { ToastMessage } from '../components/Toast';

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((
    type: ToastMessage['type'], 
    title: string, 
    message?: string, 
    duration?: number
  ) => {
    const id = Date.now().toString();
    const newToast: ToastMessage = {
      id,
      type,
      title,
      message,
      duration
    };

    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const success = useCallback((title: string, message?: string, duration?: number) => 
    addToast('success', title, message, duration), [addToast]);
    
  const warning = useCallback((title: string, message?: string, duration?: number) => 
    addToast('warning', title, message, duration), [addToast]);
    
  const error = useCallback((title: string, message?: string, duration?: number) => 
    addToast('error', title, message, duration), [addToast]);
    
  const info = useCallback((title: string, message?: string, duration?: number) => 
    addToast('info', title, message, duration), [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
    success,
    warning,
    error,
    info
  };
}