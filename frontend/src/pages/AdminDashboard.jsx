import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './AdminDashboard.css';
import BillingAdmin from './BillingAdmin';
import ApiAccessAdmin from './ApiAccessAdmin';
import AdminUserLedger from './AdminUserLedger';
import AdminUsageAudit from './AdminUsageAudit';

const copy = {
  zh: {
    tabs: { overview: '概览', users: '用户', clones: '音色管理', activity: '生成记录', audit: '消费与调用', billing: '积分管理', api: 'API 接入' },
    loading: '加载中…', loadFailed: '管理员数据加载失败', refresh: '刷新',
    activeUsers: '活跃用户', totalAudio: '音频生成总数', totalClones: '声音克隆总数', totalVideos: '数字人视频总数',
    users: '用户', username: '用户名', email: '邮箱', role: '角色', joined: '注册时间', status: '状态', action: '操作', admin: '管理员', user: '用户',
    normal: '正常', banned: '已封禁', ban: '封禁账号', unban: '解除封禁', viewResources: '查看资源', delete: '删除', save: '保存额度', saving: '保存中…', unlimited: '不限',
    limits: '用量限制（0=不限）', cloneLimit: '声音克隆', audioLimit: '音频生成', modelLimit: '数字人模型', videoLimit: '数字人视频', usage: '当前用量', remaining: '剩余 {count}',
    selectUser: '请先选择一个用户', selectUserHint: '选择用户后，这里会显示该用户的声音、音频、数字人模型和视频记录。', selectedUser: '当前用户',
    voiceClones: '声音克隆', audioGenerations: '生成的音频', digitalModels: '数字人模型', digitalVideos: '数字人视频', empty: '暂无记录',
    voiceId: 'Voice ID', created: '创建时间', inputText: '文本内容', modelId: '模型 ID', open: '打开',
    ready: '完成', pending: '排队中', processing: '处理中', failed: '失败', disabled: '已停用', unknown: '未知',
    cloneManageHint: '管理所有客户创建的声音克隆。', cloneCount: '共 {count} 个', enable: '启用', disable: '停用', processingAction: '处理中…',
    overviewUsersHint: '按注册时间查看用户，并进入单个账号的资源记录。', noUsers: '暂无用户', confirmDelete: '确定删除该用户及其所有数据吗？此操作不可恢复。', deleteFailed: '删除用户失败',
    limitSaved: '额度已保存', accountUpdated: '账号状态已更新',
  },
  en: {
    tabs: { overview: 'Overview', users: 'Users', clones: 'Voice management', activity: 'Generation records', audit: 'Usage & calls', billing: 'Credits', api: 'API access' },
    loading: 'Loading…', loadFailed: 'Could not load admin data', refresh: 'Refresh',
    activeUsers: 'Active users', totalAudio: 'Total audio generations', totalClones: 'Total voice clones', totalVideos: 'Total digital-human videos',
    users: 'Users', username: 'Username', email: 'Email', role: 'Role', joined: 'Joined date', status: 'Status', action: 'Action', admin: 'Admin', user: 'User',
    normal: 'Active', banned: 'Banned', ban: 'Ban account', unban: 'Unban', viewResources: 'View resources', delete: 'Delete', save: 'Save limits', saving: 'Saving…', unlimited: 'Unlimited',
    limits: 'Usage limits (0=unlimited)', cloneLimit: 'Voice clones', audioLimit: 'Audio generations', modelLimit: 'Digital-human models', videoLimit: 'Digital-human videos', usage: 'Usage', remaining: '{count} remaining',
    selectUser: 'Select a user first', selectUserHint: 'Select a user to view that account’s voices, audio, digital-human models, and videos.', selectedUser: 'Selected user',
    voiceClones: 'Voice clones', audioGenerations: 'Generated audio', digitalModels: 'Digital-human models', digitalVideos: 'Digital-human videos', empty: 'No records',
    voiceId: 'Voice ID', created: 'Created', inputText: 'Text', modelId: 'Model ID', open: 'Open',
    ready: 'Completed', pending: 'Queued', processing: 'Processing', failed: 'Failed', disabled: 'Disabled', unknown: 'Unknown',
    cloneManageHint: 'Manage voice clones created by customers.', cloneCount: '{count} total', enable: 'Enable', disable: 'Disable', processingAction: 'Working…',
    overviewUsersHint: 'Browse users and open an account’s resource records.', noUsers: 'No users', confirmDelete: 'Delete this user and all of their data? This cannot be undone.', deleteFailed: 'Could not delete user',
    limitSaved: 'Limits saved', accountUpdated: 'Account status updated',
  },
};

const limitFields = [
  ['voice_clones', 'cloneLimit'],
  ['audio_generations', 'audioLimit'],
  ['digital_human_models', 'modelLimit'],
  ['digital_human_videos', 'videoLimit'],
];

function formatDate(value, language) {
  if (!value) return '—';
  return new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');
}

function statusLabel(status, text) {
  const map = { completed: text.ready, ready: text.ready, pending: text.pending, processing: text.processing, failed: text.failed, disabled: text.disabled, archived: text.disabled, 2: text.ready, 3: text.failed, 4: text.failed, 1: text.processing, 0: text.pending };
  return map[status] || text.unknown;
}

function statusClass(status) {
  if (status === 'completed' || status === 'ready' || Number(status) === 2) return 'completed';
  if (status === 'failed' || status === 'disabled' || status === 'archived' || Number(status) === 3 || Number(status) === 4) return 'failed';
  return 'pending';
}

function getInitials(username = '') { return username.slice(0, 2).toUpperCase() || 'U'; }

function getAvatarTone(seed = '') {
  return ['tone-a', 'tone-b', 'tone-c', 'tone-d'][seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4];
}

function UsageCard({ label, used, limit, remainingLabel }) {
  const unlimited = !limit;
  return <div className="admin-usage-card"><span>{label}</span><strong>{used}{unlimited ? '' : ` / ${limit}`}</strong><small>{unlimited ? '∞' : remainingLabel.replace('{count}', String(Math.max(limit - used, 0)))}</small></div>;
}

function MetricCard({ label, value }) { return <div className="admin-metric-card"><span>{label}</span><strong>{value}</strong></div>; }

function ResourceSection({ title, count, empty, children }) {
  return <section className="admin-panel admin-resource-section-card"><div className="admin-panel-header admin-panel-header-spread"><h2>{title}</h2><span>{count}</span></div>{count ? children : <p className="admin-empty">{empty}</p>}</section>;
}

export default function AdminDashboard() {
  const { language } = useLanguage();
  const text = copy[language];
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [voiceClones, setVoiceClones] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [resources, setResources] = useState(null);
  const [limitDrafts, setLimitDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [savingUser, setSavingUser] = useState(null);
  const [updatingClone, setUpdatingClone] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, clonesRes, statsRes] = await Promise.all([
        apiClient.get('/admin/users?limit=100&sort=newest'),
        apiClient.get('/admin/voice-clones'),
        apiClient.get('/admin/stats/overview'),
      ]);
      const nextUsers = usersRes.data?.items || usersRes.data || [];
      setUsers(nextUsers);
      setVoiceClones(clonesRes.data?.items || clonesRes.data || []);
      setStats(statsRes.data || null);
      setLimitDrafts(Object.fromEntries(nextUsers.map((item) => [item.id, { ...(item.limits || {}) }])));
    } catch (err) {
      setError(err.response?.data?.detail || text.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [text.loadFailed]);

  const loadResources = async (userId) => {
    setSelectedUserId(userId);
    setActiveTab('activity');
    setResourceLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get(`/admin/users/${userId}/resources`);
      setResources(data);
    } catch (err) {
      setError(err.response?.data?.detail || text.loadFailed);
    } finally {
      setResourceLoading(false);
    }
  };

  const updateUser = async (userId, payload, message) => {
    setSavingUser(userId);
    setError('');
    try {
      const { data } = await apiClient.patch(`/admin/users/${userId}`, payload);
      setUsers((current) => current.map((item) => item.id === userId ? data : item));
      setLimitDrafts((current) => ({ ...current, [userId]: { ...(data.limits || {}) } }));
      if (resources?.user?.id === userId) setResources((current) => ({ ...current, user: data }));
      setNotice(message);
    } catch (err) {
      setError(err.response?.data?.detail || text.loadFailed);
    } finally {
      setSavingUser(null);
    }
  };

  const handleSaveLimits = (userId) => {
    const draft = limitDrafts[userId] || {};
    updateUser(userId, Object.fromEntries(limitFields.map(([field]) => [field, Math.max(0, Number(draft[field] || 0))])), text.limitSaved);
  };

  const handleBan = (item) => updateUser(item.id, { is_banned: !item.is_banned }, text.accountUpdated);

  const handleCreditAdjustment = async (item) => {
    const amountText = window.prompt(language === 'zh' ? `用户当前余额：${item.credit_balance || 0}\n输入正数增加、负数扣除积分` : `Current balance: ${item.credit_balance || 0}\nEnter a positive number to add, negative to deduct`);
    if (amountText === null) return;
    const amount = Number(amountText);
    if (!Number.isInteger(amount) || amount === 0) { setError(language === 'zh' ? '请输入非零整数' : 'Enter a non-zero integer'); return; }
    let expireAfterDays;
    let neverExpires = false;
    if (amount > 0) {
      const expiry = window.prompt(language === 'zh' ? '赠送积分有效天数（输入0表示永不过期）' : 'Grant validity in days (0 means never expires)', '365');
      if (expiry === null) return;
      const days = Number(expiry);
      if (!Number.isInteger(days) || days < 0 || days > 3650) { setError(language === 'zh' ? '有效期须为0至3650天' : 'Validity must be 0–3650 days'); return; }
      neverExpires = days === 0;
      if (days > 0) expireAfterDays = days;
    }
    const description = window.prompt(language === 'zh' ? '调整原因' : 'Reason', language === 'zh' ? '后台手动调整' : 'Manual admin adjustment');
    if (!description?.trim()) return;
    try {
      await apiClient.post(`/billing/admin/users/${item.id}/adjustments`, { amount, description: description.trim(), expire_after_days: expireAfterDays ?? null, never_expires: neverExpires });
      await loadAdminData();
      setNotice(language === 'zh' ? '用户积分余额已调整' : 'User credit balance updated');
    } catch (err) { setError(err.response?.data?.detail || text.loadFailed); }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm(text.confirmDelete)) return;
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      setUsers((current) => current.filter((item) => item.id !== userId));
      if (selectedUserId === userId) { setSelectedUserId(null); setResources(null); }
    } catch (err) {
      setError(err.response?.data?.detail || text.deleteFailed);
    }
  };

  const handleCloneEnabled = async (clone) => {
    setUpdatingClone(clone.id);
    try {
      const { data } = await apiClient.patch(`/admin/voice-clones/${clone.id}`, { is_enabled: !clone.is_enabled });
      setVoiceClones((current) => current.map((item) => item.id === clone.id ? { ...item, ...data } : item));
    } catch (err) {
      setError(err.response?.data?.detail || text.loadFailed);
    } finally {
      setUpdatingClone(null);
    }
  };

  useEffect(() => { loadAdminData(); }, [loadAdminData]);

  const renderUserTable = () => (
    <section className="admin-panel admin-table-card">
      <div className="admin-panel-header admin-panel-header-spread"><div><h2>{text.users}</h2><span>{text.overviewUsersHint}</span></div><button className="admin-refresh-button" type="button" onClick={loadAdminData}>{text.refresh}</button></div>
      {users.length === 0 ? <p className="admin-empty">{text.noUsers}</p> : <div className="admin-table-wrap"><table className="admin-table admin-users-table"><thead><tr><th>{text.username}</th><th>{text.email}</th><th>{language === 'zh' ? '推荐渠道/公司' : 'Referral / company'}</th><th>{text.status}</th><th>{text.usage}</th><th>{text.limits}</th><th>{text.action}</th></tr></thead><tbody>{users.map((item) => {
        const draft = limitDrafts[item.id] || {};
        return <tr key={item.id}><td><div className="admin-table-user"><div className={`admin-avatar admin-avatar-sm ${getAvatarTone(item.username)}`}>{getInitials(item.username)}</div><div><strong>{item.username}</strong><small>{item.is_admin ? text.admin : text.user}</small></div></div></td><td className="admin-break-cell">{item.email}</td><td className="admin-break-cell">{item.referral_source || '—'}</td><td><span className={`admin-badge admin-badge-${item.is_banned ? 'failed' : 'completed'}`}>{item.is_banned ? text.banned : text.normal}</span></td><td><div className="admin-usage-mini">{item.usage?.voice_clones || 0} / {item.usage?.audio_generations || 0} / {item.usage?.digital_human_models || 0} / {item.usage?.digital_human_videos || 0}</div></td><td><div className="admin-limit-grid">{limitFields.map(([field, label]) => <label key={field} title={text[label]}><span>{text[label]}</span><input type="number" min="0" value={draft[field] ?? 0} onChange={(event) => setLimitDrafts((current) => ({ ...current, [item.id]: { ...draft, [field]: event.target.value } }))} /></label>)}</div></td><td><div className="admin-row-actions"><button type="button" className="admin-action-primary" onClick={() => loadResources(item.id)}>{text.viewResources}</button>{!item.is_admin && <button type="button" className="admin-action-secondary" onClick={() => handleCreditAdjustment(item)}>{language === 'zh' ? `积分 ${item.credit_balance || 0} · 调整` : `Credits ${item.credit_balance || 0} · Adjust`}</button>}{!item.is_admin && <button type="button" className={item.is_banned ? 'admin-action-success' : 'admin-action-danger'} onClick={() => handleBan(item)} disabled={savingUser === item.id}>{item.is_banned ? text.unban : text.ban}</button>}<button type="button" className="admin-action-secondary" onClick={() => handleSaveLimits(item.id)} disabled={savingUser === item.id}>{savingUser === item.id ? text.saving : text.save}</button>{!item.is_admin && <button type="button" className="admin-action-danger" onClick={() => handleDeleteUser(item.id)}>{text.delete}</button>}</div></td></tr>;
      })}</tbody></table></div>}
    </section>
  );

  const renderResources = () => {
    if (!selectedUserId) return <section className="admin-panel admin-select-user"><h2>{text.selectUser}</h2><p>{text.selectUserHint}</p><button className="admin-action-primary" type="button" onClick={() => setActiveTab('users')}>{text.users}</button></section>;
    if (resourceLoading || !resources) return <section className="admin-panel admin-select-user"><p>{text.loading}</p></section>;
    const account = resources.user;
    const usage = account.usage || {};
    const limits = account.limits || {};
    return <><div className="admin-resource-head"><div><span>{text.selectedUser}</span><h2>{account.username} <small>{account.email}</small></h2></div><button className="admin-refresh-button" type="button" onClick={() => loadResources(account.id)}>{text.refresh}</button></div><div className="admin-usage-grid"><UsageCard label={text.cloneLimit} used={usage.voice_clones || 0} limit={limits.voice_clones} remainingLabel={text.remaining} /><UsageCard label={text.audioLimit} used={usage.audio_generations || 0} limit={limits.audio_generations} remainingLabel={text.remaining} /><UsageCard label={text.modelLimit} used={usage.digital_human_models || 0} limit={limits.digital_human_models} remainingLabel={text.remaining} /><UsageCard label={text.videoLimit} used={usage.digital_human_videos || 0} limit={limits.digital_human_videos} remainingLabel={text.remaining} /></div><AdminUserLedger userId={account.id} username={account.username} email={account.email} referralSource={account.referral_source} language={language} /><div className="admin-resource-grid"><ResourceSection title={text.voiceClones} count={resources.voice_clones.length} empty={text.empty}><div className="admin-resource-list">{resources.voice_clones.map((item) => <div className="admin-resource-row" key={item.id}><div><strong>{item.name}</strong><small>{text.voiceId}: {item.voice_id || '—'}</small></div><span className={`admin-badge admin-badge-${statusClass(item.status)}`}>{statusLabel(item.status, text)}</span><time>{formatDate(item.created_at, language)}</time></div>)}</div></ResourceSection><ResourceSection title={text.audioGenerations} count={resources.audio_generations.length} empty={text.empty}><div className="admin-resource-list">{resources.audio_generations.map((item) => <div className="admin-resource-row admin-audio-row" key={item.id}><div><strong>{item.input_text}</strong><small>{text.voiceId}: {item.voice_ref_id} · {formatDate(item.created_at, language)}</small></div><span className={`admin-badge admin-badge-${statusClass(item.status)}`}>{statusLabel(item.status, text)}</span>{item.audio_url && item.status === 'completed' && <audio controls src={item.audio_url} />}</div>)}</div></ResourceSection><ResourceSection title={text.digitalModels} count={resources.digital_human_models.length} empty={text.empty}><div className="admin-resource-list">{resources.digital_human_models.map((item) => <div className="admin-resource-row" key={item.id}><div><strong>{item.name}</strong><small>{text.modelId}: {item.remote_model_id || item.id}</small></div><span className={`admin-badge admin-badge-${statusClass(item.status)}`}>{statusLabel(item.status, text)}</span><time>{formatDate(item.created_at, language)}</time></div>)}</div></ResourceSection><ResourceSection title={text.digitalVideos} count={resources.digital_human_videos.length} empty={text.empty}><div className="admin-resource-list">{resources.digital_human_videos.map((item) => <div className="admin-resource-row" key={item.id}><div><strong>{item.video_name || `${text.digitalVideos} #${item.id}`}</strong><small>{text.modelId}: {item.model_id} · {formatDate(item.created_at, language)}</small></div><span className={`admin-badge admin-badge-${statusClass(item.status)}`}>{statusLabel(item.status, text)}</span>{item.video_url && item.status === 'completed' && <a className="admin-action-primary" href={item.video_url} target="_blank" rel="noreferrer">{text.open}</a>}</div>)}</div></ResourceSection></div></>;
  };

  const totalAudio = users.reduce((sum, item) => sum + (item.usage?.audio_generations || 0), 0);
  const totalClones = users.reduce((sum, item) => sum + (item.usage?.voice_clones || 0), 0);
  const totalVideos = users.reduce((sum, item) => sum + (item.usage?.digital_human_videos || 0), 0);

  if (activeTab === 'api') {
    return <div className="page-container admin-page"><div className="admin-shell">
      <div className="admin-header"><div className="admin-tabs" role="tablist">{Object.entries(text.tabs).map(([key, label]) => <button key={key} type="button" className={`admin-tab ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>)}</div></div>
      {error && <div className="error-msg">{error}</div>}{notice && <div className="admin-notice">{notice}</div>}
      <ApiAccessAdmin users={users} language={language} onError={setError} onNotice={setNotice} />
    </div></div>;
  }

  return <div className="page-container admin-page"><div className="admin-shell"><div className="admin-header"><div className="admin-tabs" role="tablist">{Object.entries(text.tabs).map(([key, label]) => <button key={key} type="button" className={`admin-tab ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>)}</div></div>{error && <div className="error-msg">{error}</div>}{notice && <div className="admin-notice">{notice}</div>}{loading ? <div className="admin-loading">{text.loading}</div> : <>{activeTab === 'audit' && <AdminUsageAudit language={language} />}{activeTab === 'billing' && <BillingAdmin language={language} onError={setError} onNotice={setNotice} />}{activeTab === 'overview' && <section className="admin-section"><div className="admin-overview-cards"><MetricCard label={text.activeUsers} value={stats?.active_users || 0} /><MetricCard label={text.totalAudio} value={totalAudio} /><MetricCard label={text.totalClones} value={totalClones} /><MetricCard label={text.totalVideos} value={totalVideos} /></div>{renderUserTable()}</section>}{activeTab === 'users' && <section className="admin-section admin-table-section">{renderUserTable()}</section>}{activeTab === 'clones' && <section className="admin-section admin-table-section"><section className="admin-panel admin-table-card"><div className="admin-panel-header admin-panel-header-spread"><div><h2>{text.voiceClones}</h2><span>{text.cloneManageHint}</span></div><span className="admin-clone-count">{text.cloneCount.replace('{count}', voiceClones.length)}</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{text.voiceClones}</th><th>{text.username}</th><th>{text.voiceId}</th><th>{text.status}</th><th>{text.action}</th></tr></thead><tbody>{voiceClones.map((clone) => <tr key={clone.id}><td><strong>{clone.name}</strong></td><td>{clone.username}<br /><small>{clone.email}</small></td><td className="admin-break-cell"><code>{clone.voice_id || '—'}</code></td><td><span className={`admin-badge admin-badge-${clone.is_enabled ? 'completed' : 'failed'}`}>{clone.is_enabled ? text.ready : text.disabled}</span></td><td><button type="button" className={clone.is_enabled ? 'admin-action-danger' : 'admin-action-success'} onClick={() => handleCloneEnabled(clone)} disabled={updatingClone === clone.id}>{updatingClone === clone.id ? text.processingAction : clone.is_enabled ? text.disable : text.enable}</button></td></tr>)}</tbody></table></div>{voiceClones.length === 0 && <p className="admin-empty">{text.empty}</p>}</section></section>}{activeTab === 'activity' && <section className="admin-section admin-resource-section">{renderResources()}</section>}</>}</div></div>;
}
