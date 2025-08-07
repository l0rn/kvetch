import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface HamburgerMenuProps {
  onLanguageChange: (language: string) => void;
  currentLanguage: string;
}

export function HamburgerMenu({ onLanguageChange, currentLanguage }: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
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