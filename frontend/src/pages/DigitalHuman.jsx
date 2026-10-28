import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import apiClient, { apiBase } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './DigitalHuman.css';

const MODEL_POLL_INTERVAL = 5000;
const VIDEO_POLL_INTERVAL = 5000;

const copy = {
  zh: {
    title: '数字人视频', subtitle: '训练模型、选择语音并生成数字人视频。',
    tabTrain: '训练模型', tabCreate: '生成视频', tabVideos: '视频记录',
    train: '训练数字人模型', trainHint: '上传本人出镜的视频，训练完成后即可用于合成。',
    trainName: '模型名称', trainNamePlaceholder: '例如：我的数字人', trainVideo: '训练视频',
    trainVideoHint: 'MP4/MOV，10秒到5分钟，最大1GB，视频中只能有一个人脸。',
    chooseVideo: '选择视频', noFileSelected: '未选择任何文件', startTraining: '开始训练', training: '提交训练中…',
    trainingSubmitted: '训练任务已提交，请等待平台处理。', trainFailed: '训练提交失败',
    trainingStatus: '训练状态', modelPreparing: '准备中', modelTraining: '训练中',
    modelReady: '训练成功', modelFailed: '训练失败', models: '数字人模型',
    modelsHint: '查看模型状态或删除不再使用的模型。', deleteModel: '删除',
    deletingModel: '删除中…', deleteModelConfirm: '确定删除这个数字人模型吗？',
    modelDeleted: '数字人模型已删除', audios: '选择语音',
    audiosHint: '选择已完成的语音，用于数字人视频。', name: '视频名称（可选）',
    namePlaceholder: '例如：产品介绍', create: '生成数字人视频', creating: '提交中…',
    loading: '正在准备…', noModel: '暂无训练成功的数字人模型',
    noAudio: '暂无已完成的语音，请先到语音合成生成。', noVideo: '还没有数字人视频',
    pending: '排队中', processing: '合成中', completed: '已完成', failed: '失败',
    open: '打开视频', refresh: '刷新', loadFailed: '加载数字人数据失败',
    createFailed: '提交数字人任务失败', chooseModel: '请选择数字人模型',
    chooseAudio: '请选择语音', done: '数字人视频已生成',
    videoSubmitted: '数字人视频任务已提交，正在生成…', videoGenerating: '数字人视频生成中',
    videoGeneratingHint: '正在使用你的克隆声音生成视频，请稍候。',
    videoFailed: '数字人视频生成失败', watermark: '水印位置', none: '不添加',
    bottomRight: '右下角', topLeft: '左上角', topRight: '右上角', bottomLeft: '左下角',
    from: '来自语音', goSynthesis: '去语音合成', videoName: '视频名称', time: '创建时间',
    allowance: '赠送视频时长', remaining: '剩余', allowanceExhausted: '赠送时长已用完，后续按秒扣积分', pricingHint: '训练一个模型含30分钟视频；赠送时长用完后按秒扣积分。提交后暂扣，生成失败会退回。',
    costPreview: '本次预计', includedUsed: '使用赠送', extraSeconds: '超出', audioDurationPending: '正在读取语音时长',
  },
  en: {
    title: 'Digital Human Video', subtitle: 'Train a model, select speech, and generate a digital-human video.',
    tabTrain: 'Train model', tabCreate: 'Create video', tabVideos: 'Video history',
    train: 'Train a digital-human model', trainHint: 'Upload a video of yourself. After training, the model can generate videos.',
    trainName: 'Model name', trainNamePlaceholder: 'For example: My digital human', trainVideo: 'Training video',
    trainVideoHint: 'MP4/MOV, 10 seconds to 5 minutes, up to 1GB, one face only.',
    chooseVideo: 'Choose video', noFileSelected: 'No file selected', startTraining: 'Start training', training: 'Submitting…',
    trainingSubmitted: 'Training submitted. Please wait for processing.', trainFailed: 'Could not submit training',
    trainingStatus: 'Training status', modelPreparing: 'Preparing', modelTraining: 'Training',
    modelReady: 'Ready', modelFailed: 'Failed', models: 'Digital-human models',
    modelsHint: 'Review model status or remove models you no longer need.', deleteModel: 'Delete',
    deletingModel: 'Deleting…', deleteModelConfirm: 'Delete this digital-human model?',
    modelDeleted: 'Digital-human model deleted', audios: 'Choose audio',
    audiosHint: 'Select completed speech for your video.', name: 'Video name (optional)',
    namePlaceholder: 'For example: Product introduction', create: 'Generate video', creating: 'Submitting…',
    loading: 'Preparing…', noModel: 'No trained digital-human models yet',
    noAudio: 'No completed audio yet. Generate speech first.', noVideo: 'No digital-human videos yet',
    pending: 'Queued', processing: 'Composing', completed: 'Completed', failed: 'Failed',
    open: 'Open video', refresh: 'Refresh', loadFailed: 'Could not load digital-human data',
    createFailed: 'Could not submit the video task', chooseModel: 'Choose a digital-human model',
    chooseAudio: 'Choose audio', done: 'Digital-human video is ready',
    videoSubmitted: 'Digital-human video task submitted. Generating…', videoGenerating: 'Generating digital-human video',
    videoGeneratingHint: 'Your cloned voice is being used to generate the video. Please wait.',
    videoFailed: 'Digital-human video generation failed', watermark: 'Watermark', none: 'None',
    bottomRight: 'Bottom right', topLeft: 'Top left', topRight: 'Top right', bottomLeft: 'Bottom left',
    from: 'From audio', goSynthesis: 'Go to synthesis', videoName: 'Video name', time: 'Created',
    allowance: 'Included video time', remaining: 'remaining', allowanceExhausted: 'Included time used; additional seconds use credits', pricingHint: 'A trained model includes 30 minutes of video. Additional seconds use credits. Reservations are refunded on failure.',
    costPreview: 'Estimated charge', includedUsed: 'Included', extraSeconds: 'Extra', audioDurationPending: 'Reading audio duration',
  },
};

const tabs = [
  { key: 'train', label: 'tabTrain' },
  { key: 'create', label: 'tabCreate' },
  { key: 'videos', label: 'tabVideos' },
];

function assetUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${window.location.origin}${url}`;
}

function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function AllowanceProgress({ model, text }) {
  const total = Number(model.included_seconds_total) || 0;
  const remaining = Math.min(total, Math.max(0, Number(model.included_seconds_remaining) || 0));
  if (remaining === 0) return <div className="digital-human-allowance">{text.allowanceExhausted}</div>;
  const usedPercent = total ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 100;
  return <div className="digital-human-allowance"><span>{text.allowance}: {formatDuration(remaining)} / {formatDuration(total)} {text.remaining}</span><div className="digital-human-allowance-track" role="progressbar" aria-label={text.allowance} aria-valuemin={0} aria-valuemax={total} aria-valuenow={remaining}><span style={{ width: `${100 - usedPercent}%` }} /></div></div>;
}

export default function DigitalHuman() {
  const { language } = useLanguage();
  const [searchParams] = useSearchParams();
  const requestedJobId = searchParams.get('audio');
  const text = copy[language];
  const [activeTab, setActiveTab] = useState('train');
  const [models, setModels] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [videos, setVideos] = useState([]);
  const [modelId, setModelId] = useState('');
  const [jobId, setJobId] = useState('');
  const [trainingName, setTrainingName] = useState('');
  const [trainingFile, setTrainingFile] = useState(null);
  const [videoName, setVideoName] = useState('');
  const [watermark, setWatermark] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generatingVideoId, setGeneratingVideoId] = useState(null);
  const [deletingModelId, setDeletingModelId] = useState(null);
  const [creditCosts, setCreditCosts] = useState({ digital_human_model: 0, digital_human_video: 0 });
  const [previewDuration, setPreviewDuration] = useState(null);

  useEffect(() => {
    apiClient.get('/billing/catalog')
      .then(({ data }) => setCreditCosts(data.operation_costs || {}))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [modelsRes, jobsRes, videosRes] = await Promise.all([
        apiClient.get('/digital-human/models'),
        apiClient.get('/synthesis/'),
        apiClient.get('/digital-human/videos'),
      ]);
      const availableModels = modelsRes.data.models || [];
      const readyModels = availableModels.filter((model) => Number(model.status) === 2);
      const completedJobs = (jobsRes.data || []).filter((job) => job.status === 'completed' && job.output_filename);
      setModels(availableModels);
      setJobs(completedJobs);
      setVideos(videosRes.data || []);
      setModelId((current) => current || String(readyModels[0]?.id || ''));
      setJobId((current) => current || requestedJobId || String(completedJobs[0]?.id || ''));
    } catch (err) {
      setError(err.response?.data?.detail || text.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [requestedJobId, text.loadFailed]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!videos.some((video) => ['pending', 'processing'].includes(video.status))) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const [videoResponse, modelResponse] = await Promise.all([
          apiClient.get('/digital-human/videos'), apiClient.get('/digital-human/models'),
        ]);
        setVideos(videoResponse.data || []);
        setModels(modelResponse.data.models || []);
      } catch { /* the next poll can retry */ }
    }, VIDEO_POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [videos]);

  useEffect(() => {
    if (!models.some((model) => ![2, 3, 4].includes(Number(model.status)))) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const { data } = await apiClient.get('/digital-human/models');
        setModels(data.models || []);
      } catch { /* the next poll can retry */ }
    }, MODEL_POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [models]);

  useEffect(() => {
    if (!generatingVideoId) return;
    const video = videos.find((item) => item.id === generatingVideoId);
    if (!video || ['pending', 'processing'].includes(video.status)) return;
    setGeneratingVideoId(null);
    if (video.status === 'completed') setNotice(text.done);
    if (video.status === 'failed') setError(video.fail_reason || text.videoFailed);
  }, [videos, generatingVideoId, text]);

  const selectedModel = useMemo(() => models.find((model) => String(model.id) === String(modelId)), [models, modelId]);
  const readyModels = useMemo(() => models.filter((model) => Number(model.status) === 2), [models]);
  const selectedJob = useMemo(() => jobs.find((job) => String(job.id) === String(jobId)), [jobs, jobId]);
  const selectedAudioSeconds = Number(selectedJob?.duration_seconds) || (
    previewDuration && selectedJob && previewDuration.jobId === selectedJob.id ? previewDuration.seconds : 0
  );
  const includedForVideo = Math.min(selectedAudioSeconds, Number(selectedModel?.included_seconds_remaining) || 0);
  const extraForVideo = Math.max(0, selectedAudioSeconds - includedForVideo);
  const videoCreditEstimate = extraForVideo * (Number(creditCosts.digital_human_video) || 0);

  const submitTraining = async (event) => {
    event.preventDefault();
    if (!trainingName.trim() || !trainingFile) {
      setError(language === 'zh' ? '请填写模型名称并选择训练视频' : 'Enter a model name and choose a training video');
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    const form = new FormData();
    form.append('name', trainingName.trim());
    form.append('file', trainingFile);
    try {
      await apiClient.post('/digital-human/models/train', form);
      setNotice(text.trainingSubmitted);
      setTrainingName('');
      setTrainingFile(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || text.trainFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedModel) { setError(text.chooseModel); return; }
    if (!selectedJob) { setError(text.chooseAudio); return; }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const { data } = await apiClient.post('/digital-human/videos', {
        synthesis_job_id: selectedJob.id,
        model_id: selectedModel.id,
        video_name: videoName.trim() || null,
        watermark_pos: watermark || null,
      });
      setVideos((current) => [data, ...current]);
      setModels((current) => current.map((model) => String(model.id) === String(data.model_id)
        ? { ...model, included_seconds_remaining: Math.max(0, (Number(model.included_seconds_remaining) || 0) - (Number(data.included_seconds_used) || 0)) }
        : model));
      setNotice(text.videoSubmitted);
      setGeneratingVideoId(data.id);
      setVideoName('');
      setActiveTab('videos');
    } catch (err) {
      setError(err.response?.data?.detail || text.createFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteModel = async (model) => {
    if (!window.confirm(text.deleteModelConfirm)) return;
    setDeletingModelId(model.id);
    setError('');
    try {
      await apiClient.delete(`/digital-human/models/${model.id}`);
      setModels((current) => current.filter((item) => item.id !== model.id));
      if (String(modelId) === String(model.id)) setModelId('');
      setNotice(text.modelDeleted);
    } catch (err) {
      setError(err.response?.data?.detail || text.loadFailed);
    } finally {
      setDeletingModelId(null);
    }
  };

  const modelStatusText = (status) => {
    const value = Number(status);
    if (value === 2) return text.modelReady;
    if (value === 1) return text.modelTraining;
    if (value === 3 || value === 4) return text.modelFailed;
    return text.modelPreparing;
  };
  const statusText = (status) => text[status] || status;

  return (
    <main className="digital-human-page">
      <header className="digital-human-page-heading">
        <div><h1>{text.title}</h1><p>{text.subtitle}</p></div>
      </header>

      <nav className="digital-human-tabs" role="tablist" aria-label={text.title}>
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            id={`digital-human-tab-${tab.key}`}
            aria-controls={`digital-human-panel-${tab.key}`}
            aria-selected={activeTab === tab.key}
            className={activeTab === tab.key ? 'is-active' : ''}
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setError(''); setNotice(''); }}
          >{text[tab.label]}</button>
        ))}
      </nav>

      {error && <div className="digital-human-alert error" role="alert">{error}</div>}
      {notice && <div className="digital-human-alert success" role="status">{notice}</div>}
      {generatingVideoId && <div className="digital-human-generation" role="status" aria-live="polite"><span className="digital-human-generation-spinner" aria-hidden="true" /><div><strong>{text.videoGenerating}</strong><p>{text.videoGeneratingHint}</p></div></div>}

      <section className="digital-human-panel" role="tabpanel" id={`digital-human-panel-${activeTab}`} aria-labelledby={`digital-human-tab-${activeTab}`}>
        {activeTab === 'train' && (
          <div className="digital-human-train-grid">
            <form className="digital-human-card digital-human-training" onSubmit={submitTraining}>
              <div className="digital-human-heading"><span>01</span><div><h2>{text.train}</h2><p>{text.trainHint}</p></div></div>
              <label className="digital-human-field">{text.trainName}<input value={trainingName} onChange={(event) => setTrainingName(event.target.value)} maxLength={80} placeholder={text.trainNamePlaceholder} /></label>
              <div className="digital-human-field">
                <span>{text.trainVideo}</span>
                <div className="digital-human-file-control">
                  <input id="digital-human-training-video" className="digital-human-file-input" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" onChange={(event) => setTrainingFile(event.target.files?.[0] || null)} />
                  <label className="digital-human-file-button" htmlFor="digital-human-training-video">{text.chooseVideo}</label>
                  <span className="digital-human-file-name">{trainingFile?.name || text.noFileSelected}</span>
                </div>
                <small>{text.trainVideoHint}</small>
              </div>
              <button className="digital-human-submit" type="submit" disabled={submitting || loading}>{submitting ? text.training : `${text.startTraining} · ${creditCosts.digital_human_model || 0} ${language === 'zh' ? '积分' : 'credits'}`}</button>
            </form>

            <section className="digital-human-card digital-human-model-management">
              <div className="digital-human-heading"><span>02</span><div><h2>{text.models}</h2><p>{text.modelsHint}</p></div></div>
              {loading ? <div className="digital-human-empty">{text.loading}</div> : models.length === 0 ? <div className="digital-human-empty">{text.noModel}</div> : (
                <div className="digital-human-model-list">
                  {models.map((model) => (
                    <article className="digital-human-model-row" key={model.id}>
                      {model.cover_url ? <img src={model.cover_url} alt="" /> : <span className="digital-human-model-placeholder">人</span>}
                      <div><strong>{model.name}</strong><small>ID: {model.id}</small><AllowanceProgress model={model} text={text} /></div>
                      <span className={`digital-human-status is-model-${Number(model.status)}`}>{modelStatusText(model.status)}</span>
                      <button type="button" className="digital-human-model-delete" disabled={deletingModelId === model.id} onClick={() => deleteModel(model)}>{deletingModelId === model.id ? text.deletingModel : text.deleteModel}</button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'create' && (
          <form className="digital-human-create-grid" onSubmit={submit}>
            <section className="digital-human-card digital-human-select-card">
              <div className="digital-human-heading"><span>01</span><div><h2>{text.models}</h2><p>{text.modelsHint}</p></div></div>
              {loading ? <div className="digital-human-empty">{text.loading}</div> : readyModels.length === 0 ? <div className="digital-human-empty">{text.noModel}<Link to="/digital-human">{text.tabTrain} →</Link></div> : (
                <div className="digital-human-options">
                  {readyModels.map((model) => (
                    <button type="button" key={model.id} className={`digital-human-model-select ${String(model.id) === String(modelId) ? 'is-active' : ''}`} onClick={() => setModelId(String(model.id))}>
                      {model.cover_url ? <img src={model.cover_url} alt="" /> : <span className="digital-human-model-placeholder">人</span>}
                      <span><strong>{model.name}</strong><small>ID: {model.id}</small><AllowanceProgress model={model} text={text} /></span><b>{String(model.id) === String(modelId) ? '✓' : ''}</b>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="digital-human-card digital-human-select-card">
              <div className="digital-human-heading"><span>02</span><div><h2>{text.audios}</h2><p>{text.audiosHint}</p></div></div>
              {loading ? <div className="digital-human-empty">{text.loading}</div> : jobs.length === 0 ? <div className="digital-human-empty">{text.noAudio}<Link to="/synthesis">{text.goSynthesis} →</Link></div> : (
                <div className="digital-human-audio-list">
                  {jobs.map((job) => (
                    <button type="button" key={job.id} className={String(job.id) === String(jobId) ? 'is-active' : ''} onClick={() => setJobId(String(job.id))}>
                      <span className="digital-human-audio-icon">♫</span><span><strong>{job.audio_name || job.input_text}</strong><small>{new Date(job.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small></span><b>{String(job.id) === String(jobId) ? '✓' : ''}</b>
                    </button>
                  ))}
                </div>
              )}
              {selectedJob && <audio className="digital-human-preview" controls src={`${apiBase}/static/outputs/${selectedJob.output_filename}`} onLoadedMetadata={(event) => { const seconds = Math.ceil(event.currentTarget.duration); if (Number.isFinite(seconds)) setPreviewDuration({ jobId: selectedJob.id, seconds }); }} />}
            </section>

            <section className="digital-human-card digital-human-video-settings">
              <div className="digital-human-heading"><span>03</span><div><h2>{text.create}</h2><p>{selectedModel?.name || text.chooseModel} · {selectedJob ? `${text.from} #${selectedJob.id}` : text.chooseAudio}</p></div></div>
              <div className="digital-human-video-quote">
                {selectedModel && <AllowanceProgress model={selectedModel} text={text} />}
                <p>{selectedAudioSeconds ? `${text.costPreview}: ${formatDuration(selectedAudioSeconds)} · ${text.includedUsed} ${formatDuration(includedForVideo)} · ${text.extraSeconds} ${formatDuration(extraForVideo)} × ${creditCosts.digital_human_video || 0} = ${videoCreditEstimate} ${language === 'zh' ? '积分' : 'credits'}` : text.audioDurationPending}</p>
                <small>{text.pricingHint}</small>
              </div>
              <label className="digital-human-field">{text.name}<input value={videoName} onChange={(event) => setVideoName(event.target.value)} maxLength={120} placeholder={text.namePlaceholder} /></label>
              <label className="digital-human-field">{text.watermark}<select value={watermark} onChange={(event) => setWatermark(event.target.value)}><option value="">{text.none}</option><option value="bottom-right">{text.bottomRight}</option><option value="top-left">{text.topLeft}</option><option value="top-right">{text.topRight}</option><option value="bottom-left">{text.bottomLeft}</option></select></label>
              <button className="digital-human-submit" type="submit" disabled={submitting || loading || !selectedAudioSeconds}>{submitting ? text.creating : `${text.create} · ${videoCreditEstimate} ${language === 'zh' ? '积分' : 'credits'}`}</button>
            </section>
          </form>
        )}

        {activeTab === 'videos' && (
          <section className="digital-human-card digital-human-video-history">
            <div className="digital-human-history-head"><div className="digital-human-heading"><span>01</span><div><h2>{text.title}</h2><p>{text.time}</p></div></div><button type="button" onClick={load} disabled={loading}>{text.refresh}</button></div>
            {loading ? <div className="digital-human-empty">{text.loading}</div> : videos.length === 0 ? <div className="digital-human-empty">{text.noVideo}</div> : (
              <div className="digital-human-video-list">{videos.map((video) => (
                <article key={video.id}>
                      <div><strong>{video.video_name || `${text.title} #${video.id}`}</strong><small>{statusText(video.status)} · {new Date(video.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}{video.duration_seconds ? ` · ${formatDuration(video.duration_seconds)}` : ''} · {video.charged_credits || 0} {language === 'zh' ? '积分' : 'credits'}</small></div>
                  {video.status === 'completed' && video.video_url ? <a href={assetUrl(video.video_url)} target="_blank" rel="noreferrer">{text.open}</a> : <span className={`digital-human-status is-${video.status}`}>{statusText(video.status)}</span>}
                  {video.status === 'failed' && video.fail_reason && <p>{video.fail_reason}</p>}
                </article>
              ))}</div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
