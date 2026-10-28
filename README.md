# VoxIndex

**DAXI AI Avatar & Voice Studio** — an end-to-end workspace for voice creation, digital-human video production, and usage management.

VoxIndex brings voice cloning, text-to-speech, digital-human model training, and video generation into one web application. It also includes account and email-verification flows, credit-based billing, payment integrations, generation history, and an administration console for user and provider-call auditing.

**中文简介：** VoxIndex（大汐数字人与声音创作平台）是一站式 AI 音视频创作与管理平台，提供声音克隆、文本转语音、数字人模型训练和数字人视频生成，并配套账号体系、积分计费、支付、创作记录及运营审计后台。

## Features

- **Digital-human creation:** Upload a training video, submit model training to the Xingchen Zhichuang service, and track model status. Select a trained model and a completed speech job to create a video, with optional naming and watermark placement.
- **Asynchronous job tracking:** The digital-human workspace polls model and video status every five seconds and also supports provider callbacks. Completed video metadata and available media are retained in the user's history.
- **Voice cloning and speech synthesis:** Manage voice samples and cloned voices, synthesize speech from text, and review, play, or download generated audio. The synthesis provider is configurable for IndexTTS2, Tencent FlowTTS, or the development stub.
- **Credit accounting:** Track credit grants, usage, expiration, reservations, capture, and refunds. Digital-human video billing measures audio duration, applies model-included seconds, and charges for billable excess; failed jobs can be refunded.
- **Accounts and access:** Registration and password recovery use email verification. Registration captures a required referral channel/company. JWT-based authentication protects user and administration APIs.
- **Payments and plans:** Manage credit packages and payment orders with Stripe Checkout and retained legacy merchant-gateway support.
- **Administration and audit:** Manage users, quotas, integrations, and customer API keys. Review referral information, credit transactions, and upstream provider calls, including provider, operation, endpoint, status, outcome, duration, references, and request/response summaries.
- **Excel reporting:** Export user/referral data, credit ledgers, and provider-call details to a multi-sheet `.xlsx` workbook.
- **Media storage:** Store uploaded and generated media locally, with optional Alibaba Cloud OSS backup.
- **Bilingual interface:** Chinese and English user-facing interface.

## Technology

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, Vite 7, React Router 7, Axios, JavaScript, CSS |
| Backend | Python, FastAPI, Uvicorn, Pydantic, HTTPX |
| Data | SQLAlchemy, Alembic, SQLite/PostgreSQL configuration |
| Identity and security | JWT (`python-jose`), Passlib, bcrypt, email verification |
| AI and media integrations | IndexTTS2, Tencent Cloud FlowTTS, Xingchen Zhichuang digital-human API, FFmpeg/ffprobe |
| Storage and payments | Alibaba Cloud OSS SDK, Stripe Checkout, legacy merchant gateway |
| Operations | Docker Compose, Nginx, Certbot/Let's Encrypt, openpyxl |

## Architecture

```text
frontend/                 React + Vite single-page application
backend/app/api/           FastAPI routes for auth, synthesis, digital human, billing, and administration
backend/app/models/        SQLAlchemy data models
backend/app/services/      Provider clients, credits, email, media, and storage services
index-tts/                 IndexTTS2 implementation code
docs/                      Local development and deployment guides
docker-compose*.yml        Development and production container configurations
```

The application orchestrates external AI providers; digital-human model training and video generation are performed by the configured upstream provider. IndexTTS2 model checkpoints and provider credentials are not included in this repository.

## Getting Started

See [docs/START_HERE.md](docs/START_HERE.md) for local setup and [docs/DEPLOY_PUBLIC.md](docs/DEPLOY_PUBLIC.md) for public deployment guidance.

### Prerequisites

- Python 3.10 or later
- Node.js 20 or later
- SQLite or PostgreSQL, according to the selected environment
- FFmpeg/ffprobe for media duration and processing workflows

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Configure the required backend environment variables using the root environment examples. Set a strong `SECRET_KEY`, database connection, public application URL, and only the provider credentials needed for the features you enable. Start the API:

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server prints the local URL. The API health endpoint is available at `/api/health` on the backend host.

## Configuration Notes

- Choose a synthesis provider with `TTS_PROVIDER`: `indextts2`, `tencent_flowtts`, or `stub`.
- Configure Xingchen credentials and a public callback/media URL to enable digital-human training and video generation.
- Configure SMTP settings for email verification and password recovery.
- Configure Stripe secrets and its webhook for Stripe Checkout. Keep all secrets on the backend.
- OSS backup is optional and controlled by `OSS_BACKUP_ENABLED`.
- Use `.env.prod.example` or `.env.docker.example` as a template; never commit real `.env` files, API keys, customer databases, uploads, or generated media.

## License

This project is distributed under the MIT License. See [LICENSE](LICENSE).
