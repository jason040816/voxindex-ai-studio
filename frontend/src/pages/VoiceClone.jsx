import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './VoiceClone.css';

const statusLabel = {
  zh: { ready: '可使用', disabled: '已停用', archived: '已删除', reference: '样本音频' },
  en: { ready: 'Ready', disabled: 'Disabled', archived: 'Deleted', reference: 'Audio sample' },
};
const pageText = {
  zh: { load: '加载音色列表失败', under15: '音频至少需要 15 秒，当前约 ', selected: '已选择音频', recheck: '提交时会再次检查时长。', unsupported: '当前浏览器不支持录音，请改用 Chrome 或 Edge，或直接上传音频文件。', permission: '正在请求麦克风权限…', tooShort: '录音至少需要 15 秒，请重新录制。', saved: '录音已保存', savedHint: '可以填写样本文字并创建音色。', emptyRecording: '没有录到声音，请检查麦克风后重试。', recording: '录音中，请至少朗读 15 秒，完成后点击“结束录音”。', micError: '无法使用麦克风。请在浏览器地址栏允许麦克风权限后重试。', choose: '请选择一段授权音频', consent: '请先确认你拥有这段声音的授权', created: '已创建，可以到语音合成中直接选择。', createFailed: '创建音色失败', deleteConfirm: '确定删除', deleteHint: '吗？已有生成记录不会受影响。', deleteFailed: '删除音色失败', title: '声音克隆', subtitle: '上传一段已获得授权的清晰人声，建立专属音色，并在语音合成中使用。', synth: '去语音合成', createTitle: '创建新音色', createHint: '建议上传至少 15 秒、无背景音乐的单人语音；系统会自动转成所需格式。', name: '音色名称', namePlaceholder: '例如：品牌客服女声', sample: '样本文字', optional: '可选', samplePlaceholder: '填写这段音频里说的内容，可提高音色创建成功率。', audio: '授权音频', rule: '录音要求：', ruleText: '音频时长至少 15 秒，少于 15 秒无法创建声音克隆。', upload: '选择音频文件（WAV、MP3、M4A 等）', record: '现场录音', stop: '结束录音', authorization: '我确认已取得声音本人授权，并同意将该样本用于生成音色。', creating: '正在创建音色…', create: '创建声音克隆', billingNote: '声音克隆按每个音色收费一次；使用音色进行语音合成时，按输入文字的计费字符数另行扣分。', library: '我的音色库', libraryHint: '管理已创建的声音克隆。', loading: '正在加载音色库…', noClones: '还没有声音克隆', noClonesHint: '创建后会出现在这里，并可直接用于语音合成。', deleting: '处理中…', delete: '删除', note: '创建成功后，系统会安全保存音色编号并用于语音合成。客户只使用大汐页面，无需跳转或登录上游平台。' },
  en: { load: 'Could not load the voice library.', under15: 'Audio must be at least 15 seconds. Current length: ', selected: 'Audio selected', recheck: 'The duration will be checked again when you submit.', unsupported: 'Recording is not supported in this browser. Please use Chrome or Edge, or upload an audio file.', permission: 'Requesting microphone permission…', tooShort: 'The recording must be at least 15 seconds. Please record again.', saved: 'Recording saved', savedHint: 'You can now enter the sample text and create the voice.', emptyRecording: 'No audio was recorded. Please check your microphone and try again.', recording: 'Recording now. Speak for at least 15 seconds, then click Stop recording.', micError: 'Microphone access failed. Allow microphone permission in your browser and try again.', choose: 'Please select an authorized audio sample.', consent: 'Please confirm that you are authorized to use this voice sample.', created: 'has been created and can now be selected in Voice Synthesis.', createFailed: 'Could not create the voice.', deleteConfirm: 'Delete “', deleteHint: '”? Existing generated audio will not be affected.', title: 'Voice Clone', subtitle: 'Upload an authorized, clear voice sample to create a custom voice for synthesis.', synth: 'Go to Voice Synthesis', createTitle: 'Create a new voice', createHint: 'Use a single-speaker recording of at least 15 seconds, without background music. The system converts it automatically.', name: 'Voice name', namePlaceholder: 'For example: Brand support voice', sample: 'Sample text', optional: 'Optional', samplePlaceholder: 'Enter the words spoken in the audio to improve the chance of success.', audio: 'Authorized audio', rule: 'Recording requirement:', ruleText: 'The audio must be at least 15 seconds. Shorter samples cannot create a cloned voice.', upload: 'Choose an audio file (WAV, MP3, M4A, etc.)', record: 'Record now', stop: 'Stop recording', authorization: 'I confirm that I have permission from the speaker and agree to use this sample to create a voice.', creating: 'Creating voice…', create: 'Create voice clone', billingNote: 'Voice cloning is charged once per voice. Later speech synthesis is charged separately by billable text characters.', library: 'My voice library', libraryHint: 'Manage your cloned voices.', loading: 'Loading voice library…', noClones: 'No cloned voices yet', noClonesHint: 'New cloned voices will appear here and can be used in Voice Synthesis.', deleting: 'Working…', delete: 'Delete', note: 'After a voice is created, its identifier is securely stored for synthesis. Customers only use the DAXI page and never need to visit the upstream platform.' },
};

export default function VoiceClone() {
  const { language } = useLanguage();
  const copy = pageText[language];
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const recorderStreamRef = useRef(null);
  const recordingSecondsRef = useRef(0);
  const [name, setName] = useState('');
  const [sampleText, setSampleText] = useState('');
  const [file, setFile] = useState(null);
  const [consent, setConsent] = useState(false);
  const [clones, setClones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingMessage, setRecordingMessage] = useState('');
  const [creditCost, setCreditCost] = useState(0);

  useEffect(() => { apiClient.get('/billing/catalog').then(({ data }) => setCreditCost(data.operation_costs?.voice_clone || 0)).catch(() => {}); }, []);

  const loadClones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/voice-clones/');
      setClones(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || copy.load);
    } finally {
      setLoading(false);
    }
  }, [copy.load]);

  useEffect(() => { loadClones(); }, [loadClones]);

  useEffect(() => {
    if (!isRecording) return undefined;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => {
      const next = seconds + 1;
      recordingSecondsRef.current = next;
      return next;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => () => {
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const formatSeconds = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const checkFileDuration = (selectedFile) => new Promise((resolve) => {
    const preview = document.createElement('audio');
    const objectUrl = URL.createObjectURL(selectedFile);
    preview.preload = 'metadata';
    preview.onloadedmetadata = () => {
      const duration = preview.duration;
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(duration) ? duration : null);
    };
    preview.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    preview.src = objectUrl;
  });

  const selectUploadFile = async (selectedFile) => {
    if (!selectedFile) return;
    setError('');
    const duration = await checkFileDuration(selectedFile);
    if (duration && duration < 15) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError(copy.under15 + duration.toFixed(1) + 's.');
      return;
    }
    setFile(selectedFile);
    setRecordingMessage(duration ? copy.selected + ' (' + duration.toFixed(1) + 's).' : copy.selected + '. ' + copy.recheck);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(copy.unsupported);
      return;
    }
    setError('');
    setRecordingMessage(copy.permission);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          if (recordingSecondsRef.current < 6) {
            setFile(null);
            setError(copy.tooShort);
            setRecordingMessage('');
          } else {
            const recording = new File([blob], 'voice-recording-' + Date.now() + '.webm', { type: blob.type });
            setFile(recording);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setRecordingMessage(copy.saved + ' (' + formatSeconds(recordingSecondsRef.current) + '). ' + copy.savedHint);
          }
        } else {
          setError(copy.emptyRecording);
          setRecordingMessage('');
        }
        stream.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        recorderRef.current = null;
        recorderChunksRef.current = [];
        setIsRecording(false);
      };
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;
      setIsRecording(true);
      setRecordingMessage(copy.recording);
      recorder.start();
    } catch {
      setRecordingMessage('');
      setError(copy.micError);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!file) { setError(copy.choose); return; }
    if (!consent) { setError(copy.consent); return; }

    const form = new FormData();
    form.append('name', name);
    form.append('sample_text', sampleText);
    form.append('consent', consent);
    form.append('file', file);
    setSubmitting(true);
    try {
      const res = await apiClient.post('/voice-clones/', form);
      setClones((current) => [res.data, ...current]);
      setSuccess('“' + res.data.name + '” ' + copy.created);
      setName('');
      setSampleText('');
      setFile(null);
      setConsent(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err.response?.data?.detail || copy.createFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const archiveClone = async (clone) => {
    if (!window.confirm(copy.deleteConfirm + clone.name + copy.deleteHint)) return;
    setRemovingId(clone.id);
    setError('');
    try {
      await apiClient.delete(`/voice-clones/${clone.id}`);
      setClones((current) => current.filter((item) => item.id !== clone.id));
    } catch (err) {
      setError(err.response?.data?.detail || copy.deleteFailed || 'Could not delete the voice.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <main className="page-container clone-page">
      <section className="clone-hero">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <Link className="clone-hero-link" to="/synthesis">{copy.synth} →</Link>
      </section>

      <div className="clone-grid">
        <section className="clone-card">
          <div className="clone-card-heading">
            <span>01</span>
            <div><h2>{copy.createTitle}</h2><p>{copy.createHint}</p></div>
          </div>
          {error && <div className="error-msg">{error}</div>}
          {success && <div className="success-msg">{success}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{copy.name}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePlaceholder} maxLength="80" required />
            </div>
            <div className="form-group">
              <label>{copy.sample} <span className="clone-optional">{copy.optional}</span></label>
              <textarea value={sampleText} onChange={(e) => setSampleText(e.target.value)} placeholder={copy.samplePlaceholder} />
            </div>
            <div className="form-group">
              <label>{copy.audio}</label>
              <p className="clone-duration-rule"><strong>{copy.rule}</strong> {copy.ruleText}</p>
              <div className="clone-audio-actions">
                <button type="button" className="clone-upload" onClick={() => fileInputRef.current?.click()} disabled={isRecording}>
                  <span className="clone-upload-icon">↑</span>
                  <span>{file ? file.name : copy.upload}</span>
                </button>
                <button type="button" className={`clone-record ${isRecording ? 'is-recording' : ''}`} onClick={toggleRecording}>
                  <span>{isRecording ? '■' : '●'}</span>{isRecording ? copy.stop + ' ' + formatSeconds(recordingSeconds) : copy.record}
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="audio/*" onChange={(e) => selectUploadFile(e.target.files?.[0])} hidden />
              {recordingMessage && <p className={`clone-recording-message ${isRecording ? 'is-recording' : ''}`}>{recordingMessage}</p>}
            </div>
            <label className="clone-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{copy.authorization}</span>
            </label>
            <button className="btn-primary clone-submit" type="submit" disabled={submitting}>
              {submitting ? copy.creating : `${copy.create} · ${creditCost} ${language === 'zh' ? '积分' : 'credits'}`}
            </button>
            <p className="clone-duration-rule">{copy.billingNote}</p>
          </form>
        </section>

        <section className="clone-card clone-list-card">
          <div className="clone-card-heading">
            <span>02</span>
            <div><h2>{copy.library}</h2><p>{copy.libraryHint}</p></div>
          </div>
          {loading ? <p className="empty-msg">{copy.loading}</p> : clones.length === 0 ? (
            <div className="clone-empty"><span>◌</span><strong>{copy.noClones}</strong><p>{copy.noClonesHint}</p></div>
          ) : (
            <div className="clone-list">
              {clones.map((clone) => (
                <article className={`clone-item ${clone.is_enabled ? '' : 'is-disabled'}`} key={clone.id}>
                  <div className="clone-avatar">{clone.name.slice(0, 1)}</div>
                  <div className="clone-info"><strong>{clone.name}</strong><span>{clone.voice_id}</span></div>
                  <span className={`clone-status is-${clone.status}`}>{statusLabel[language][clone.status] || clone.status}</span>
                  {clone.is_enabled && <button type="button" className="clone-delete" disabled={removingId === clone.id} onClick={() => archiveClone(clone)}>{removingId === clone.id ? copy.deleting : copy.delete}</button>}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="clone-note">{copy.note}</p>
    </main>
  );
}
