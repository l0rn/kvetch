import { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Database } from '../storage/database';
import type { ToastMessage } from './Toast';

interface HamburgerMenuProps {
  onLanguageChange: (language: string) => void;
  currentLanguage: string;
  onShowToast: (type: ToastMessage['type'], title: string, message?: string, duration?: number) => void;
}

export function HamburgerMenu({ onLanguageChange, currentLanguage, onShowToast }: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const { t } = useTranslation();

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const isActiveRoute = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleExport = async () => {
    setIsExporting(true);
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
      closeMenu();
    } catch (error) {
      onShowToast('error', t('data.importError', { error: String(error) }));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
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

      closeMenu();

      // Reload page to refresh all data
      setTimeout(() => window.location.reload(), 1000);
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
    <div className="hamburger-menu">
      <button 
        className="hamburger-trigger"
        onClick={toggleMenu}
        aria-label="Menu"
      >
        <div className={`hamburger-icon ${isOpen ? 'open' : ''}`}>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>
      
      {isOpen && <div className="hamburger-overlay" onClick={closeMenu} />}
      
      <nav className={`hamburger-nav ${isOpen ? 'open' : ''}`}>
        <div className="hamburger-nav-content">
          <Link 
            to="/shifts" 
            className={`hamburger-nav-link ${isActiveRoute('/shifts') ? 'active' : ''}`}
            onClick={closeMenu}
          >
            {t('navigation.shifts')}
          </Link>
          <Link 
            to="/staff" 
            className={`hamburger-nav-link ${isActiveRoute('/staff') ? 'active' : ''}`}
            onClick={closeMenu}
          >
            {t('navigation.staff')}
          </Link>
          <Link
            to="/planning"
            className={`hamburger-nav-link ${isActiveRoute('/planning') ? 'active' : ''}`}
            onClick={closeMenu}
          >
            {t('navigation.planning')}
          </Link>
          <Link
            to="/calendar"
            className={`hamburger-nav-link ${isActiveRoute('/calendar') ? 'active' : ''}`}
            onClick={closeMenu}
          >
            {t('navigation.calendar')}
          </Link>

          <div className="hamburger-nav-divider" />

          <div className="hamburger-data-section">
            <button
              className="hamburger-nav-link hamburger-data-btn"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? '...' : t('data.exportData')}
            </button>
            <button
              className="hamburger-nav-link hamburger-data-btn"
              onClick={handleImportClick}
              disabled={isImporting}
            >
              {isImporting ? '...' : t('data.importData')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </div>

          <div className="hamburger-nav-divider" />

          <div className="hamburger-language-section">
            <span className="hamburger-language-label">Language:</span>
            <div className="hamburger-language-switcher">
              <button
                className={`hamburger-language-btn ${currentLanguage === 'en' ? 'active' : ''}`}
                onClick={() => {
                  onLanguageChange('en');
                  closeMenu();
                }}
              >
                EN
              </button>
              <button
                className={`hamburger-language-btn ${currentLanguage === 'de' ? 'active' : ''}`}
                onClick={() => {
                  onLanguageChange('de');
                  closeMenu();
                }}
              >
                DE
              </button>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}