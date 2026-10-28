import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import apiClient from '../api/client';
import './Register.css';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeEmail, setCodeEmail] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { register } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const passwordMatch = password && confirmPassword && password === confirmPassword;
  const passwordMismatch = confirmPassword && password !== confirmPassword;

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => setResendSeconds(seconds => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const handleSendCode = async () => {
    setError('');
    setSuccess('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(language === 'zh' ? '请先填写有效邮箱' : 'Enter a valid email first');
      return;
    }
    setSendingCode(true);
    try {
      const res = await apiClient.post('/auth/register/send-code', { email: email.trim() });
      setCodeEmail(email.trim().toLowerCase());
      setResendSeconds(res.data.resend_after_seconds || 60);
      setSuccess(language === 'zh' ? '验证码已发送，请查看邮箱（也可检查垃圾邮件）' : 'Code sent. Please check your inbox and spam folder.');
    } catch (err) {
      setError(err.response?.data?.detail || (language === 'zh' ? '发送失败，请稍后重试' : 'Could not send code. Please try again.'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError(language === 'zh' ? '请输入用户名' : 'Username is required');
      return;
    }
    if (!email.trim()) {
      setError(language === 'zh' ? '请输入邮箱' : 'Email is required');
      return;
    }
    if (!referralSource.trim()) {
      setError(language === 'zh' ? '请填写推荐渠道/公司' : 'Referral channel / company is required');
      return;
    }
    if (!password) {
      setError(language === 'zh' ? '请输入密码' : 'Password is required');
      return;
    }
    if (password.length < 6) {
      setError(language === 'zh' ? '密码至少需要 6 位' : 'Password must be at least 6 characters');
      return;
    }
    if (!confirmPassword) {
      setError(language === 'zh' ? '请确认密码' : 'Please confirm your password');
      return;
    }
    if (password !== confirmPassword) {
      setError(language === 'zh' ? '两次密码不一致' : 'Passwords do not match');
      return;
    }
    if (!email.includes('@')) {
      setError(language === 'zh' ? '请输入有效邮箱' : 'Please enter a valid email');
      return;
    }
    if (email.trim().toLowerCase() !== codeEmail || !/^\d{6}$/.test(verificationCode)) {
      setError(language === 'zh' ? '请获取并填写该邮箱收到的 6 位验证码' : 'Enter the 6-digit code sent to this email');
      return;
    }

    try {
      await register(username, email, password, verificationCode, referralSource.trim());
      setSuccess(language === 'zh' ? '注册成功，正在跳转登录...' : 'Registration successful! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if(Array.isArray(detail)){
        setError(detail[0]?.msg || 'Registration failed');
      } else if (typeof detail === 'string') {
        setError(detail);
      } else {
        setError(language === 'zh' ? '注册失败' : 'Registration failed');
      }
    }
  };

  return (
    <div className="register-container">
      <div className="register-content">
        <h1>{t('createNewAccount')}</h1>
        <p className="register-subtitle">{t('alreadyAccount')} <Link to="/login">{t('login')}</Link></p>

        {error && <div className="error-msg">{error}</div>}
        {success && <div className="success-msg">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('username')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              minLength={3}
            />
            {username.length > 0 && username.length < 3 && (
              <span className="field-error">{language === 'zh' ? '至少 3 个字符' : 'At least 3 characters'}</span>
            )}
          </div>

          <div className="form-group">
            <label>{t('email')}</label>
            <div className="input-icon-wrapper">
              <input type="email" value={email} onChange={e => {
                setEmail(e.target.value);
                setVerificationCode('');
                setCodeEmail('');
              }} />
              <span className="input-icon">✉</span>
            </div>
          </div>

          <div className="form-group">
            <label>{language === 'zh' ? '推荐渠道/公司（必填）' : 'Referral channel / company (required)'}</label>
            <input
              type="text"
              value={referralSource}
              onChange={e => setReferralSource(e.target.value)}
              maxLength={160}
              required
              placeholder={language === 'zh' ? '请填写推荐人、渠道或公司名称' : 'Referrer, channel, or company'}
            />
          </div>

          <div className="form-group">
            <label>{language === 'zh' ? '邮箱验证码' : 'Email verification code'}</label>
            <div className="verification-code-row">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder={language === 'zh' ? '输入 6 位验证码' : '6-digit code'}
                value={verificationCode}
                onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button type="button" onClick={handleSendCode} disabled={sendingCode || resendSeconds > 0}>
                {sendingCode ? (language === 'zh' ? '发送中…' : 'Sending…')
                  : resendSeconds > 0 ? `${resendSeconds}s`
                    : (language === 'zh' ? '获取验证码' : 'Send code')}
              </button>
            </div>
            <span className="verification-code-hint">{language === 'zh' ? '验证码 10 分钟内有效' : 'The code expires in 10 minutes'}</span>
          </div>

          <div className="form-group">
            <label>{t('password')}</label>
            <div className="input-icon-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button type="button" className="input-icon-btn" onClick={() => setShowPassword(!showPassword)}>
                {showPassword
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
                }
              </button>
              {password.length >= 6 && <span className="password-valid">✓</span>}
            </div>
            {password.length > 0 && password.length < 6 && (
              <span className="field-error">{language === 'zh' ? '至少 6 位' : 'At least 6 characters'}</span>
            )}
          </div>

          <div className="form-group">
            <label>{t('reenterPassword')}</label>
            <div className="input-icon-wrapper">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
              <button type="button" className="input-icon-btn" onClick={() => setShowConfirm(!showConfirm)}>
                {showConfirm
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
                }
              </button>
              {passwordMatch && <span className="password-valid">✓</span>}
              {passwordMismatch && <span className="password-invalid">✗</span>}
            </div>
            {passwordMismatch && (
              <span className="field-error">{language === 'zh' ? '两次密码不一致' : 'Passwords do not match'}</span>
            )}
          </div>

          <button type="submit" className="btn-register">{t('createAccount')}</button>
        </form>
      </div>
    </div>
  );
}
