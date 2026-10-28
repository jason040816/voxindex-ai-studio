import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './Login.css';

export default function ForgotPassword() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isZh = language === 'zh';
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sendCode = async () => {
    setError('');
    setSuccess('');
    if (!email.trim()) {
      setError(isZh ? '请输入注册邮箱' : 'Enter your account email');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/auth/forgot-password/send-code', { email: email.trim() });
      setCodeSent(true);
      setSuccess(isZh ? '如果该邮箱已注册，验证码已发送，请查收邮件（也可检查垃圾邮件）' : 'If the email is registered, a code has been sent. Check your inbox and spam folder.');
    } catch (err) {
      setError(err.response?.data?.detail || (isZh ? '验证码发送失败，请稍后重试' : 'Could not send the code. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!/^\d{6}$/.test(verificationCode)) {
      setError(isZh ? '请输入 6 位邮箱验证码' : 'Enter the 6-digit email code');
      return;
    }
    if (newPassword.length < 6) {
      setError(isZh ? '密码至少需要 6 位' : 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(isZh ? '两次密码不一致' : 'Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', {
        email: email.trim(),
        verification_code: verificationCode,
        new_password: newPassword,
      });
      setSuccess(isZh ? '密码已重置，正在返回登录…' : 'Password reset. Returning to sign in…');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.response?.data?.detail || (isZh ? '密码重置失败' : 'Could not reset your password'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{isZh ? '忘记密码' : <>Forgot <span className="accent">Password</span></>}</h2>
        {error && <div className="error-msg">{error}</div>}
        {success && <div className="success-msg">{success}</div>}
        <div className="form-group">
          <label>{isZh ? '注册邮箱' : 'Account email'}</label>
          <input type="email" value={email} onChange={event => { setEmail(event.target.value); setCodeSent(false); }} disabled={submitting || codeSent} required />
        </div>
        {!codeSent ? (
          <button type="button" className="btn-login" onClick={sendCode} disabled={submitting}>
            {submitting ? (isZh ? '发送中…' : 'Sending…') : (isZh ? '发送邮箱验证码' : 'Send email code')}
          </button>
        ) : (
          <form onSubmit={resetPassword}>
            <div className="form-group">
              <label>{isZh ? '邮箱验证码' : 'Email verification code'}</label>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={verificationCode} onChange={event => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required />
              <span className="verification-code-hint">{isZh ? '验证码 10 分钟内有效' : 'The code expires in 10 minutes'}</span>
            </div>
            <div className="form-group">
              <label>{isZh ? '新密码' : 'New password'}</label>
              <input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={6} required />
            </div>
            <div className="form-group">
              <label>{isZh ? '确认新密码' : 'Confirm new password'}</label>
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={6} required />
            </div>
            <button type="submit" className="btn-login" disabled={submitting}>
              {submitting ? (isZh ? '处理中…' : 'Saving…') : (isZh ? '验证并重置密码' : 'Verify and reset password')}
            </button>
            <button type="button" className="btn-login" onClick={sendCode} disabled={submitting} style={{ marginTop: 10 }}>
              {isZh ? '重新发送验证码' : 'Resend code'}
            </button>
          </form>
        )}
        <p className="register-text"><Link to="/login">{isZh ? '返回登录' : 'Back to Login'}</Link></p>
      </div>
    </div>
  );
}
