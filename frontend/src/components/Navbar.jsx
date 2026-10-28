import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import apiClient, { apiBase } from '../api/client';
import './Navbar.css';
import daxiTechLogo from '../assets/daxi-tech-logo.png';
import daxiCloudLogo from '../assets/daxicloud-logo.png';

export default function Navbar() {
  const { token, logout, user } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [creditBalance, setCreditBalance] = useState(null);
  const dropdownRef = useRef(null);
  const isHome = location.pathname === '/home';
  const workspacePaths = ['/dashboard', '/synthesis', '/voice-clone', '/digital-human', '/history', '/admin', '/profile', '/credits'];
  const isWorkspace = Boolean(token) && workspacePaths.includes(location.pathname);
  const avatarSrc = user?.avatar_filename
    ? `${apiBase}/static/avatars/${user.avatar_filename}`
    : `https://api.dicebear.com/7.x/initials/svg?seed=${user?.username || 'user'}`;

  useEffect(() => {
    if (!token || user?.is_admin || isWorkspace) return undefined;
    let active = true;
    const refreshBalance = () => apiClient.get('/billing/me')
      .then(({ data }) => { if (active) setCreditBalance(Number(data.balance) || 0); })
      .catch(() => {});
    refreshBalance();
    const timer = window.setInterval(refreshBalance, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, user?.is_admin, isWorkspace, location.pathname]);

  const scrollToAbout = () => {
    setMobileMenuOpen(false);
    if (!isHome) {
      navigate('/home');
      setTimeout(() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }), 250);
      return;
    }
    document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setDropdownOpen(false);
  };

  if (isWorkspace) return null;

  return (
    <nav className={`navbar${isHome ? ' navbar-home' : ''}`}>
      <Link to="/home" className="navbar-brand" aria-label="DAXI 大汐科技与 DaxiCloud 大汐云">
        <img src={daxiTechLogo} alt="DAXI 大汐科技" className="navbar-logo navbar-logo-tech" />
        <span className="navbar-brand-divider" aria-hidden="true" />
        <img src={daxiCloudLogo} alt="DaxiCloud 大汐云" className="navbar-logo navbar-logo-cloud" />
      </Link>

      <button
        type="button"
        className="mobile-menu-button"
        onClick={() => setMobileMenuOpen(current => !current)}
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileMenuOpen}
      >
        <span />
        <span />
        <span />
      </button>

      <div className={`navbar-links${mobileMenuOpen ? ' is-open' : ''}`} onClick={() => setMobileMenuOpen(false)}>
        <Link to="/home">{t('home')}</Link>
        {token && !user?.is_admin && <Link to="/dashboard">{t('dashboard')}</Link>}
        {token && <Link to="/voice-clone">{language === 'zh' ? '声音克隆' : 'Voice Clone'}</Link>}
        {token && !user?.is_admin && <Link to="/digital-human">{language === 'zh' ? '数字人' : 'Digital Human'}</Link>}
        {token && !user?.is_admin && <Link to="/synthesis">{t('synthesis')}</Link>}
        {token && !user?.is_admin && <Link to="/history">{t('history')}</Link>}
        {token && !user?.is_admin && <Link className="navbar-credits" to="/credits">{language === 'zh' ? `积分 ${creditBalance === null ? '…' : creditBalance.toLocaleString()}` : `Credits ${creditBalance === null ? '…' : creditBalance.toLocaleString()}`} · {language === 'zh' ? '充值' : 'Top up'}</Link>}
        <button type="button" className="navbar-link-btn" onClick={scrollToAbout}>{t('about')}</button>
        {token && user?.is_admin && <Link to="/admin">{t('admin')}</Link>}
        {!token && <Link className="navbar-login" to="/login">{t('login')}</Link>}
        {!token && <Link className="navbar-register" to="/register">{t('register')}</Link>}
        <button type="button" className="language-toggle" onClick={toggleLanguage} aria-label={t('language')}>
          {language === 'zh' ? 'EN' : '中'}
        </button>
      </div>

      {token && (
        <div className="navbar-profile" ref={dropdownRef}>
          <button type="button" className="profile-avatar" onClick={() => setDropdownOpen(current => !current)} aria-label="Account">
            <img src={avatarSrc} alt="avatar" />
          </button>
          {dropdownOpen && (
            <div className="profile-dropdown">
              <div className="dropdown-header">
                <img src={avatarSrc} alt="avatar" className="dropdown-avatar" />
                <div>
                  <div className="dropdown-name">{user?.username || 'DAXI user'}</div>
                  <div className="dropdown-email">{user?.email || ''}</div>
                </div>
              </div>
              <div className="dropdown-divider" />
              {!user?.is_admin && <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)}>{language === 'zh' ? '个人资料' : 'Profile'}</Link>}
              <button className="dropdown-item" onClick={handleLogout}>{t('logout')}</button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
