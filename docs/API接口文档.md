# DAXI 声音克隆与语音合成 API

本文面向使用 DAXI API Key 的客户，说明认证、声音克隆、音色查询、语音合成、记录查询和音频下载。示例使用 `curl`，将 `https://你的域名` 替换为实际 API 域名。

## 1. 接入信息

- API 根地址：`https://你的域名/api`
- 数据格式：请求和普通响应使用 UTF-8 JSON；声音文件上传使用 `multipart/form-data`；音频下载返回 WAV 二进制。
- API Key：由管理员在后台生成。Key 完整内容只在生成时显示一次，请客户安全保存。
- 客户账号：Key 绑定到后台选定的客户账号。同一账号下的 Key 共用该账号的音色、生成记录、积分和账号级限制；每个 Key 的请求数和 Key 用量统计单独记录。

除健康检查外，调用时都要带认证请求头：

```http
Authorization: Bearer YOUR_DAXI_API_KEY
```

不要把 API Key 放在 URL、网页前端代码、公开仓库或日志中。Key 丢失或泄露时，请管理员在后台停用并重新生成。

## 2. 健康检查

### `GET /api/health`

检查 API 服务是否可访问，不需要 API Key。

```bash
curl -sS "https://你的域名/api/health"
```

响应：

```json
{"status":"ok"}
```

## 3. 查询可用音色

### `GET /api/synthesis/voices`

返回系统预置音色及当前客户账号已创建的腾讯云克隆音色。预置音色中的 `reference_id` 可直接用于语音合成；克隆音色使用返回的 `id`。

```bash
curl -sS "https://你的域名/api/synthesis/voices" \
  -H "Authorization: Bearer YOUR_DAXI_API_KEY"
```

响应示例：

```json
{
  "presets": [
    {
      "id": "v-female-R2s4N9qJ",
      "name": "温柔姐姐",
      "description": "温暖、自然，适合品牌介绍",
      "gender": "女声",
      "reference_id": 21
    }
  ],
  "clones": [
    {"id": 35, "name": "品牌客服音色", "voice_id": "provider-voice-id"}
  ]
}
```

实际响应会包含当前可用的全部预置音色和克隆音色。预置音色 `reference_id` 由系统自动创建和维护，不要自行拼造。

## 4. 创建声音克隆

### `POST /api/voice-clones/`

以 `multipart/form-data` 上传音频。样本须为本人或已取得明确授权的声音，至少 15 秒，文件不超过 30 MB；支持 WAV、MP3、M4A 等可解码音频。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | 字符串 | 是 | 音色显示名称，最多 80 个字符 |
| `consent` | 布尔值 | 是 | 授权确认，传 `true` |
| `file` | 文件 | 是 | 音频样本 |
| `sample_text` | 字符串 | 否 | 音频中的参考文本，有助于克隆 |

```bash
curl -X POST "https://你的域名/api/voice-clones/" \
  -H "Authorization: Bearer YOUR_DAXI_API_KEY" \
  -F "name=品牌客服音色" \
  -F "consent=true" \
  -F "sample_text=大家好，欢迎使用我们的服务。" \
  -F "file=@voice-sample.wav"
```

成功时返回 HTTP `201`：

```json
{
  "id": 35,
  "name": "品牌客服音色",
  "filename": "12_example.wav",
  "original_name": "voice-sample.wav",
  "sample_text": "大家好，欢迎使用我们的服务。",
  "voice_id": "provider-voice-id",
  "provider": "tencent_flowtts",
  "status": "ready",
  "is_enabled": true,
  "created_at": "2026-10-13T08:00:00+00:00"
}
```

记录返回的 `id`。语音合成请求需要传 `voice_ref_id: 35`。

## 5. 查询克隆音色

### `GET /api/voice-clones/`

查询当前客户账号下可用的声音克隆。

```bash
curl -sS "https://你的域名/api/voice-clones/" \
  -H "Authorization: Bearer YOUR_DAXI_API_KEY"
```

响应为声音克隆对象数组，字段与“创建声音克隆”的响应相同。

## 6. 修改克隆音色名称

### `PATCH /api/voice-clones/{clone_id}`

以 `multipart/form-data` 提交新的 `name`。只能修改当前客户账号自己的克隆音色。

```bash
curl -X PATCH "https://你的域名/api/voice-clones/35" \
  -H "Authorization: Bearer YOUR_DAXI_API_KEY" \
  -F "name=新的客服音色名称"
```

成功时返回更新后的克隆音色对象。

## 7. 停用克隆音色

### `DELETE /api/voice-clones/{clone_id}`

归档并停用克隆音色。成功时返回 HTTP `204 No Content`，没有响应正文。停用后的音色不能继续用于合成。

```bash
curl -X DELETE "https://你的域名/api/voice-clones/35" \
  -H "Authorization: Bearer YOUR_DAXI_API_KEY"
```

## 8. 生成语音

### `POST /api/synthesis/`

请求和响应均使用 JSON。`voice_ref_id` 可使用音色查询接口中预置音色的 `reference_id`，或克隆音色的 `id`。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `voice_ref_id` | 整数 | 是 | — | 要使用的音色记录 ID |
| `text` | 字符串 | 是 | — | 待合成文本，最多 2000 个字符 |
| `audio_name` | 字符串 | 否 | 自动命名 | 生成记录名称，最多 120 个字符 |
| `speed` | 数字 | 否 | `1.0` | 语速，范围 `0.5`–`2.0` |
| `volume` | 数字 | 否 | `1.0` | 音量，大于 `0` 且不超过 `1.0` |
| `pitch` | 整数 | 否 | `0` | 音调，范围 `-12`–`12` |
| `emo_voice_ref_id` | 整数或 `null` | 否 | `null` | 情感参考音色记录 ID |
| `emo_vector` | 数组或 `null` | 否 | `null` | 情感向量；如使用，请传 8 个情感强度值 |
| `emo_alpha` | 数字 | 否 | `1.0` | 情感强度，建议 `0`–`1` |
| `use_emo_text` | 布尔值 | 否 | `false` | 是否启用情感描述文本 |
| `emo_text` | 字符串或 `null` | 否 | `null` | 情感描述 |
| `use_random` | 布尔值 | 否 | `false` | 是否启用随机化生成 |
| `max_text_tokens_per_segment` | 整数 | 否 | `160` | 每段文本 token 上限 |
| `interval_silence` | 整数 | 否 | `200` | 分段间隔静音时长（毫秒） |

最简示例：

```bash
curl -X POST "https://你的域名/api/synthesis/" \
  -H "Authorization: Bearer YOUR_DAXI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"voice_ref_id":21,"text":"你好，欢迎使用 DAXI。"}'
```

完整参数示例：

```json
{
  "voice_ref_id": 21,
  "text": "你好，欢迎使用 DAXI。",
  "audio_name": "欢迎语",
  "speed": 1.0,
  "volume": 1.0,
  "pitch": 0,
  "emo_voice_ref_id": null,
  "emo_vector": null,
  "emo_alpha": 1.0,
  "use_emo_text": false,
  "emo_text": null,
  "use_random": false,
  "max_text_tokens_per_segment": 160,
  "interval_silence": 200
}
```

接口返回 HTTP `201`。HTTP 成功只表示请求已被处理；请同时检查 JSON 中的 `status`。语音服务自身失败时，接口仍可能返回 `201`，此时 `status` 为 `failed`，并在 `error_message` 中提供错误说明。

```json
{
  "id": 82,
  "status": "completed",
  "output_filename": "12_example_output.wav",
  "audio_name": "欢迎语",
  "input_text": "你好，欢迎使用 DAXI。",
  "created_at": "2026-10-13T08:05:00+00:00",
  "error_message": null
}
```

成功后使用响应中的 `id` 下载音频。失败示例：

```json
{
  "id": 83,
  "status": "failed",
  "output_filename": "12_example_output.wav",
  "audio_name": "欢迎语",
  "input_text": "你好，欢迎使用 DAXI。",
  "created_at": "2026-10-13T08:06:00+00:00",
  "error_message": "语音服务暂时不可用"
}
```

## 9. 查询合成记录

### `GET /api/synthesis/`

返回当前客户账号的合成任务数组，包含 `id`、`status`、`output_filename`、`audio_name`、`input_text`、`voice_ref_id` 和 `created_at`。

```bash
curl -sS "https://你的域名/api/synthesis/" \
  -H "Authorization: Bearer YOUR_DAXI_API_KEY"
```

## 10. 下载生成音频

### `GET /api/synthesis/{job_id}/audio`

返回 `audio/wav` 音频文件。任务必须属于当前客户账号且状态为 `completed`。

```bash
curl -L "https://你的域名/api/synthesis/82/audio" \
  -H "Authorization: Bearer YOUR_DAXI_API_KEY" \
  --output result.wav
```

## 11. 删除合成记录

### `DELETE /api/synthesis/{job_id}`

删除当前客户账号的一条合成记录及对应的本地输出文件。成功时返回 HTTP `204 No Content`。

```bash
curl -X DELETE "https://你的域名/api/synthesis/82" \
  -H "Authorization: Bearer YOUR_DAXI_API_KEY"
```

## 12. 错误响应

常见错误使用 JSON 返回，格式如下：

```json
{"detail":"错误说明"}
```

| HTTP 状态码 | 含义 |
| --- | --- |
| `400` | 请求无法处理，例如音频格式无效或音色已停用 |
| `401` | API Key 缺失、无效或已停用 |
| `402` | 客户账号积分不足 |
| `403` | Key 不允许访问该接口、账号被停用或账号级用量达到上限 |
| `404` | 音色、合成任务或音频不存在，或不属于当前客户账号 |
| `413` | 上传音频超过 30 MB |
| `422` | 参数校验失败，例如音频短于 15 秒、文本为空或超长 |
| `429` | API Key 已达到管理员设置的调用次数上限 |
| `502` | 上游声音克隆服务调用失败 |

## 13. Key 计数、积分和用量

- 每次通过认证且未超过 Key 上限的 API 请求，Key 请求计数增加 1 次；克隆列表、音色列表、记录查询、下载等请求也会计数。
- 超过调用上限的请求会返回 `429`，不增加已用请求次数，但会记录为一次被拦截的调用事件。
- API Key 使用绑定客户账号的声音克隆/合成额度和积分。后台“最近调用”使用北京时间展示。
- 后台用量明细按 API Key 单独记录请求时间、接口、HTTP 状态、克隆/合成结果、提交的合成字符数及本次实际扣除积分。失败并退回的合成不会记入实际积分消耗。
- 详细事件从启用本版统计后开始记录。此前只有 Key 总请求次数和最近使用时间，无法从旧数据准确还原每个历史请求的接口、字符数或积分归属。

## 14. 管理员接口：签发与查看 Key 用量

以下接口只供网站管理员后台使用，不能使用客户 API Key 调用，也不要把管理员登录凭据交给客户。管理员先通过网站正常登录取得 JWT，再以 `Authorization: Bearer 管理员JWT` 调用。

| 方法与路径 | 用途 | 请求要点 |
| --- | --- | --- |
| `GET /api/admin/api-keys` | 列出所有客户 Key | 可选查询参数 `user_id`；仅返回 Key 前缀，不返回完整 Key |
| `POST /api/admin/api-keys` | 签发 Key | JSON：`user_id`（必填）、`name`（必填）、`max_requests`（选填，0 为不限） |
| `PATCH /api/admin/api-keys/{api_key_id}` | 修改调用上限 | JSON：`{"max_requests":1000}`；不能修改已停用 Key |
| `GET /api/admin/api-keys/{api_key_id}/usage` | 查看该 Key 的汇总和逐次请求 | 查询参数 `page`（默认 1）、`limit`（默认 100，最多 200） |
| `DELETE /api/admin/api-keys/{api_key_id}` | 停用 Key | 停用后无法恢复，应重新签发 |

签发示例：

```bash
curl -X POST "https://你的域名/api/admin/api-keys" \
  -H "Authorization: Bearer 管理员JWT" \
  -H "Content-Type: application/json" \
  -d '{"user_id":12,"name":"客户生产接入","max_requests":1000}'
```

响应为 HTTP `201`，其中 `api_key` 是完整密钥，仅在这次响应出现。后台之后只保存不可逆摘要。`user_id` 必须是已有的非管理员客户账号；管理员后台的客户账号选择框保持必填。

查询用量示例：

```bash
curl -sS "https://你的域名/api/admin/api-keys/7/usage?page=1&limit=100" \
  -H "Authorization: Bearer 管理员JWT"
```

响应结构：

```json
{
  "summary": {
    "id": 7,
    "username": "customer",
    "email": "customer@example.com",
    "name": "客户生产接入",
    "prefix": "dx_live_example",
    "request_count": 62,
    "max_requests": 1000,
    "is_active": true,
    "is_exhausted": false,
    "voice_clone_count": 0,
    "synthesis_count": 1,
    "synthesis_success_count": 1,
    "synthesis_failed_count": 0,
    "synthesized_characters": 85,
    "points_used": 7,
    "created_at": "2026-10-13T06:45:08+00:00",
    "last_used_at": "2026-10-13T07:11:54+00:00",
    "revoked_at": null
  },
  "request_events_total": 1,
  "page": 1,
  "limit": 100,
  "pages": 1,
  "request_events": [
    {
      "id": 42,
      "method": "POST",
      "path": "/api/synthesis/",
      "operation": "synthesis",
      "status_code": 201,
      "outcome": "completed",
      "characters": 85,
      "credits_used": 7,
      "created_at": "2026-10-13T07:11:54+00:00"
    }
  ]
}
```

`summary.request_count` 是该 Key 历史累计的已通过认证请求数；`request_events_total` 是新统计启用后保留下来的事件条数，可能包含超过上限而返回 `429` 的拦截事件，因此两个数字不一定相等。`synthesized_characters` 为已提交并进入处理的合成文本字符数，`points_used` 为实际消费、未退款的积分。详情按时间倒序，翻页可以查看全部新记录。

时间字段使用 ISO 8601 格式并包含时区偏移（例如 `2026-10-13T07:11:54+00:00` 表示 UTC 时间）。调用方应按时间字符串中的时区信息解析，再按自身需要转换显示时区；不要把 UTC 时间直接当成本地时间处理。

