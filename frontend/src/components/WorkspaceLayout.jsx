import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import apiClient, { apiBase } from '../api/client';
import WorkspaceIcon from './WorkspaceIcon';
import daxiTechLogo from '../assets/daxi-tech-logo.png';
import daxiCloudLogo from '../assets/daxicloud-logo.png';
import './WorkspaceLayout.css';

const userNavigation = {
  zh: [
    { heading: '工作台', items: [
      { to: '/dashboard', label: '控制台', icon: 'dashboard' },
      { to: '/voice-clone', label: '声音克隆', icon: 'mic' },
      { to: '/synthesis', label: '语音合成', icon: 'audio' },
      { to: '/digital-human', label: '数字人', icon: 'human' },
      { to: '/history', label: '生成记录', icon: 'history' },
    ] },
    { heading: '我的', items: [
      { to: '/credits', label: '积分中心', icon: 'credits' },
      { to: '/profile', label: '个人资料', icon: 'profile' },
    ] },
  ],
  en: [
    { heading: 'Workspace', items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { to: '/voice-clone', label: 'Voice clone', icon: 'mic' },
      { to: '/synthesis', label: 'Voice synthesis', icon: 'audio' },
      { to: '/digital-human', label: 'Digital human', icon: 'human' },
      { to: '/history', label: 'History', icon: 'history' },
    ] },
    { heading: 'My account', items: [
      { to: '/credits', label: 'Credits', icon: 'credits' },
      { to: '/profile', label: 'Profile', icon: 'profile' },
    ] },
  ],
};

const pageTitles = {
  zh: { '/dashboard': '控制台', '/voice-clone': '声音克隆', '/digital-human': '数字人空间', '/synthesis': '语音合成', '/history': '生成记录', '/credits': '积分中心', '/profile': '个人资料', '/admin': '管理后台' },
  en: { '/dashboard': 'Dashboard', '/voice-clone': 'Voice clone', '/digital-human': 'Digital human space', '/synthesis': 'Voice synthesis', '/history': 'History', '/credits': 'Credits', '/profile': 'Profile', '/admin': 'Admin' },
};

export default function WorkspaceLayout({ children }) {
  const { token, logout, user } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [creditBalance, setCreditBalance] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const isAdmin = Boolean(user?.is_admin);
  const isAdminPage = location.pathname.startsWith('/admin');
  const isFixedWorkspacePage = ['/voice-clone', '/digital-human', '/synthesis', '/history', '/profile'].includes(location.pathname);
  const title = pageTitles[language][location.pathname] || (language === 'zh' ? '工作台' : 'Workspace');
  const navigation = isAdmin ? [
    { heading: language === 'zh' ? '管理' : 'Administration', items: [
      { to: '/admin', label: language === 'zh' ? '管理后台' : 'Admin dashboard', icon: 'dashboard' },
    ] },
  ] : userNavigation[language];
  const avatarSrc = user?.avatar_filename ? `${apiBase}/static/avatars/${user.avatar_filename}` : '';

  useEffect(() => {
    if (!token || isAdmin) return undefined;
    let active = true;
    const refreshBalance = () => apiClient.get('/billing/me')
      .then(({ data }) => { if (active) setCreditBalance(Number(data.balance) || 0); })
      .catch(() => {});
    refreshBalance();
    const timer = window.setInterval(refreshBalance, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, isAdmin, location.pathname]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleLogout = () => {
    logout();
    setAccountOpen(false);
    navigate('/login');
  };

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <Link to={isAdminPage ? '/admin' : '/dashboard'} className="workspace-brand" aria-label="DAXI 大汐科技与 DaxiCloud 大汐云">
          <img src={daxiTechLogo} alt="DAXI 大汐科技" className="workspace-brand-tech" />
          <span className="workspace-brand-divider" aria-hidden="true" />
          <img src={daxiCloudLogo} alt="DaxiCloud 大汐云" className="workspace-brand-cloud" />
        </Link>
        <button
          type="button"
          className="workspace-menu-toggle"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label={mobileMenuOpen ? (language === 'zh' ? '关闭菜单' : 'Close menu') : (language === 'zh' ? '打开菜单' : 'Open menu')}
          aria-expanded={mobileMenuOpen}
        >
          <WorkspaceIcon name={mobileMenuOpen ? 'close' : 'menu'} />
        </button>
        <div className="workspace-current-page"><span aria-hidden="true" />{title}</div>
        <div className="workspace-topbar-actions">
          {!isAdmin && <Link to="/credits" className="workspace-credit-link">
            <WorkspaceIcon name="credits" size={17} />
            <span>{language === 'zh' ? '积分' : 'Credits'} {creditBalance === null ? '…' : creditBalance.toLocaleString()} · {language === 'zh' ? '充值' : 'Top up'}</span>
          </Link>}
          <button type="button" className="workspace-language" onClick={toggleLanguage} aria-label={language === 'zh' ? 'Switch language to English' : '切换语言为中文'}>
            {language === 'zh' ? '中' : 'EN'}
          </button>
          <div className="workspace-account" ref={accountRef}>
            <button type="button" className="workspace-account-trigger" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen} aria-label={language === 'zh' ? '打开账号菜单' : 'Open account menu'}>
              {avatarSrc ? <img src={avatarSrc} alt="" /> : <span>{(user?.username || 'D').slice(0, 1).toUpperCase()}</span>}
              <span className="workspace-account-name">{user?.username || (language === 'zh' ? '我的账号' : 'Account')}</span>
              <WorkspaceIcon name="chevron" size={15} />
            </button>
            {accountOpen && <div className="workspace-account-menu">
              <div className="workspace-account-meta"><strong>{user?.username || 'DAXI user'}</strong><small>{user?.email || ''}</small></div>
              {!isAdmin && <Link to="/profile" onClick={() => setAccountOpen(false)}>{language === 'zh' ? '个人资料' : 'Profile'}</Link>}
              <button type="button" onClick={handleLogout}><WorkspaceIcon name="logout" size={17} />{language === 'zh' ? '退出登录' : 'Log out'}</button>
            </div>}
          </div>
        </div>
      </header>

      <div className={`workspace-body${isFixedWorkspacePage ? ' workspace-body--fixed-page' : ''}`}>
        <aside className={`workspace-sidebar${mobileMenuOpen ? ' is-open' : ''}`} aria-label={language === 'zh' ? '主导航' : 'Main navigation'}>
          {navigation.map((group) => <section className="workspace-nav-group" key={group.heading}>
            <h2>{group.heading}</h2>
            {group.items.map((item) => <NavLink key={item.to} to={item.to} end className={({ isActive }) => `workspace-nav-link${isActive ? ' is-active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              <WorkspaceIcon name={item.icon} size={19} />
              <span>{item.label}</span>
            </NavLink>)}
          </section>)}
          {!isAdmin && <Link to="/home" className="workspace-back-home">{language === 'zh' ? '返回首页' : 'Back to home'} <WorkspaceIcon name="arrow" size={15} /></Link>}
        </aside>
        {mobileMenuOpen && <button type="button" className="workspace-sidebar-backdrop" aria-label={language === 'zh' ? '关闭导航菜单' : 'Close navigation'} onClick={() => setMobileMenuOpen(false)} />}
        <div className={`workspace-main${isFixedWorkspacePage ? ' workspace-main--fixed-page' : ''}`}>{children}</div>
      </div>
    </div>
  );
}
