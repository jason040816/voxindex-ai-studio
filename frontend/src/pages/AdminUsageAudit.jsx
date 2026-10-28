import { useEffect, useState } from 'react';
import apiClient from '../api/client';

const PAGE_SIZE = 50;

function dateLabel(value, language) {
  return value ? new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : '—';
}

function summary(value) {
  if (!value) return '—';
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function Pager({ data, onPage, language }) {
  const isZh = language === 'zh';
  return <div className="admin-ledger-pager">
    <button type="button" className="admin-action-secondary" onClick={() => onPage(data.page - 1)} disabled={data.page <= 1}>{isZh ? '上一页' : 'Previous'}</button>
    <span>{data.page} / {data.pages || 1} · {isZh ? `共 ${data.total} 条` : `${data.total} records`}</span>
    <button type="button" className="admin-action-secondary" onClick={() => onPage(data.page + 1)} disabled={!data.pages || data.page >= data.pages}>{isZh ? '下一页' : 'Next'}</button>
  </div>;
}

export default function AdminUsageAudit({ language }) {
  const isZh = language === 'zh';
  const [userPage, setUserPage] = useState(1);
  const [creditPage, setCreditPage] = useState(1);
  const [callPage, setCallPage] = useState(1);
  const [users, setUsers] = useState({ items: [], page: 1, pages: 0, total: 0 });
  const [credits, setCredits] = useState({ items: [], page: 1, pages: 0, total: 0 });
  const [calls, setCalls] = useState({ items: [], page: 1, pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      apiClient.get(`/admin/audit/users?page=${userPage}&limit=${PAGE_SIZE}`),
      apiClient.get(`/admin/audit/transactions?page=${creditPage}&limit=${PAGE_SIZE}`),
      apiClient.get(`/admin/audit/provider-calls?page=${callPage}&limit=${PAGE_SIZE}`),
    ]).then(([userResponse, creditResponse, callResponse]) => {
      if (!active) return;
      setUsers(userResponse.data);
      setCredits(creditResponse.data);
      setCalls(callResponse.data);
    }).catch(err => {
      if (active) setError(err.response?.data?.detail || (isZh ? '全用户明细加载失败' : 'Could not load account audit details'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userPage, creditPage, callPage, isZh]);

  const exportExcel = async () => {
    setExporting(true);
    setError('');
    try {
      const response = await apiClient.get('/admin/audit/export.xlsx', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `全用户消费与上游调用明细_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.detail || (isZh ? 'Excel 导出失败，请重试' : 'Excel export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="admin-loading">{isZh ? '正在加载全用户明细…' : 'Loading all account details…'}</div>;

  return <section className="admin-section admin-audit-page">
    <div className="admin-panel admin-audit-toolbar">
      <div><h2>{isZh ? '全用户消费与调用明细' : 'All-user usage and provider details'}</h2><p>{isZh ? '集中查看用户推荐渠道、积分流水和上游接口调用记录。' : 'Browse referral sources, credit transactions, and upstream calls for all users.'}</p></div>
      <button type="button" className="admin-action-primary" onClick={exportExcel} disabled={exporting}>{exporting ? (isZh ? '正在生成 Excel…' : 'Generating Excel…') : (isZh ? '导出全部明细 Excel' : 'Export all details to Excel')}</button>
    </div>
    {error && <div className="error-msg">{error}</div>}

    <section className="admin-panel admin-table-card">
      <div className="admin-panel-header admin-panel-header-spread"><div><h2>{isZh ? '用户与推荐渠道' : 'Users and referral sources'}</h2></div><Pager data={users} onPage={setUserPage} language={language} /></div>
      {users.items.length ? <div className="admin-table-wrap"><table className="admin-table admin-ledger-table"><thead><tr><th>ID</th><th>{isZh ? '用户名' : 'Username'}</th><th>{isZh ? '邮箱' : 'Email'}</th><th>{isZh ? '推荐渠道 / 公司' : 'Referral / company'}</th><th>{isZh ? '注册时间' : 'Registered'}</th></tr></thead><tbody>{users.items.map(row => <tr key={row.id}><td>{row.id}</td><td>{row.username}</td><td>{row.email}</td><td>{row.referral_source || '—'}</td><td>{dateLabel(row.created_at, language)}</td></tr>)}</tbody></table></div> : <p className="admin-empty">{isZh ? '暂无用户' : 'No users'}</p>}
    </section>

    <section className="admin-panel admin-table-card">
      <div className="admin-panel-header admin-panel-header-spread"><div><h2>{isZh ? '所有用户积分消费与变动' : 'Credit transactions for all users'}</h2></div><Pager data={credits} onPage={setCreditPage} language={language} /></div>
      {credits.items.length ? <div className="admin-table-wrap"><table className="admin-table admin-ledger-table"><thead><tr><th>{isZh ? '时间' : 'Time'}</th><th>{isZh ? '用户' : 'User'}</th><th>{isZh ? '推荐渠道 / 公司' : 'Referral / company'}</th><th>{isZh ? '类型' : 'Type'}</th><th>{isZh ? '积分变化' : 'Credit change'}</th><th>{isZh ? '状态' : 'Status'}</th><th>{isZh ? '说明 / 关联' : 'Description / reference'}</th></tr></thead><tbody>{credits.items.map(row => <tr key={row.id}><td>{dateLabel(row.created_at, language)}</td><td>{row.username}<small className="admin-audit-subline">{row.email}</small></td><td>{row.referral_source || '—'}</td><td>{row.kind}</td><td className={row.delta < 0 ? 'admin-ledger-negative' : 'admin-ledger-positive'}>{row.delta > 0 ? '+' : ''}{row.delta}</td><td>{row.status}</td><td>{row.description}<small className="admin-audit-subline">{row.reference_type || '—'}{row.reference_id ? ` #${row.reference_id}` : ''}</small></td></tr>)}</tbody></table></div> : <p className="admin-empty">{isZh ? '暂无积分流水' : 'No credit transactions'}</p>}
    </section>

    <section className="admin-panel admin-table-card">
      <div className="admin-panel-header admin-panel-header-spread"><div><h2>{isZh ? '所有用户上游调用明细' : 'Upstream calls for all users'}</h2><span>{isZh ? '历史记录从调用审计功能上线后开始积累。' : 'Call history starts when call auditing is deployed.'}</span></div><Pager data={calls} onPage={setCallPage} language={language} /></div>
      {calls.items.length ? <div className="admin-table-wrap"><table className="admin-table admin-ledger-table"><thead><tr><th>{isZh ? '时间' : 'Time'}</th><th>{isZh ? '用户 / 推荐渠道' : 'User / referral'}</th><th>{isZh ? '服务商 / 操作' : 'Provider / operation'}</th><th>{isZh ? '接口' : 'Endpoint'}</th><th>{isZh ? '结果' : 'Outcome'}</th><th>{isZh ? '耗时' : 'Duration'}</th><th>{isZh ? '调用摘要' : 'Call details'}</th><th>{isZh ? '关联 / 错误' : 'Reference / error'}</th></tr></thead><tbody>{calls.items.map(row => <tr key={row.id}><td>{dateLabel(row.created_at, language)}</td><td>{row.username || `#${row.user_id || '—'}`}<small className="admin-audit-subline">{row.email}{row.referral_source ? ` · ${row.referral_source}` : ''}</small></td><td>{row.provider}<small className="admin-audit-subline">{row.operation}</small></td><td className="admin-break-cell"><code>{row.method} {row.endpoint}</code></td><td>{row.outcome}{row.status_code ? ` (${row.status_code})` : ''}</td><td>{row.duration_ms} ms</td><td><details className="admin-call-details"><summary>{isZh ? '查看摘要' : 'View summary'}</summary><strong>{isZh ? '请求' : 'Request'}</strong><pre>{summary(row.request_summary)}</pre><strong>{isZh ? '响应' : 'Response'}</strong><pre>{summary(row.response_summary)}</pre></details></td><td>{row.reference_type || '—'}{row.reference_id ? ` #${row.reference_id}` : ''}{row.error_summary && <small className="admin-ledger-error">{row.error_summary}</small>}</td></tr>)}</tbody></table></div> : <p className="admin-empty">{isZh ? '暂无上游调用记录' : 'No upstream calls'}</p>}
    </section>
  </section>;
}
