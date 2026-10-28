import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './Credits.css';
import './CreditsRefinements.css';

const copy = {
  zh: {
    title: '积分中心', subtitle: '购买积分后可用于声音克隆、语音合成和数字人生成。', balance: '可用积分', expiresSoon: '30天内到期', packs: '选择积分包', buy: '购买积分', buying: '正在创建订单…', methods: '支付方式', currency: '结算币种', history: '积分明细', orders: '支付订单', noTransactions: '暂无积分记录', noOrders: '暂无支付订单', submit: '前往 Stripe 收银台', close: '取消', confirm: '银行卡等付款信息仅在 Stripe 安全收银台填写；确认付款后积分才会到账。', checkoutReturned: '已返回积分中心，请查看下方订单状态；确认支付成功后积分才会到账。', checkoutCancelled: '已取消付款，积分未到账。', checkoutUnverified: '旧收银台未能确认付款，请查看订单状态。', checkoutUnknown: '支付平台返回的订单未找到，请联系管理员核对。', expires: '购买积分有效期365天', noPackages: '当前币种暂无可购买的积分包', setup: '支付配置尚未完成，请联系管理员。', points: '积分', date: '时间', stateLabel: '状态', amount: '金额', refresh: '查询支付状态', purchase: '购买', use: '生成扣分', refund: '失败退回', adminCredit: '管理员增加', adminDebit: '管理员扣除', expiration: '积分过期', pending: '处理中', paid: '已支付', failed: '失败', closed: '已取消', checkoutError: '创建支付订单失败', clearUnpaid: '清理未付款记录', clearConfirm: '只清理当前账号未付款的订单；旧平台未确认订单会从列表归档，已付款订单和积分记录保留。确定继续？', clearDone: '未付款记录已清理', allCurrencies: '请选择币种', empty: '—',
  },
  en: {
    title: 'Credits', subtitle: 'Use credits for voice cloning, speech synthesis, and digital-human generation.', balance: 'Available credits', expiresSoon: 'Expiring within 30 days', packs: 'Choose a credit pack', buy: 'Buy credits', buying: 'Creating order…', methods: 'Payment method', currency: 'Settlement currency', history: 'Credit history', orders: 'Payment orders', noTransactions: 'No credit activity yet', noOrders: 'No payment orders yet', submit: 'Continue to Stripe', close: 'Cancel', confirm: 'Enter card or other payment details on the secure Stripe checkout. Credits are added only after confirmed payment.', checkoutReturned: 'Back in Credits. Check the order status below; credits are added only after payment is confirmed.', checkoutCancelled: 'Payment cancelled. No credits were added.', checkoutUnverified: 'The old checkout could not confirm payment. Check the order status.', checkoutUnknown: 'The returned payment order could not be found. Please contact the administrator.', expires: 'Purchased credits expire after 365 days', noPackages: 'No credit packs are configured for this currency', setup: 'Payment is not configured yet. Please contact the administrator.', points: 'credits', date: 'Date', stateLabel: 'Status', amount: 'Amount', refresh: 'Check payment status', purchase: 'Purchase', use: 'Generation charge', refund: 'Failed-task refund', adminCredit: 'Admin grant', adminDebit: 'Admin deduction', expiration: 'Expired', pending: 'Pending', paid: 'Paid', failed: 'Failed', closed: 'Cancelled', checkoutError: 'Could not create the payment order', clearUnpaid: 'Clear unpaid orders', clearConfirm: 'Only unpaid orders for this account will be cleared. Unconfirmed legacy orders will be archived; paid orders and credit history remain. Continue?', clearDone: 'Unpaid orders cleared', allCurrencies: 'Select a currency', empty: '—',
  },
};

const statusLabel = (status, text) => text[status] || status;
const kindLabel = (kind, text) => ({ purchase: text.purchase, usage: text.use, refund: text.refund, admin_credit: text.adminCredit, admin_debit: text.adminDebit, expiration: text.expiration })[kind] || kind;
const packageNames = {
  starter: { zh: '体验积分包', en: 'Starter pack' },
  useful: { zh: '实用积分包', en: 'Standard pack' },
  large: { zh: '大容量积分包', en: 'Large pack' },
};
const packageName = (item, language) => packageNames[item.code]?.[language] || item.name;
const activeCheckoutKey = 'daxi-active-stripe-checkout-order';

export default function Credits() {
  const { language } = useLanguage();
  const text = copy[language];
  const [searchParams] = useSearchParams();
  const [catalog, setCatalog] = useState({ packages: [], currencies: [], payment_methods: [], operation_costs: {} });
  const [account, setAccount] = useState({ balance: 0, expires_soon: 0, transactions: [] });
  const [orders, setOrders] = useState([]);
  const [currency, setCurrency] = useState('');
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingOrder, setRefreshingOrder] = useState(null);
  const [clearingOrders, setClearingOrders] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalogRes, accountRes, ordersRes] = await Promise.all([
        apiClient.get('/billing/catalog'), apiClient.get('/billing/me'), apiClient.get('/billing/orders'),
      ]);
      const nextCatalog = catalogRes.data;
      setCatalog(nextCatalog);
      setAccount(accountRes.data);
      setOrders(ordersRes.data || []);
      setCurrency((current) => current || nextCatalog.currencies?.[0] || '');
    } catch (err) {
      setError(err.response?.data?.detail || text.setup);
    } finally { setLoading(false); }
  }, [text.setup]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const handleCheckoutReturn = async () => {
      // Browser Back can restore this page from bfcache with the old modal still open.
      setSubmitting(false);
      setSelectedPackage(null);
      const orderId = window.sessionStorage.getItem(activeCheckoutKey);
      if (!orderId) return;
      window.sessionStorage.removeItem(activeCheckoutKey);
      try {
        const { data } = await apiClient.post(`/billing/orders/${orderId}/abandon`);
        const [accountRes, ordersRes] = await Promise.all([apiClient.get('/billing/me'), apiClient.get('/billing/orders')]);
        setAccount(accountRes.data);
        setOrders(ordersRes.data || []);
        setCheckoutNotice(data.status === 'closed' ? text.checkoutCancelled : text.checkoutReturned);
      } catch (err) {
        setError(err.response?.data?.detail || err.message || text.checkoutError);
      }
    };
    handleCheckoutReturn();
    window.addEventListener('pageshow', handleCheckoutReturn);
    return () => window.removeEventListener('pageshow', handleCheckoutReturn);
  }, [text]);
  useEffect(() => {
    if (!orders.some((order) => order.status === 'pending')) return undefined;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await Promise.allSettled(orders.filter((order) => order.status === 'pending').map((order) => apiClient.post(`/billing/orders/${order.id}/refresh`)));
        const [accountRes, ordersRes] = await Promise.all([apiClient.get('/billing/me'), apiClient.get('/billing/orders')]);
        setAccount(accountRes.data); setOrders(ordersRes.data || []);
      } catch { /* keep the current order state; manual refresh remains available */ }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [orders]);

  const packages = useMemo(() => catalog.packages.filter((item) => item.currency === currency), [catalog.packages, currency]);

  const beginPurchase = (item) => {
    setSelectedPackage(item);
    setError('');
  };

  const submitPurchase = async (event) => {
    event.preventDefault();
    if (!selectedPackage) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await apiClient.post('/billing/orders', {
        package_code: selectedPackage.code,
        currency,
        pay_no: 'stripe',
      });
      if (!data.checkout_url?.startsWith('https://checkout.stripe.com/')) throw new Error(text.checkoutError);
      window.sessionStorage.setItem(activeCheckoutKey, String(data.order.id));
      window.location.assign(data.checkout_url);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || text.checkoutError);
      setSubmitting(false);
    }
  };

  const refreshOrder = async (order) => {
    setRefreshingOrder(order.id);
    setError('');
    try {
      await apiClient.post(`/billing/orders/${order.id}/refresh`);
      const [accountRes, ordersRes] = await Promise.all([apiClient.get('/billing/me'), apiClient.get('/billing/orders')]);
      setAccount(accountRes.data); setOrders(ordersRes.data || []);
    } catch (err) { setError(err.response?.data?.detail || text.checkoutError); }
    finally { setRefreshingOrder(null); }
  };

  const clearUnpaidOrders = async () => {
    if (!window.confirm(text.clearConfirm)) return;
    setClearingOrders(true);
    setError('');
    try {
      const { data } = await apiClient.delete('/billing/orders/unpaid');
      const [accountRes, ordersRes] = await Promise.all([apiClient.get('/billing/me'), apiClient.get('/billing/orders')]);
      setAccount(accountRes.data);
      setOrders(ordersRes.data || []);
      setCheckoutNotice(`${text.clearDone}：${data.deleted + data.archived}`);
    } catch (err) { setError(err.response?.data?.detail || err.message || text.checkoutError); }
    finally { setClearingOrders(false); }
  };

  const shownOrder = searchParams.get('order');
  const checkoutResult = searchParams.get('checkout');
  const orderStatusText = (status) => statusLabel(status, text);

  return <main className="credits-page">
    <section className="credits-hero"><div><span>DAXI CREDITS</span><h1>{text.title}</h1><p>{text.subtitle}</p></div><div className="credits-balance"><small>{text.balance}</small><strong>{account.balance.toLocaleString()}</strong><span>{text.expiresSoon}: {account.expires_soon.toLocaleString()}</span></div></section>
    {error && <div className="credits-alert">{error}</div>}
    {checkoutNotice ? <div className="credits-info">{checkoutNotice}</div>
      : checkoutResult === 'cancelled' ? <div className="credits-info">{text.checkoutCancelled}</div>
      : checkoutResult === 'unverified' ? <div className="credits-alert">{text.checkoutUnverified}</div>
      : checkoutResult === 'unknown' ? <div className="credits-alert">{text.checkoutUnknown}</div>
        : shownOrder && <div className="credits-info">{text.checkoutReturned}</div>}
    <section className="credits-section">
      <div className="credits-section-head"><div><h2>{text.packs}</h2><p>{text.expires}</p></div><label>{text.currency}<select value={currency} onChange={(event) => setCurrency(event.target.value)}>{catalog.currencies.map((code) => <option key={code} value={code}>{code}</option>)}</select></label></div>
      {loading ? <p>{language === 'zh' ? '加载中…' : 'Loading…'}</p> : packages.length === 0 ? <div className="credits-empty">{text.noPackages}</div> : <><div className="credits-pack-grid">{packages.map((item) => <article className="credits-pack" key={`${item.code}-${item.currency}`}><span>{packageName(item, language)}</span><strong>{item.currency} {Number(item.price).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</strong><p>{item.points.toLocaleString()} {text.points}</p><button type="button" onClick={() => beginPurchase(item)} disabled={!catalog.payment_methods.length}>{text.buy}</button></article>)}</div>{!catalog.payment_methods.length && <p className="credits-modal-hint">{text.setup}</p>}</>}
    </section>
    <section className="credits-section"><div className="credits-section-head"><div><h2>{text.history}</h2></div></div>{account.transactions.length === 0 ? <div className="credits-empty">{text.noTransactions}</div> : <div className="credits-ledger">{account.transactions.map((row) => <article key={row.id}><div><strong>{row.description || kindLabel(row.kind, text)}</strong><small>{kindLabel(row.kind, text)} · {new Date(row.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small></div><b className={row.delta >= 0 ? 'is-positive' : 'is-negative'}>{row.delta > 0 ? '+' : ''}{row.delta.toLocaleString()}</b></article>)}</div>}</section>
    <section className="credits-section"><div className="credits-section-head"><div><h2>{text.orders}</h2></div>{orders.some((order) => order.status !== 'paid') && <button className="credits-clear-button" type="button" onClick={clearUnpaidOrders} disabled={clearingOrders}>{clearingOrders ? '…' : text.clearUnpaid}</button>}</div>{orders.length === 0 ? <div className="credits-empty">{text.noOrders}</div> : <div className="credits-ledger">{orders.map((order) => <article key={order.id} className={shownOrder === order.merchant_order_id ? 'is-highlighted' : ''}><div><strong>{order.points.toLocaleString()} {text.points} · {order.currency} {order.amount}</strong><small>{order.merchant_order_id} · {new Date(order.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small></div><div className="credits-order-action"><span className={`credits-status is-${order.status}`}>{orderStatusText(order.status)}</span>{order.status === 'pending' && <button type="button" onClick={() => refreshOrder(order)} disabled={refreshingOrder === order.id}>{refreshingOrder === order.id ? '…' : text.refresh}</button>}</div></article>)}</div>}</section>

    {selectedPackage && <div className="credits-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setSelectedPackage(null); }}><form className="credits-modal" onSubmit={submitPurchase}><button className="credits-modal-close" type="button" onClick={() => setSelectedPackage(null)} disabled={submitting}>×</button><h2>{packageName(selectedPackage, language)}</h2><p>{selectedPackage.points.toLocaleString()} {text.points} · {currency} {selectedPackage.price}</p><p className="credits-modal-hint">{text.methods}: Stripe</p><p className="credits-modal-hint">{text.confirm}</p><div className="credits-modal-actions"><button type="button" className="credits-cancel" onClick={() => setSelectedPackage(null)} disabled={submitting}>{text.close}</button><button type="submit" disabled={submitting}>{submitting ? text.buying : text.submit}</button></div></form></div>}
  </main>;
}
