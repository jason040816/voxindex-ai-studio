import { useState, useEffect, useCallback } from 'react';
import apiClient, { apiBase } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './History.css';

const copy = {
  zh: { all: '全部', completed: '已完成', failed: '失败', pending: '处理中', confirm: '确定删除这条历史记录吗？对应音频也会一起删除。', deleteFailed: '删除失败，请稍后重试。', loadFailed: '历史记录加载失败。', retry: '重新加载', title: '历史记录', subtitle: '管理已生成的语音，支持试听、下载和删除。', placeholder: '搜索生成的文字…', loading: '正在加载历史记录…', empty: '没有找到生成记录', emptyHint: '调整筛选条件，或先去语音合成生成一段语音。', deleting: '删除中…', delete: '删除', download: '下载音频', previous: '上一页', next: '下一页', page: '第' },
  en: { all: 'All', completed: 'Completed', failed: 'Failed', pending: 'Processing', confirm: 'Delete this record? Its audio file will also be deleted.', deleteFailed: 'Could not delete this record. Please try again.', loadFailed: 'History could not be loaded.', retry: 'Reload', title: 'History', subtitle: 'Manage generated audio: preview, download, or delete it.', placeholder: 'Search generated text…', loading: 'Loading history…', empty: 'No generated audio found', emptyHint: 'Adjust the filters or create new speech in Voice Synthesis.', deleting: 'Deleting…', delete: 'Delete', download: 'Download audio', previous: 'Previous', next: 'Next', page: 'Page' },
};

export default function History() {
  const { language } = useLanguage();
  const text = copy[language];
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const itemsPerPage = 10;

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await apiClient.get('/synthesis/');
      setJobs(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const deleteJob = async (job) => {
    if (!window.confirm(text.confirm)) return;
    setDeletingId(job.id);
    try {
      await apiClient.delete('/synthesis/' + job.id);
      setJobs((current) => current.filter((item) => item.id !== job.id));
    } catch (err) {
      window.alert(err.response?.data?.detail || text.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredJobs = jobs
    .filter((job) => statusFilter === 'all' || job.status === statusFilter)
    .filter((job) => `${job.audio_name || ''} ${job.input_text}`.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <main className="daxi-history">
      <section className="daxi-history-hero">
        <span>DAXI VOICE</span>
        <h1>{text.title}</h1>
        <p>{text.subtitle}</p>
      </section>

      <section className="daxi-history-panel">
        <div className="daxi-history-toolbar">
          <label className="daxi-history-search">
            <span>⌕</span>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={text.placeholder} />
          </label>
          <div className="daxi-history-filters">
            {['all', 'completed', 'failed', 'pending'].map((status) => (
              <button type="button" key={status} className={statusFilter === status ? 'is-active' : ''} onClick={() => { setStatusFilter(status); setPage(1); }}>
                {text[status]}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className="daxi-history-empty is-loading">{text.loading}</div> : loadError ? (
          <div className="daxi-history-empty"><span>!</span><strong>{text.loadFailed}</strong><button type="button" className="daxi-history-retry" onClick={loadHistory}>{text.retry}</button></div>
        ) : paginatedJobs.length === 0 ? (
          <div className="daxi-history-empty"><span>♫</span><strong>{text.empty}</strong><p>{text.emptyHint}</p></div>
        ) : (
          <div className="daxi-history-list">
            {paginatedJobs.map((job) => (
              <article className="daxi-history-item" key={job.id}>
                <div className="daxi-history-item-top">
                  <span className="daxi-history-item-icon">♫</span>
                  <div className="daxi-history-meta">
                    <span className={['daxi-history-status', 'is-' + job.status].join(' ')}>{text[job.status] || job.status}</span>
                    <time>{new Date(job.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</time>
                  </div>
                  <button type="button" className="daxi-history-delete" disabled={deletingId === job.id} onClick={() => deleteJob(job)}>
                    {deletingId === job.id ? text.deleting : text.delete}
                  </button>
                </div>
                <p className="daxi-history-text"><strong>{job.audio_name || job.input_text}</strong>{job.audio_name && <small>{job.input_text}</small>}</p>
                {job.status === 'completed' && job.output_filename && (
                  <div className="daxi-history-audio">
                    <audio controls src={apiBase + '/static/outputs/' + job.output_filename} />
                    <a href={apiBase + '/static/outputs/' + job.output_filename} download>{text.download}</a>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav className="daxi-pagination">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>{text.previous}</button>
            <span>{text.page} {currentPage} / {totalPages}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages}>{text.next}</button>
          </nav>
        )}
      </section>
    </main>
  );
}
