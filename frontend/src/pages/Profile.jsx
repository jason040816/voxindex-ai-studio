import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import apiClient, { apiBase } from '../api/client';
import './Profile.css';

const copy = {
  zh: {
    title: '个人资料', subtitle: '管理你的账号信息与头像。', account: '账号设置', accountHint: '更新后会安全保存到你的账号。',
    upload: '更换头像', remove: '移除头像', name: '姓名', email: '邮箱', password: '密码', changePassword: '修改密码',
    newPassword: '新密码（至少 6 位）', confirmPassword: '再次输入新密码', cancelPassword: '取消修改', save: '保存更改', saving: '保存中…',
    confirmTitle: '确认保存', confirmText: '确定保存这些账号资料吗？', cancel: '返回修改', confirm: '确认保存',
    requiredName: '请填写姓名。', requiredEmail: '请填写邮箱。', requiredPassword: '请输入新密码。', shortPassword: '密码至少需要 6 位。', mismatch: '两次输入的密码不一致。',
    saved: '资料已保存。', renamed: '用户名已更改，请重新登录。', failed: '保存失败，请稍后重试。',
  },
  en: {
    title: 'Profile', subtitle: 'Manage your account details and profile photo.', account: 'Account settings', accountHint: 'Your changes are saved securely to your account.',
    upload: 'Change photo', remove: 'Remove photo', name: 'Name', email: 'Email', password: 'Password', changePassword: 'Change password',
    newPassword: 'New password (at least 6 characters)', confirmPassword: 'Confirm new password', cancelPassword: 'Cancel password change', save: 'Save changes', saving: 'Saving…',
    confirmTitle: 'Confirm changes', confirmText: 'Are you sure you want to save these account details?', cancel: 'Go back', confirm: 'Save changes',
    requiredName: 'Please enter your name.', requiredEmail: 'Please enter your email.', requiredPassword: 'Please enter a new password.', shortPassword: 'Password must be at least 6 characters.', mismatch: 'The passwords do not match.',
    saved: 'Your profile has been saved.', renamed: 'Your username changed. Please log in again.', failed: 'Could not save your changes. Please try again.',
  },
};

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const { language } = useLanguage();
  const text = copy[language];
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  useEffect(() => {
    setUsername(user?.username || '');
    setEmail(user?.email || '');
  }, [user?.username, user?.email]);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const handleSaveClick = (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!username.trim()) { setError(text.requiredName); return; }
    if (!email.trim()) { setError(text.requiredEmail); return; }
    if (showPasswordFields) {
      if (!password) { setError(text.requiredPassword); return; }
      if (password.length < 6) { setError(text.shortPassword); return; }
      if (password !== confirmPassword) { setError(text.mismatch); return; }
    }
    setShowConfirmDialog(true);
  };

  const handleConfirmedSubmit = async () => {
    setShowConfirmDialog(false);
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await apiClient.patch('/auth/me', {
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        password: showPasswordFields && password ? password : undefined,
      });

      if (removeAvatar) {
        if (user?.avatar_filename) await apiClient.delete('/auth/me/avatar');
        setRemoveAvatar(false);
      }
      if (avatarFile) {
        const formData = new FormData();
        formData.append('file', avatarFile);
        await apiClient.post('/auth/me/avatar', formData);
        setAvatarFile(null);
        setAvatarPreview(null);
      }

      setPassword('');
      setConfirmPassword('');
      setShowPasswordFields(false);
      if (username.trim() !== user?.username) {
        setSuccess(text.renamed);
        window.setTimeout(() => {
          logout();
          window.location.href = '/login';
        }, 1500);
        return;
      }
      await refreshUser();
      setSuccess(text.saved);
    } catch (err) {
      setError(err.response?.data?.detail || text.failed);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAvatarSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setRemoveAvatar(false);
    event.target.value = '';
  };

  const hasAvatar = Boolean((user?.avatar_filename || avatarPreview) && !removeAvatar);
  const avatarSrc = avatarPreview || (user?.avatar_filename && !removeAvatar ? `${apiBase}/static/avatars/${user.avatar_filename}` : '');
  const initial = (username || user?.username || 'D').trim().slice(0, 1).toUpperCase();

  return (
    <main className="profile-page">
      <header className="profile-page-heading">
        <div><h1>{text.title}</h1><p>{text.subtitle}</p></div>
      </header>

      <section className="profile-card">
        <aside className="profile-summary">
          <div className="profile-avatar-wrap">
            {avatarSrc ? <img src={avatarSrc} alt="" className="profile-avatar-img" /> : <span className="profile-avatar-fallback">{initial}</span>}
            <label className="profile-avatar-edit" title={text.upload} aria-label={text.upload}>
              <span aria-hidden="true">✎</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarSelect} />
            </label>
          </div>
          <h2>{username || user?.username || text.name}</h2>
          <p>{email || user?.email || ''}</p>
          {hasAvatar && <button type="button" className="profile-remove-avatar" onClick={() => { setRemoveAvatar(true); setAvatarFile(null); setAvatarPreview(null); }}>{text.remove}</button>}
          {removeAvatar && <button type="button" className="profile-undo-avatar" onClick={() => setRemoveAvatar(false)}>{language === 'zh' ? '撤销移除' : 'Undo remove'}</button>}
        </aside>

        <div className="profile-form-side">
          <div className="profile-form-heading"><span className="profile-step">01</span><div><h2>{text.account}</h2><p>{text.accountHint}</p></div></div>
          {error && <div className="profile-message is-error" role="alert">{error}</div>}
          {success && <div className="profile-message is-success" role="status">{success}</div>}
          <form onSubmit={handleSaveClick}>
            <label className="profile-field"><span>{text.name}</span><input type="text" autoComplete="name" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label className="profile-field"><span>{text.email}</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <div className="profile-password-field">
              <span>{text.password}</span>
              {!showPasswordFields ? (
                <button type="button" className="profile-change-pw" onClick={() => setShowPasswordFields(true)}>{text.changePassword}</button>
              ) : (
                <div className="profile-pw-fields">
                  <input type="password" autoComplete="new-password" value={password} placeholder={text.newPassword} onChange={(event) => setPassword(event.target.value)} />
                  <input type="password" autoComplete="new-password" value={confirmPassword} placeholder={text.confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                  <button type="button" className="profile-cancel-pw" onClick={() => { setShowPasswordFields(false); setPassword(''); setConfirmPassword(''); }}>{text.cancelPassword}</button>
                </div>
              )}
            </div>
            <div className="profile-actions"><button type="submit" className="profile-save" disabled={submitting}>{submitting ? text.saving : text.save}<span aria-hidden="true">→</span></button></div>
          </form>
        </div>
      </section>

      {showConfirmDialog && (
        <div className="profile-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowConfirmDialog(false); }}>
          <section className="profile-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-confirm-title">
            <span className="profile-step">✓</span><h2 id="profile-confirm-title">{text.confirmTitle}</h2><p>{text.confirmText}</p>
            <div className="profile-confirm-actions"><button type="button" className="profile-cancel" onClick={() => setShowConfirmDialog(false)}>{text.cancel}</button><button type="button" className="profile-save" onClick={handleConfirmedSubmit}>{text.confirm}</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
