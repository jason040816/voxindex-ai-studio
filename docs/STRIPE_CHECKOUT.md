# Stripe 收银台接入与上线

积分购买已改为 Stripe 托管 Checkout。网站只创建订单并跳转到 Stripe；银行卡等付款资料不经过本站。网页回跳不视为付款成功，只有经 Stripe 签名验证的 Webhook 或服务端向 Stripe 查询到 `payment_status=paid`，且订单号、Session ID、币种、金额一致，才发放积分。重复通知不会重复发分。

## 上线前准备

1. 在 Stripe Dashboard 获取本账号的 `sk_test_...`（先测试）或 `sk_live_...` 私钥。不要使用 Publishable Key，也不要将密钥发到聊天或提交到 Git。
2. 在 Stripe Dashboard 创建 Webhook 端点：`https://voice.daxiaimarket.com/api/billing/stripe/webhook`。订阅 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`。复制该端点对应的 `whsec_...` 签名密钥。测试与正式模式的密钥、Webhook 端点分别配置。
3. 在服务器 `/opt/daxi/VoxIndex-main/.env.prod` 配置：

   ```dotenv
   FRONTEND_APP_URL=https://voice.daxiaimarket.com
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

4. 上传本次后端、前端代码及 `backend/requirements.txt`，然后在服务器执行：

   ```bash
   cd /opt/daxi/VoxIndex-main
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backend frontend
   docker compose -f docker-compose.prod.yml --env-file .env.prod ps backend frontend
   ```

5. 在管理后台“积分中心”设置各币种积分包价格。当前服务端仅接受 CNY、SGD、USD 且价格最多两位小数；币种及可用支付方式还受 Stripe 商户注册国家/地区和账号能力限制。Stripe 自动显示该账号对买家、币种可用的付款方式，并非代码里强制开启支付宝。

## 验证流程

使用测试密钥，在积分中心点击“购买积分”应打开 `https://checkout.stripe.com/...`。用 Stripe 官方测试付款方式完成测试，并在 Stripe Dashboard 的 Webhook 日志确认投递成功；回到积分中心，订单显示已支付，积分只增加一次。测试取消、支付失败、重复 Webhook、错误签名；未付款时不得入账。

确认测试通过后，切换成正式 `sk_live_...` 及正式 Webhook 对应的 `whsec_...`，重建后端并重新测试。不要混用测试与正式密钥。

## 返回收银台与清理未付款订单

用户从 Stripe 收银台直接按浏览器返回或点击取消时，积分中心会恢复可操作状态，并请后端核对该 Checkout Session。若仍是未付款且 `open`，后端将其过期并把订单标为“已取消”；若 Stripe 已确认付款，仍会正常入账。对异步付款但尚未有最终结果的订单，不会误标为失败。

积分中心的“清理未付款记录”只作用于当前登录账号：已确认未付款的订单删除；旧平台或异步付款状态未能最终确认的订单从列表归档，后台保留以接收迟到的付款通知。已付款订单和积分明细不会清理。这个动作由用户在页面上确认后执行，不会在部署时自动批量删除生产数据。

若点击购买提示未配置，检查容器里的 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`FRONTEND_APP_URL` 是否生效，不要将密钥原文输出到日志或聊天。旧 UPG 配置只用于旧订单查询/回调，新订单不再走旧收银台。使用当前 Docker Compose 的 SQLite 数据库时，订单 Session ID 字段长度调整无需单独迁移；若自行改用 PostgreSQL，需先将 `payment_orders.platform_order_id` 扩容为 `VARCHAR(255)`。

目前退款后积分回收未自动处理，发生退款需由管理员核对后手动调整。启用正式付款前须确定此运营流程。

## 参考文档

- [Stripe Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe Webhook 签名验证](https://docs.stripe.com/webhooks/signature)
- [Stripe 支持的币种](https://docs.stripe.com/currencies)
