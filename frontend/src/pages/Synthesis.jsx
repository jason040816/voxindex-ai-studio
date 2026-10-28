import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient, { apiBase } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './Synthesis.css';

const pageText = {
  zh: {
    example: '您好，欢迎使用大汐语音。现在，您可以把文字快速转换成自然流畅的语音。',
    loadError: '音色列表加载失败，请刷新页面重试。', chooseVoice: '请选择一个音色。', enterText: '请先输入要合成的文字。',
    failed: '生成没有完成，请稍后再试。', requestFailed: '语音生成失败，请稍后再试。',
    connectionInterrupted: '连接中断，语音可能仍在后台生成。请先到“生成记录”查看，确认没有结果后再重试，避免重复扣分。', checkingResult: '连接中断，正在核对后台生成结果，请勿重复提交…', history: '查看生成记录',
    title: '语音合成', subtitle: '选择声音，输入文字，一键生成可试听、可下载的音频文件。', clone: '创建专属声音',
    selectTitle: '选择声音', selectHint: '先用官方音色即可生成；克隆成功后也会出现在这里。', loading: '正在准备音色…',
    textTitle: '输入文字', textHint: '一次最多 2,000 个字符。', placeholder: '请输入要转换为语音的文字…', exampleButton: '使用示例文字', audioName: '音频名称', audioNamePlaceholder: '例如：产品介绍片头',
    speed: '语速', volume: '音量', pitch: '音调', resultTitle: '生成与试听', current: '当前选择：', noVoice: '请选择一个声音',
    done: '语音已生成', downloadHint: '可以直接试听或保存到电脑。', download: '下载音频', waiting: '等待生成', waitingHint: '填写文字后，点击下方按钮开始。',
    generating: '正在生成语音…', generate: '生成语音', cost: '每次生成按整数积分向上取整；实际扣分以服务器计算结果为准。', billableChars: '计费字符', rawCredits: '原始积分', chargedCredits: '实扣', rateLoading: '正在读取计费费率…', rateFailed: '计费费率加载失败，请刷新页面重试。', official: '官方音色', cloneKind: '我的音色', cloneHint: '你的专属克隆音色',
  },
  en: {
    example: 'Hello, welcome to DAXI Voice. Turn your text into natural, fluent speech in just a few clicks.',
    loadError: 'Could not load voices. Please refresh and try again.', chooseVoice: 'Please select a voice.', enterText: 'Please enter text to synthesize.',
    failed: 'The generation did not complete. Please try again.', requestFailed: 'Speech generation failed. Please try again.',
    connectionInterrupted: 'The connection was interrupted, but synthesis may still finish. Check History before retrying to avoid a duplicate charge.', checkingResult: 'Connection interrupted. Checking the generation result; please do not submit again…', history: 'View history',
    title: 'Voice Synthesis', subtitle: 'Choose a voice, enter text, and generate audio you can play or download.', clone: 'Create a custom voice',
    selectTitle: 'Choose a voice', selectHint: 'Use an official voice first. Your cloned voices will appear here after they are ready.', loading: 'Preparing voices…',
    textTitle: 'Enter text', textHint: 'Up to 2,000 characters per request.', placeholder: 'Enter the text you want to turn into speech…', exampleButton: 'Use example text', audioName: 'Audio name', audioNamePlaceholder: 'For example: Product intro',
    speed: 'Speed', volume: 'Volume', pitch: 'Pitch', resultTitle: 'Generate & preview', current: 'Selected:', noVoice: 'Select a voice',
    done: 'Speech is ready', downloadHint: 'Play it now or save it to your computer.', download: 'Download audio', waiting: 'Ready to generate', waitingHint: 'Enter text, then click the button below.',
    generating: 'Generating speech…', generate: 'Generate speech', cost: 'Each request rounds up to whole credits. The server confirms the final charge.', billableChars: 'Billable characters', rawCredits: 'raw credits', chargedCredits: 'charge', rateLoading: 'Loading the billing rate…', rateFailed: 'Could not load the billing rate. Please refresh.', official: 'Official voice', cloneKind: 'My voice', cloneHint: 'Your custom cloned voice',
  },
};

const englishVoices = {
  'v-female-R2s4N9qJ': ['Gentle Lady', 'Warm and natural for brand introductions'],
  'v-male-W1tH9jVc': ['Natural Man', 'Clear and steady for explainers and support'],
  'female-kefu-xiaomei': ['Customer Service Xiaomei', 'Bright and professional for announcements'],
  'v-male-Bk7vD3xP': ['Commanding Male', 'Confident and powerful for promotional content'],
};

export default function Synthesis() {
  const { language } = useLanguage();
  const copy = pageText[language];
  const [voices, setVoices] = useState({ presets: [], clones: [] });
  const [selectedVoice, setSelectedVoice] = useState('');
  const [text, setText] = useState(() => pageText.zh.example);
  const [audioName, setAudioName] = useState('');
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [creditCost, setCreditCost] = useState(null);
  const [rateError, setRateError] = useState(false);

  useEffect(() => {
    apiClient.get('/billing/catalog')
      .then(({ data }) => {
        const rate = Number(data.operation_costs?.audio_generation);
        if (!Number.isInteger(rate) || rate < 0) throw new Error('Invalid synthesis rate');
        setCreditCost(rate);
      })
      .catch(() => setRateError(true));
  }, []);

  useEffect(() => {
    setText((current) => current === pageText.zh.example || current === pageText.en.example ? copy.example : current);
  }, [language, copy.example]);

  useEffect(() => {
    apiClient.get('/synthesis/voices')
      .then(({ data }) => {
        setVoices(data);
        if (data.presets?.[0]) setSelectedVoice(`preset:${data.presets[0].reference_id}`);
      })
      .catch((err) => setError(err.response?.data?.detail || copy.loadError))
      .finally(() => setLoadingVoices(false));
  }, [copy.loadError]);

  const allVoices = useMemo(() => [
    ...voices.presets.map((voice) => {
      const translated = language === 'en' ? englishVoices[voice.id] : null;
      return { ...voice, name: translated?.[0] || voice.name, description: translated?.[1] || voice.description, key: `preset:${voice.reference_id}`, referenceId: voice.reference_id, kind: copy.official };
    }),
    ...voices.clones.map((voice) => ({ ...voice, key: `clone:${voice.id}`, referenceId: voice.id, description: copy.cloneHint, kind: copy.cloneKind })),
  ], [voices, language, copy]);

  const activeVoice = allVoices.find((voice) => voice.key === selectedVoice);
  const normalizedText = text.trim().replaceAll('/', ' slash ').replaceAll('\\', ' slash ').trim().replace(/\s+/gu, ' ');
  const billableCharacters = Array.from(normalizedText).length;
  const estimatedCreditCost = creditCost === null ? null : Math.ceil(billableCharacters * creditCost / 10000);
  const rawCreditCost = creditCost === null ? null : (billableCharacters * creditCost / 10000).toFixed(4).replace(/\.?0+$/, '') || '0';

  const submit = async (event) => {
    event.preventDefault();
    if (!activeVoice) { setError(copy.chooseVoice); return; }
    if (!text.trim()) { setError(copy.enterText); return; }
    setGenerating(true);
    setError('');
    setResult(null);
    let previousJobIds = null;
    try {
      // A baseline lets us identify this submission after a gateway timeout
      // without mistaking an older generation of the same text for this one.
      try {
        const { data } = await apiClient.get('/synthesis/');
        previousJobIds = new Set(data.map((job) => job.id));
      } catch {
        // Generation can still proceed; the fallback tells the user to check History.
      }
      const { data } = await apiClient.post('/synthesis/', {
        voice_ref_id: activeVoice.referenceId,
        audio_name: audioName.trim() || null,
        text: text.trim(),
        speed,
        volume,
        pitch,
      });
      if (data.status !== 'completed') setError(data.error_message || copy.failed);
      else setResult(data);
    } catch (err) {
      const interrupted = !err.response || [502, 503, 504].includes(err.response.status);
      if (interrupted && previousJobIds) {
        setError(copy.checkingResult);
        let failedChecks = 0;
        for (let attempt = 0; attempt < 25; attempt += 1) {
          try {
            const { data } = await apiClient.get('/synthesis/');
            const job = data.find((item) => !previousJobIds.has(item.id)
              && item.voice_ref_id === activeVoice.referenceId && item.input_text === normalizedText);
            if (job?.status === 'completed') {
              setResult(job);
              setError('');
              return;
            }
            if (job?.status === 'failed') {
              setError(copy.failed);
              return;
            }
            failedChecks = 0;
          } catch {
            failedChecks += 1;
            if (failedChecks >= 2) break;
          }
          if (attempt < 24) await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
      setError(interrupted ? copy.connectionInterrupted : err.response?.data?.detail || copy.requestFailed);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="daxi-synth">
      <section className="daxi-synth-hero">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <Link to="/voice-clone" className="daxi-synth-link">{copy.clone} <span>→</span></Link>
      </section>

      {error && <div className="daxi-alert daxi-alert-error">{error} {[copy.connectionInterrupted, copy.checkingResult].includes(error) && <Link to="/history">{copy.history} →</Link>}</div>}

      <form className="daxi-synth-grid" onSubmit={submit}>
        <section className="daxi-card daxi-voice-card">
          <div className="daxi-card-heading">
            <span className="daxi-step">01</span>
            <div><h2>{copy.selectTitle}</h2><p>{copy.selectHint}</p></div>
          </div>
          {loadingVoices ? <div className="daxi-loading">{copy.loading}</div> : (
            <div className="daxi-voice-list">
              {allVoices.map((voice) => (
                <button type="button" key={voice.key} className={`daxi-voice-option ${selectedVoice === voice.key ? 'is-active' : ''}`} onClick={() => setSelectedVoice(voice.key)}>
                  <span className="daxi-voice-avatar">{voice.name?.slice(0, 1) || '声'}</span>
                  <span className="daxi-voice-copy"><strong>{voice.name}</strong><small>{voice.description || voice.kind}</small></span>
                  <span className="daxi-voice-check">{selectedVoice === voice.key ? '✓' : ''}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="daxi-card daxi-text-card">
          <div className="daxi-card-heading">
            <span className="daxi-step">02</span>
            <div><h2>{copy.textTitle}</h2><p>{copy.textHint}</p></div>
          </div>
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder={copy.placeholder} />
          <label className="daxi-audio-name-field"><span>{copy.audioName}</span><input value={audioName} onChange={(event) => setAudioName(event.target.value)} maxLength={120} placeholder={copy.audioNamePlaceholder} /></label>
          <div className="daxi-text-footer"><button type="button" onClick={() => setText(copy.example)}>{copy.exampleButton}</button><span>{text.length}/2000</span></div>
          <div className="daxi-settings">
            <label>{copy.speed} <strong>{speed.toFixed(1)}×</strong><input type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
            <label>{copy.volume} <strong>{Math.round(volume * 100)}%</strong><input type="range" min="0.2" max="1" step="0.1" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /></label>
            <label>{copy.pitch} <strong>{pitch > 0 ? `+${pitch}` : pitch}</strong><input type="range" min="-12" max="12" step="1" value={pitch} onChange={(e) => setPitch(Number(e.target.value))} /></label>
          </div>
        </section>

        <section className="daxi-card daxi-result-card">
          <div className="daxi-card-heading">
            <span className="daxi-step">03</span>
            <div><h2>{copy.resultTitle}</h2><p>{activeVoice ? copy.current + ' ' + activeVoice.name : copy.noVoice}</p></div>
          </div>
          {result ? (
            <div className="daxi-audio-result">
              <div className="daxi-result-icon">♫</div>
              <strong>{copy.done}</strong>
              <span>{copy.downloadHint}</span>
              <audio controls src={`${apiBase}/static/outputs/${result.output_filename}`} />
              <a className="daxi-download" href={`${apiBase}/static/outputs/${result.output_filename}`} download>{copy.download}</a>
              <Link className="daxi-download" to={`/digital-human?audio=${result.id}`}>用于数字人视频 →</Link>
            </div>
          ) : (
            <div className="daxi-result-empty"><span>⌁</span><strong>{copy.waiting}</strong><p>{copy.waitingHint}</p></div>
          )}
          <button className="daxi-generate" type="submit" disabled={generating || loadingVoices || creditCost === null}>
            {generating ? copy.generating : creditCost === null ? (rateError ? copy.rateFailed : copy.rateLoading) : `${copy.generate} · ${estimatedCreditCost} ${language === 'zh' ? '积分' : 'credits'}`} <span>→</span>
          </button>
          <p className="daxi-cost-note">
            {rateError ? copy.rateFailed : creditCost === null ? copy.rateLoading : <>
              {copy.billableChars} {billableCharacters} × {creditCost} / 10,000 = {rawCreditCost} {copy.rawCredits} → {copy.chargedCredits} {estimatedCreditCost} {language === 'zh' ? '积分' : 'credits'}<br />
              {copy.cost}
            </>}
          </p>
        </section>
      </form>
    </main>
  );
}
