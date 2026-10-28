import { useEffect, useState } from 'react';
import apiClient from '../api/client';

function formatDate(value, language) {
  return value ? new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : '—';
}

function prettySummary(value) {
  if (!value) return '—';
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function Pager({ page, pages, onChange, language }) {
  return <div className="admin-ledger-pager">
    <button type="button" className="admin-action-secondary" onClick={() => onChange(page - 1)} disabled={page <= 1}>{language === 'zh' ? '上一页' : 'Previous'}</button>
    <span>{page} / {pages || 1}</span>
    <button type="button" className="admin-action-secondary" onClick={() => onChange(page + 1)} disabled={!pages || page >= pages}>{language === 'zh' ? '下一页' : 'Next'}</button>
  </div>;
}

export default function AdminUserLedger({ userId, username, email, referralSource, language }) {
  const isZh = language === 'zh';
  const [transactionPage, setTransactionPage] = useState(1);
  const [providerPage, setProviderPage] = useState(1);
  const [transactions, setTransactions] = useState({ items: [], pages: 0, total: 0 });
  const [providerCalls, setProviderCalls] = useState({ items: [], pages: 0, total: 0 });
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    setExporting(true);
    setError('');
    try {
      const response = await apiClient.get(`/admin/users/${userId}/export.xlsx`, { responseType: 'blob' });
      const downloadUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${(username || `user-${userId}`).replace(/[\\/:*?"<>|]/g, '_')}_${isZh ? '消费与调用明细' : 'usage-and-provider-details'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err.response?.data?.detail || (isZh ? 'Excel 导出失败，请重试' : 'Excel export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    setTransactionPage(1);
    setProviderPage(1);
  }, [userId]);

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([
      apiClient.get(`/admin/users/${userId}/transactions?page=${transactionPage}&limit=50`),
      apiClient.get(`/admin/users/${userId}/provider-calls?page=${providerPage}&limit=50`),
    ]).then(([transactionsResponse, providerResponse]) => {
      if (!active) return;
      setTransactions(transactionsResponse.data);
      setProviderCalls(providerResponse.data);
    }).catch((err) => {
      if (active) setError(err.response?.data?.detail || (isZh ? '账务或上游调用明细加载失败' : 'Could not load billing or provider-call details'));
    });
    return () => { active = false; };
  }, [userId, transactionPage, providerPage, isZh]);

  return <>
    <section className="admin-panel admin-user-referral">
      <div><h2>{isZh ? '推荐渠道 / 公司' : 'Referral channel / company'}</h2><span>{referralSource || '—'}</span></div>
      <button type="button" className="admin-action-primary" onClick={exportExcel} disabled={exporting}>{exporting ? (isZh ? '正在生成…' : 'Generating…') : (isZh ? '导出 Excel' : 'Export Excel')}</button>
    </section>
    {error && <div className="error-msg">{error}</div>}
    <section className="admin-panel admin-table-card">
      <div className="admin-panel-header admin-panel-header-spread"><div><h2>{isZh ? '积分消费与变动明细' : 'Credit ledger'}</h2><span>{isZh ? `共 ${transactions.total} 条` : `${transactions.total} records`}</span></div><Pager page={transactionPage} pages={transactions.pages} onChange={setTransactionPage} language={language} /></div>
      {transactions.items.length ? <div className="admin-table-wrap"><table className="admin-table admin-ledger-table"><thead><tr><th>ID</th><th>{isZh ? '时间' : 'Time'}</th><th>{isZh ? '类型' : 'Type'}</th><th>{isZh ? '积分变化' : 'Credit change'}</th><th>{isZh ? '状态' : 'Status'}</th><th>{isZh ? '说明' : 'Description'}</th><th>{isZh ? '关联记录' : 'Reference'}</th></tr></thead><tbody>{transactions.items.map(item => <tr key={item.id}><td>{item.id}</td><td>{formatDate(item.created_at, language)}</td><td>{item.kind}</td><td className={item.delta < 0 ? 'admin-ledger-negative' : 'admin-ledger-positive'}>{item.delta > 0 ? '+' : ''}{item.delta}</td><td>{item.status}</td><td>{item.description}</td><td>{item.reference_type || '—'}{item.reference_id ? ` #${item.reference_id}` : ''}</td></tr>)}</tbody></table></div> : <p className="admin-empty">{isZh ? '暂无积分记录' : 'No credit records'}</p>}
    </section>
    <section className="admin-panel admin-table-card">
      <div className="admin-panel-header admin-panel-header-spread"><div><h2>{isZh ? '上游接口调用明细' : 'Upstream provider calls'}</h2><span>{isZh ? `共 ${providerCalls.total} 条；新日志从功能上线后开始记录` : `${providerCalls.total} records; logging starts after this feature is deployed`}</span></div><Pager page={providerPage} pages={providerCalls.pages} onChange={setProviderPage} language={language} /></div>
      {providerCalls.items.length ? <div className="admin-table-wrap"><table className="admin-table admin-ledger-table"><thead><tr><th>{isZh ? '时间' : 'Time'}</th><th>{isZh ? '服务商' : 'Provider'}</th><th>{isZh ? '操作' : 'Operation'}</th><th>{isZh ? '接口' : 'Endpoint'}</th><th>{isZh ? '结果' : 'Outcome'}</th><th>{isZh ? '耗时' : 'Duration'}</th><th>{isZh ? '调用摘要' : 'Call details'}</th><th>{isZh ? '关联记录 / 错误' : 'Reference / error'}</th></tr></thead><tbody>{providerCalls.items.map(item => <tr key={item.id}><td>{formatDate(item.created_at, language)}</td><td>{item.provider}</td><td>{item.operation}</td><td className="admin-break-cell"><code>{item.method} {item.endpoint}</code></td><td>{item.outcome}{item.status_code ? ` (${item.status_code})` : ''}</td><td>{item.duration_ms} ms</td><td><details className="admin-call-details"><summary>{isZh ? '查看摘要' : 'View summary'}</summary><strong>{isZh ? '请求' : 'Request'}</strong><pre>{prettySummary(item.request_summary)}</pre><strong>{isZh ? '响应' : 'Response'}</strong><pre>{prettySummary(item.response_summary)}</pre></details></td><td>{item.reference_type || '—'}{item.reference_id ? ` #${item.reference_id}` : ''}{item.error_summary ? <small className="admin-ledger-error">{item.error_summary}</small> : null}</td></tr>)}</tbody></table></div> : <p className="admin-empty">{isZh ? '暂无上游调用记录' : 'No upstream calls recorded'}</p>}
    </section>
  </>;
}
