import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  question?: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  question,
  confirmText,
  cancelText,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="confirm-dialog-overlay">
      <div className="confirm-dialog-content">
        <div className="confirm-dialog-header">
          <h3 className="confirm-dialog-title">
            {title}
          </h3>
          <p className="confirm-dialog-message">
            {message}
          </p>
          {question && (
            <p className="confirm-dialog-question">
              {question}
            </p>
          )}
        </div>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
            style={{ minWidth: '100px' }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn btn-danger"
            style={{ minWidth: '100px' }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}