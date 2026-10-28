import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import './BillingAdmin.css';

const opNames = {
  voice_clone: ['声音克隆（每个音色）', 'Voice cloning (per voice)'], audio_generation: ['语音合成（每万计费字符）', 'Speech synthesis (per 10,000 characters)'],
  digital_human_model: ['数字人模型训练（每个，含30分钟视频）', 'Avatar model (each, includes 30 min video)'], digital_human_video: ['超出赠送时长的视频（每秒）', 'Video beyond included time (per second)'],
};
const packNames = { starter: ['体验积分包', 'Starter'], useful: ['实用积分包', 'Practical'], large: ['大容量积分包', 'Large'] };

export default function BillingAdmin({ language = 'zh', onNotice }) {
  const en = language === 'en';
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newCurrency, setNewCurrency] = useState('');
  const [error, setError] = useState('');
  const t = (zh, english) => en ? english : zh;
  useEffect(() => {
    apiClient.get('/billing/admin/settings')
      .then((response) => setData(response.data))
      .catch((err) => setError(err.response?.data?.detail || (en ? 'Could not load credit settings' : '加载积分设置失败')));
  }, [en]);
  const updateRate = (key, value) => setData(current => ({ ...current, rates: { ...current.rates, [key]: Math.max(0, Number(value) || 0) } }));
  const updatePackage = (index, field, value) => setData(current => ({ ...current, packages: current.packages.map((item, i) => i === index ? { ...item, [field]: field === 'enabled' ? value : field === 'points' ? Math.max(1, Number(value) || 1) : value } : item) }));
  const addCurrency = () => {
    const currency = newCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) { setError(t('请输入3位币种代码，例如 MYR、SGD', 'Enter a 3-letter currency code, e.g. MYR or SGD')); return; }
    if (data.packages.some(item => item.currency === currency)) { setError(t('该币种已存在', 'That currency already exists')); return; }
    setData(current => ({ ...current, packages: [...current.packages, ...['starter', 'useful', 'large'].map(code => {
      const base = current.packages.find(item => item.code === code && item.currency === 'CNY');
      return { ...base, currency, price: '0', enabled: false };
    })] }));
    setNewCurrency(''); setError('');
  };
  const save = async () => {
    setSaving(true); setError('');
    try { await apiClient.put('/billing/admin/settings', { rates: data.rates, packages: data.packages }); onNotice?.(t('积分和价格设置已保存', 'Credit settings saved')); }
    catch (err) { setError(err.response?.data?.detail || t('保存失败', 'Save failed')); }
    finally { setSaving(false); }
  };
  if (!data) return <section className="admin-panel"><p>{error || t('加载中…', 'Loading…')}</p></section>;
  const currencies = [...new Set(data.packages.map(item => item.currency))].sort();
  return <section className="admin-section">
    <section className="admin-panel admin-table-card">
      <div className="admin-panel-header"><div><h2>{t('生成扣分', 'Generation costs')}</h2><span>{t('模型训练价格含30分钟视频；超出部分按秒计费。比如剩余1分钟、生成5分钟，只对超出的240秒扣分。改价只影响新任务。设置为0表示免费。', 'Model training includes 30 minutes of video. Extra time is billed per second. With 1 minute left, a 5-minute video bills 240 seconds. Rate changes apply to new jobs only; 0 means free.')}</span></div></div>
      <div className="billing-admin-rates">{Object.entries(opNames).map(([key, names]) => <label key={key}>{names[en ? 1 : 0]}<input type="number" min="0" value={data.rates?.[key] ?? 0} onChange={event => updateRate(key, event.target.value)} /></label>)}</div>
    </section>
    <section className="admin-panel admin-table-card">
      <div className="admin-panel-header admin-panel-header-spread"><div><h2>{t('积分包与币种价格', 'Credit packs and currency prices')}</h2><span>{t('每种货币分别设置三档价格、积分数和是否展示；未启用的套餐不会向用户显示。', 'Set price, credits, and visibility per currency; disabled packs are hidden from users.')}</span></div></div>
      <div className="billing-currency-add"><input aria-label="Currency" maxLength="3" placeholder={t('新币种代码，如 MYR', 'Currency code, e.g. MYR')} value={newCurrency} onChange={event => setNewCurrency(event.target.value)} /><button type="button" className="admin-action-primary" onClick={addCurrency}>{t('添加币种', 'Add currency')}</button></div>
      {currencies.map(currency => <div className="billing-currency-block" key={currency}><h3>{currency}</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t('套餐', 'Pack')}</th><th>{t('积分', 'Credits')}</th><th>{t('价格', 'Price')}</th><th>{t('向用户开放', 'Available')}</th></tr></thead><tbody>{['starter', 'useful', 'large'].map(code => { const index = data.packages.findIndex(item => item.code === code && item.currency === currency); const item = data.packages[index]; return item && <tr key={code}><td>{packNames[code][en ? 1 : 0]}</td><td><input type="number" min="1" value={item.points} onChange={event => updatePackage(index, 'points', event.target.value)} /></td><td><input type="number" min="0" step="0.01" value={item.price} onChange={event => updatePackage(index, 'price', event.target.value)} /></td><td><input type="checkbox" checked={item.enabled} onChange={event => updatePackage(index, 'enabled', event.target.checked)} /></td></tr>; })}</tbody></table></div></div>)}
      <p>{t('收银方式由商户已开通的方式决定。', 'Available payment methods depend on merchant configuration.')}</p>
      {error && <p className="error-msg">{error}</p>}
      <button type="button" className="admin-action-primary" onClick={save} disabled={saving}>{saving ? t('保存中…', 'Saving…') : t('保存积分设置', 'Save credit settings')}</button>
    </section>
  </section>;
}
