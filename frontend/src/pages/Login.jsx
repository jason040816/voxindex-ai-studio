import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) {
      setError(language === 'zh' ? '请输入用户名' : 'Username is required');
      return;
    }
    if (!password) {
      setError(language === 'zh' ? '请输入密码' : 'Password is required');
      return;
    }
    try {
      const result = await login(username, password);
      navigate(result.is_admin ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || (language === 'zh' ? '登录失败，请检查账号和密码' : 'Login failed'));
    }
  };

return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{t('signIn')} <span className="accent">DAXI</span></h2>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('username')}</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{t('password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <div className="forgot-password"><Link to="/forgot-password">{t('forgotPassword')}</Link></div>
          </div>
          <button type="submit" className="btn-login">{t('login')}</button>
        </form>
        <p className="register-text">{t('noAccount')} <Link to="/register">{t('register')}</Link></p>
      </div>
    </div>
  );
}
