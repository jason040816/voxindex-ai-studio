import { useCallback, useEffect, useState } from 'react';
import apiClient, { apiBase } from '../api/client';
import './ApiAccessAdmin.css';

const copy = {
  zh: {
    title: 'API 接入管理', subtitle: '使用网站现有的腾讯云配置，由后台统一转发和管理客户调用。',
    provider: '腾讯云声音服务', providerHint: '使用服务器环境变量中的现有腾讯云密钥；不会在网页中显示 SecretKey。',
    configured: '密钥已配置', missing: '未检测到密钥', enabled: '服务已启用', disabled: '服务已停用',
    secretId: 'SecretId', providerMode: '当前语音服务', turnOff: '停用腾讯服务', turnOn: '启用腾讯服务',
    providerSaved: '腾讯服务状态已更新', providerSaveFailed: '无法更新腾讯服务状态',
    keysTitle: '客户 API Key', keysHint: '为客户账号签发独立 Key；客户用它调用声音克隆和语音合成接口。',
    customer: '客户账号', chooseCustomer: '选择客户账号', keyName: 'Key 名称', keyNamePlaceholder: '例如：官网接入', issue: '生成 API Key',
    maxRequests: '最多调用次数', unlimited: '不限', usageHelp: '每次 API 请求计 1 次；填 0 表示不限，到达上限后该 Key 会自动停止调用。', saveLimit: '保存上限', limitSaved: '调用上限已更新',
    usage: '用量', viewUsage: '用量明细', hideUsage: '收起明细', usageDetails: 'API Key 用量明细', totalRequests: '已用调用次数', loggedEvents: '明细记录', historyNote: '详细用量从新版上线后开始记录，已有调用总次数会保留；超过上限被拦截的请求也会出现在明细中。', cloneCount: '声音克隆', synthesisCount: '语音合成', success: '成功', failed: '失败', chars: '提交字符数', credits: '消耗积分', requestTime: '调用时间（北京时间）', endpoint: '接口', result: '结果', httpStatus: 'HTTP 状态', previous: '上一页', next: '下一页', page: '页', noUsageEvents: '暂无 API 调用记录',
    noCustomers: '暂无可签发 Key 的客户账号', issued: 'API Key 已生成。完整内容只显示这一次，请现在复制保存。', copy: '复制 Key', copied: '已复制',
    keysEmpty: '还没有客户 API Key', key: 'Key', name: '名称', requests: '已用 / 上限', lastUsed: '最近调用（北京时间）', createdAt: '创建时间（北京时间）', status: '状态', action: '操作',
    active: '有效', exhausted: '已达上限', revoked: '已停用', revoke: '停用', revokeConfirm: '确定停用这个客户 API Key 吗？停用后无法恢复，需要重新生成。',
    loading: '加载中…', loadFailed: 'API 接入配置加载失败', actionFailed: '操作失败，请重试', refresh: '刷新',
    docsTitle: '客户调用方式', docsHint: '客户将下方的接口地址和自己刚生成的 DAXI API Key 配合使用。只允许访问声音克隆与语音合成接口。',
    auth: '请求头', clone: '创建声音克隆（multipart/form-data）', synth: '语音合成（JSON）', download: '下载生成音频',
    providerSecurity: '安全提示：腾讯 SecretKey 只保存在服务器环境变量中。若要更换密钥，请更新服务器配置；本页面只显示状态和 SecretId 尾号。',
    customerSecurity: '客户 Key 创建后只显示一次。后台仅保存不可逆摘要，可查看客户、状态和调用次数；可随时修改调用上限或停用 Key。丢失时请停用旧 Key 并重新签发。',
  },
  en: {
    title: 'API Access', subtitle: 'Use the Tencent Cloud credentials already configured on the server and manage customer calls here.',
    provider: 'Tencent voice service', providerHint: 'Uses the existing server-side Tencent credentials. The SecretKey is never shown in this page.',
    configured: 'Credentials configured', missing: 'Credentials not detected', enabled: 'Service enabled', disabled: 'Service disabled',
    secretId: 'SecretId', providerMode: 'Active speech provider', turnOff: 'Disable Tencent', turnOn: 'Enable Tencent',
    providerSaved: 'Tencent service status updated', providerSaveFailed: 'Could not update Tencent service status',
    keysTitle: 'Customer API Keys', keysHint: 'Issue a separate key for a customer account. Customers use it for voice-clone and speech-synthesis APIs.',
    customer: 'Customer account', chooseCustomer: 'Choose a customer', keyName: 'Key name', keyNamePlaceholder: 'e.g. Website integration', issue: 'Generate API Key',
    maxRequests: 'Maximum requests', unlimited: 'Unlimited', usageHelp: 'Each API request counts as 1. Set 0 for unlimited; the key is blocked automatically at its limit.', saveLimit: 'Save limit', limitSaved: 'Request limit updated',
    usage: 'Usage', viewUsage: 'Usage details', hideUsage: 'Hide details', usageDetails: 'API key usage details', totalRequests: 'Used requests', loggedEvents: 'Detailed records', historyNote: 'Detailed usage is recorded after this release. Existing request totals remain; requests blocked by the limit also appear in details.', cloneCount: 'Voice clones', synthesisCount: 'Speech synthesis', success: 'Succeeded', failed: 'Failed', chars: 'Submitted characters', credits: 'Credits consumed', requestTime: 'Request time (Beijing)', endpoint: 'Endpoint', result: 'Result', httpStatus: 'HTTP status', previous: 'Previous', next: 'Next', page: 'Page', noUsageEvents: 'No API requests recorded yet',
    noCustomers: 'No customer accounts are available', issued: 'API Key created. Its full value is shown only once—copy it now.', copy: 'Copy key', copied: 'Copied',
    keysEmpty: 'No customer API Keys yet', key: 'Key', name: 'Name', requests: 'Used / limit', lastUsed: 'Last used (Beijing)', createdAt: 'Created (Beijing)', status: 'Status', action: 'Action',
    active: 'Active', exhausted: 'Limit reached', revoked: 'Revoked', revoke: 'Revoke', revokeConfirm: 'Revoke this customer API Key? It cannot be restored; issue a new key instead.',
    loading: 'Loading…', loadFailed: 'Could not load API access settings', actionFailed: 'Action failed. Please try again.', refresh: 'Refresh',
    docsTitle: 'Customer API usage', docsHint: 'Customers use these endpoints with their DAXI API Key. Keys are limited to voice-clone and synthesis APIs.',
    auth: 'Request header', clone: 'Create a voice clone (multipart/form-data)', synth: 'Speech synthesis (JSON)', download: 'Download generated audio',
    providerSecurity: 'Security: the Tencent SecretKey stays in server environment variables. To rotate it, update the server configuration; this page shows only status and the SecretId suffix.',
    customerSecurity: 'A customer key is shown only once. The admin stores only a one-way hash and can see its owner, status, and request count; its limit can be changed or the key revoked at any time. Revoke and reissue a lost key.',
  },
};

function formatDate(value, language) {
  if (!value) return '—';
  const hasTimezone = typeof value === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(typeof value === 'string' && !hasTimezone ? `${value.replace(' ', 'T')}Z` : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'Asia/Shanghai' });
}

export default function ApiAccessAdmin({ users = [], language = 'zh', onError, onNotice }) {
  const text = copy[language] || copy.zh;
  const customers = users.filter((user) => !user.is_admin);
  const [keys, setKeys] = useState([]);
  const [provider, setProvider] = useState(null);
  const [userId, setUserId] = useState('');
  const [keyName, setKeyName] = useState('');
  const [maxRequests, setMaxRequests] = useState('0');
  const [limitDrafts, setLimitDrafts] = useState({});
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [usageDetail, setUsageDetail] = useState(null);
  const [usagePage, setUsagePage] = useState(1);
  const [usageLoading, setUsageLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [keysResponse, providerResponse] = await Promise.all([
        apiClient.get('/admin/api-keys'),
        apiClient.get('/admin/integrations/tencent'),
      ]);
      const nextKeys = keysResponse.data || [];
      setKeys(nextKeys);
      setLimitDrafts(Object.fromEntries(nextKeys.map((item) => [item.id, String(item.max_requests || 0)])));
      setProvider(providerResponse.data || null);
      onError?.('');
    } catch (error) {
      onError?.(error.response?.data?.detail || text.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [onError, text.loadFailed]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleIssue = async (event) => {
    event.preventDefault();
    if (!userId || !keyName.trim()) return;
    setBusy(true);
    setNewKey('');
    setCopied(false);
    try {
      const { data } = await apiClient.post('/admin/api-keys', {
        user_id: Number(userId),
        name: keyName.trim(),
        max_requests: Number(maxRequests) || 0,
      });
      setNewKey(data.api_key);
      setKeyName('');
      setMaxRequests('0');
      await loadData();
      onNotice?.(text.issued);
    } catch (error) {
      onError?.(error.response?.data?.detail || text.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLimit = async (item) => {
    const rawValue = limitDrafts[item.id] ?? String(item.max_requests || 0);
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0) {
      onError?.(text.actionFailed);
      return;
    }
    setBusy(true);
    try {
      await apiClient.patch(`/admin/api-keys/${item.id}`, { max_requests: value });
      await loadData();
      onNotice?.(text.limitSaved);
      onError?.('');
    } catch (error) {
      onError?.(error.response?.data?.detail || text.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (item) => {
    if (!window.confirm(text.revokeConfirm)) return;
    setBusy(true);
    try {
      await apiClient.delete(`/admin/api-keys/${item.id}`);
      await loadData();
      onNotice?.(text.revoked);
    } catch (error) {
      onError?.(error.response?.data?.detail || text.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleProviderToggle = async () => {
    if (!provider) return;
    setBusy(true);
    try {
      const { data } = await apiClient.patch('/admin/integrations/tencent', { enabled: !provider.enabled });
      setProvider(data);
      onNotice?.(text.providerSaved);
      onError?.('');
    } catch (error) {
      onError?.(error.response?.data?.detail || text.providerSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
    } catch {
      onError?.(text.actionFailed);
    }
  };

  const handleUsage = async (item, page = 1) => {
    setUsageLoading(true);
    try {
      const { data } = await apiClient.get(`/admin/api-keys/${item.id}/usage`, { params: { page, limit: 100 } });
      setUsageDetail(data);
      setUsagePage(page);
      onError?.('');
    } catch (error) {
      onError?.(error.response?.data?.detail || text.actionFailed);
    } finally {
      setUsageLoading(false);
    }
  };

  return <section className="admin-section api-access-admin">
    <div className="api-access-heading"><div><h1>{text.title}</h1><p>{text.subtitle}</p></div><button className="admin-refresh-button" type="button" onClick={loadData} disabled={loading}>{text.refresh}</button></div>

    <section className="admin-panel api-provider-card">
      <div className="api-access-panel-heading"><div><h2>{text.provider}</h2><p>{text.providerHint}</p></div>
        {provider && <span className={`admin-badge admin-badge-${provider.enabled ? 'completed' : 'failed'}`}>{provider.enabled ? text.enabled : text.disabled}</span>}
      </div>
      {loading ? <div className="admin-loading">{text.loading}</div> : provider && <>
        <div className="api-provider-meta">
          <div><span>{text.status}</span><strong>{provider.configured ? text.configured : text.missing}</strong></div>
          <div><span>{text.secretId}</span><strong><code>{provider.secret_id_masked || '—'}</code></strong></div>
          <div><span>{text.providerMode}</span><strong><code>{provider.provider || '—'}</code></strong></div>
          <button type="button" className={provider.enabled ? 'admin-action-danger' : 'admin-action-success'} onClick={handleProviderToggle} disabled={busy}>
            {provider.enabled ? text.turnOff : text.turnOn}
          </button>
        </div>
        <p className="api-security-note">{text.providerSecurity}</p>
      </>}
    </section>

    <section className="admin-panel">
      <div className="api-access-panel-heading"><div><h2>{text.keysTitle}</h2><p>{text.keysHint}</p></div></div>
      <form className="api-key-create-form" onSubmit={handleIssue}>
        <label><span>{text.customer}</span><select value={userId} onChange={(event) => setUserId(event.target.value)} required>
          <option value="">{customers.length ? text.chooseCustomer : text.noCustomers}</option>
          {customers.map((user) => <option key={user.id} value={user.id}>{user.username} · {user.email}</option>)}
        </select></label>
        <label><span>{text.keyName}</span><input value={keyName} onChange={(event) => setKeyName(event.target.value)} maxLength={80} placeholder={text.keyNamePlaceholder} required /></label>
        <label><span>{text.maxRequests}</span><input type="number" min="0" step="1" value={maxRequests} onChange={(event) => setMaxRequests(event.target.value)} /></label>
        <button type="submit" className="admin-action-primary" disabled={busy || loading || !customers.length}>{text.issue}</button>
      </form>
      <p className="api-usage-help">{text.usageHelp}</p>
      <p className="api-usage-help">{text.historyNote}</p>

      {newKey && <div className="api-key-reveal" role="status"><div><strong>{text.issued}</strong><code>{newKey}</code></div><button type="button" className="admin-action-primary" onClick={handleCopy}>{copied ? text.copied : text.copy}</button></div>}
      <p className="api-security-note">{text.customerSecurity}</p>

      {loading ? <div className="admin-loading">{text.loading}</div> : keys.length === 0 ? <p className="admin-empty">{text.keysEmpty}</p> : <><div className="admin-table-wrap api-key-table-wrap"><table className="admin-table api-key-table"><thead><tr><th>{text.customer}</th><th>{text.name}</th><th>{text.key}</th><th>{text.status}</th><th>{text.requests}</th><th>{text.usage}</th><th>{text.lastUsed}</th><th>{text.createdAt}</th><th>{text.action}</th></tr></thead><tbody>
        {keys.map((item) => <tr key={item.id}>
          <td><strong>{item.username}</strong><br /><small>{item.email}</small></td>
          <td>{item.name}</td><td><code>{item.prefix}••••••</code></td>
          <td><span className={`admin-badge admin-badge-${!item.is_active || item.is_exhausted ? 'failed' : 'completed'}`}>{!item.is_active ? text.revoked : item.is_exhausted ? text.exhausted : text.active}</span></td>
          <td className="api-key-limit-cell"><strong>{item.request_count} / {item.max_requests || '∞'}</strong>{item.is_active && <form onSubmit={(event) => { event.preventDefault(); handleSaveLimit(item); }}><input aria-label={text.maxRequests} type="number" min="0" step="1" value={limitDrafts[item.id] ?? String(item.max_requests || 0)} onChange={(event) => setLimitDrafts((current) => ({ ...current, [item.id]: event.target.value }))} /><button type="submit" disabled={busy}>{text.saveLimit}</button></form>}</td>
          <td className="api-key-usage-cell"><strong>{text.cloneCount}: {item.voice_clone_count || 0}</strong><strong>{text.synthesisCount}: {item.synthesis_success_count || 0} / {item.synthesis_failed_count || 0}</strong><small>{text.chars}: {item.synthesized_characters || 0} · {text.credits}: {item.points_used || 0}</small><button type="button" onClick={() => usageDetail?.summary?.id === item.id ? setUsageDetail(null) : handleUsage(item)} disabled={usageLoading}>{usageDetail?.summary?.id === item.id ? text.hideUsage : text.viewUsage}</button></td>
          <td>{formatDate(item.last_used_at, language)}</td><td>{formatDate(item.created_at, language)}</td>
          <td>{item.is_active && <button type="button" className="admin-action-danger" onClick={() => handleRevoke(item)} disabled={busy}>{text.revoke}</button>}</td>
        </tr>)}
      </tbody></table></div>{usageDetail && <section className="api-key-usage-details"><div className="api-key-usage-heading"><div><h3>{text.usageDetails} · {usageDetail.summary.name}</h3><p>{text.totalRequests}: {usageDetail.summary.request_count} · {text.loggedEvents}: {usageDetail.request_events_total}</p></div><button type="button" className="admin-refresh-button" onClick={() => setUsageDetail(null)}>{text.hideUsage}</button></div><div className="api-key-usage-grid"><div><span>{text.cloneCount}</span><strong>{usageDetail.summary.voice_clone_count || 0}</strong></div><div><span>{text.synthesisCount} · {text.success} / {text.failed}</span><strong>{usageDetail.summary.synthesis_success_count || 0} / {usageDetail.summary.synthesis_failed_count || 0}</strong></div><div><span>{text.chars}</span><strong>{usageDetail.summary.synthesized_characters || 0}</strong></div><div><span>{text.credits}</span><strong>{usageDetail.summary.points_used || 0}</strong></div></div>{usageDetail.request_events.length === 0 ? <p className="admin-empty">{text.noUsageEvents}</p> : <div className="admin-table-wrap"><table className="admin-table api-key-event-table"><thead><tr><th>{text.requestTime}</th><th>{text.endpoint}</th><th>{text.result}</th><th>{text.httpStatus}</th><th>{text.chars}</th><th>{text.credits}</th></tr></thead><tbody>{usageDetail.request_events.map((event) => <tr key={event.id}><td>{formatDate(event.created_at, language)}</td><td><code>{event.method} {event.path}</code></td><td>{event.outcome || '—'}</td><td>{event.status_code || '—'}</td><td>{event.characters || 0}</td><td>{event.credits_used || 0}</td></tr>)}</tbody></table></div>}{usageDetail.pages > 1 && <div className="api-key-usage-pagination"><button type="button" onClick={() => handleUsage(usageDetail.summary, usagePage - 1)} disabled={usageLoading || usagePage <= 1}>{text.previous}</button><span>{text.page} {usagePage} / {usageDetail.pages}</span><button type="button" onClick={() => handleUsage(usageDetail.summary, usagePage + 1)} disabled={usageLoading || usagePage >= usageDetail.pages}>{text.next}</button></div>}</section>}</>}
    </section>

    <section className="admin-panel api-docs-panel">
      <div className="api-access-panel-heading"><div><h2>{text.docsTitle}</h2><p>{text.docsHint}</p></div></div>
      <div className="api-doc-block"><h3>{text.auth}</h3><pre><code>Authorization: Bearer YOUR_DAXI_API_KEY</code></pre></div>
      <div className="api-doc-block"><h3>{text.clone}</h3><pre><code>{`curl -X POST "${apiBase}/api/voice-clones/" \\
  -H "Authorization: Bearer YOUR_DAXI_API_KEY" \\
  -F "name=My voice" -F "sample_text=Optional transcript" \\
  -F "consent=true" -F "file=@voice.wav"`}</code></pre></div>
      <div className="api-doc-block"><h3>{text.synth}</h3><pre><code>{`curl -X POST "${apiBase}/api/synthesis/" \\
  -H "Authorization: Bearer YOUR_DAXI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"voice_ref_id": CLONE_ID, "text": "Hello from DAXI"}'`}</code></pre></div>
      <div className="api-doc-block"><h3>{text.download}</h3><pre><code>{`GET ${apiBase}/api/synthesis/JOB_ID/audio`}</code></pre></div>
    </section>
  </section>;
}
