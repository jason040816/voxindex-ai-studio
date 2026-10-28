import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';
import { useLanguage } from '../context/LanguageContext';
import apiClient from '../api/client';
import WorkspaceIcon from '../components/WorkspaceIcon';

const copy = {
  zh: {
    title: '控制台',
    clone: '声音克隆', cloneDesc: '上传或录制授权声音，创建专属音色。',
    digital: '数字人视频', digitalDesc: '将生成的语音用于数字人视频创作。',
    synth: '语音合成', synthDesc: '输入文字，生成可试听、可下载的语音。',
    history: '生成记录', historyDesc: '查看、下载或管理已生成的内容。',
    recent: '最近生成', recentDesc: '查看最近的生成任务。', all: '查看全部',
    completed: '已完成', failed: '失败', pending: '处理中', processing: '生成中',
    empty: '还没有生成记录。', first: '去生成第一段语音', content: '内容预览', date: '生成时间',
  },
  en: {
    title: 'Dashboard',
    clone: 'Voice clone', cloneDesc: 'Create a custom voice from an authorized recording.',
    digital: 'Digital-human video', digitalDesc: 'Use generated speech to create a digital-human video.',
    synth: 'Voice synthesis', synthDesc: 'Turn text into speech you can preview and download.',
    history: 'Generation history', historyDesc: 'Review, download, or manage generated content.',
    recent: 'Recent generations', recentDesc: 'Your latest generation tasks.', all: 'View all',
    completed: 'Completed', failed: 'Failed', pending: 'Processing', processing: 'Generating',
    empty: 'No generation history yet.', first: 'Create your first audio', content: 'Content preview', date: 'Created',
  },
};

export default function Dashboard() {
  const { language } = useLanguage();
  const text = copy[language];
  const [recentJobs, setRecentJobs] = useState([]);

  useEffect(() => {
    let active = true;
    apiClient.get('/synthesis/')
      .then((res) => { if (active) setRecentJobs((res.data || []).slice(0, 5)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const featureCards = [
    { to: '/voice-clone', title: text.clone, description: text.cloneDesc, icon: 'mic', tone: 'blue' },
    { to: '/digital-human', title: text.digital, description: text.digitalDesc, icon: 'human', tone: 'mint' },
  ];
  const shortcuts = [
    { to: '/voice-clone', title: text.clone, description: text.cloneDesc, icon: 'mic', tone: 'blue' },
    { to: '/synthesis', title: text.synth, description: text.synthDesc, icon: 'audio', tone: 'violet' },
    { to: '/history', title: text.history, description: text.historyDesc, icon: 'history', tone: 'mint' },
  ];

  return (
    <div className="daxi-dashboard">
      <h1 className="daxi-dashboard-sr-only">{text.title}</h1>

      <section className="daxi-dashboard-features" aria-label={language === 'zh' ? '主要功能' : 'Main features'}>
        {featureCards.map((card) => <Link to={card.to} className={`daxi-feature-card tone-${card.tone}`} key={card.to}>
          <span className="daxi-feature-copy"><strong>{card.title}</strong><span>{card.description}</span></span>
          <span className="daxi-feature-symbol" aria-hidden="true"><WorkspaceIcon name={card.icon} size={42} /></span>
          <span className="daxi-feature-arrow" aria-hidden="true"><WorkspaceIcon name="arrow" size={17} /></span>
        </Link>)}
      </section>

      <section className="daxi-dashboard-shortcuts" aria-label={language === 'zh' ? '快捷入口' : 'Quick links'}>
        {shortcuts.map((item) => <Link to={item.to} className="daxi-shortcut" key={item.to}>
          <span className={`daxi-shortcut-icon tone-${item.tone}`} aria-hidden="true"><WorkspaceIcon name={item.icon} size={23} /></span>
          <span className="daxi-shortcut-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
          <WorkspaceIcon className="daxi-shortcut-arrow" name="arrow" size={17} />
        </Link>)}
      </section>

      <section className="daxi-recent" aria-labelledby="daxi-recent-title">
        <div className="daxi-recent-heading">
          <div><h2 id="daxi-recent-title">{text.recent}</h2><p>{text.recentDesc}</p></div>
          <Link to="/history" className="daxi-recent-all">{text.all}<WorkspaceIcon name="arrow" size={16} /></Link>
        </div>
        {recentJobs.length === 0 ? (
          <div className="daxi-recent-empty"><p>{text.empty}</p><Link to="/synthesis">{text.first}<WorkspaceIcon name="arrow" size={16} /></Link></div>
        ) : (
          <div className="daxi-recent-list">
            <div className="daxi-recent-labels"><span></span><span>{text.content}</span><span>{language === 'zh' ? '状态' : 'Status'}</span><span>{text.date}</span></div>
            {recentJobs.map((job) => (
              <article className="daxi-recent-item" key={job.id}>
                <span className="daxi-recent-type" aria-hidden="true"><WorkspaceIcon name="audio" size={18} /></span>
                <p title={job.input_text}>{job.input_text || (language === 'zh' ? '语音任务' : 'Speech task')}</p>
                <span className={`daxi-job-status is-${job.status}`}>{text[job.status] || job.status}</span>
                <time dateTime={job.created_at}>{new Date(job.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
