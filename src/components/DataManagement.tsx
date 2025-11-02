import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Database } from '../storage/database';
import type { ToastMessage } from './Toast';

interface DataManagementProps {
  onShowToast: (type: ToastMessage['type'], title: string, message?: string, duration?: number) => void;
}

export function DataManagement({ onShowToast }: DataManagementProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const handleExport = async () => {
    setIsExporting(true);
    setShowMenu(false);
    try {
      const jsonData = await Database.exportAllData();

      // Create blob and download
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kvetch-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onShowToast('success', t('data.exportSuccess'));
    } catch (error) {
      onShowToast('error', t('data.importError', { error: String(error) }));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    setShowMenu(false);
    fileInputRef.current?.click();
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const result = await Database.importAllData(text);

      if (result.errors > 0) {
        onShowToast('warning', t('data.importPartialSuccess', result));
      } else {
        onShowToast('success', t('data.importSuccess', result));
      }
    } catch (error) {
      onShowToast('error', t('data.importError', { error: String(error) }));
    } finally {
      setIsImporting(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="data-management">
      <button
        className="data-management-trigger"
        onClick={() => setShowMenu(!showMenu)}
        title={t('data.exportData') + ' / ' + t('data.importData')}
      >
        ⚙
      </button>

      {showMenu && (
        <>
          <div className="data-menu-overlay" onClick={() => setShowMenu(false)} />
          <div className="data-menu">
            <button
              className="data-menu-item"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? '...' : `⬇ ${t('data.exportData')}`}
            </button>
            <button
              className="data-menu-item"
              onClick={handleImportClick}
              disabled={isImporting}
            >
              {isImporting ? '...' : `⬆ ${t('data.importData')}`}
            </button>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImport}
        style={{ display: 'none' }}
      />
    </div>
  );
}
