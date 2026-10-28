# Docker Server Deployment

This is the simple production deployment for the DAXI voice platform.

It runs:
- frontend: Nginx serving the built React app
- backend: FastAPI
- database: PostgreSQL
- storage: a Docker volume for uploaded voice files and generated audio

## 1. Prepare the server

Install Docker and Docker Compose on the server.

Open the server firewall/security group:
- `80` for the website
- `443` later if you add HTTPS

## 2. Upload the project

Put this project folder on the server.

## 3. Create production env file

Copy the example file:

```bash
cp .env.prod.example .env.prod
```

Edit `.env.prod`.

Important values:
- `POSTGRES_PASSWORD`: change it to a strong password
- `SECRET_KEY`: change it to a long random string
- `FRONTEND_APP_URL`: your server IP or domain
- `FRONTEND_ORIGINS`: same as your server IP or domain
- `TENCENTCLOUD_SECRET_ID`: Tencent Cloud SecretId
- `TENCENTCLOUD_SECRET_KEY`: Tencent Cloud SecretKey
- `TENCENTCLOUD_SDK_APP_ID`: TRTC SDKAppID

Do not put `.env.prod` into Git.

## 4. Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Open:

```text
http://your-server-ip-or-domain
```

## 5. Check logs

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f frontend
```

## About Alibaba Cloud storage

Alibaba Cloud OSS is good for audio files, images, and other uploaded/generated files.

It should not be used as the database.

Recommended split:
- PostgreSQL: users, login, voice records, synthesis history
- OSS: uploaded voice samples, generated audio files, avatar images

The current production Docker setup keeps files in the `app_storage` Docker volume first. After the server version is stable, add an OSS storage service and replace local file saving with OSS upload/download URLs.
