# Technathon Server

Backend API for Technathon submissions, admin authentication, uploads, and export.

## Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT auth (`/api/admin/login`)
- AWS S3 uploads (`/api/upload/*`)
- Jest + Supertest tests

## Prerequisites

- Node.js 20+
- npm
- MongoDB (local or hosted)
- AWS account + S3 bucket (for upload endpoints)
- AWS SES (optional, for student email notifications after submit/edit)

## Setup

1. Install dependencies:

```bash
npm ci
```

2. Create env file from template:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Fill required values in `.env`:

- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `MONGO_URI`
- `ALLOWED_ORIGIN`
- AWS S3 values (`AWS_*`, `S3_BUCKET_NAME`)
- Email config:
  - Production SES: `EMAIL_TRANSPORT=ses`, `SES_FROM_EMAIL`, optional `SES_REGION`, `SES_REPLY_TO_EMAIL`, `WIZKLUB_LOGO_URL`
  - Local nodemailer testing: `EMAIL_TRANSPORT=nodemailer`, `NODEMAILER_JSON_TRANSPORT=true` (or SMTP vars)
  - Logo can be set by URL (`WIZKLUB_LOGO_URL`) or local file path (`WIZKLUB_LOGO_PATH`, embedded inline)

Generate admin hash:

```bash
node scripts/generate-hash.js YourStrongPassword
```

## Run

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

Health check:

`GET /health`

## Test

```bash
npm test
```

Coverage:

```bash
npm run test:coverage
```

## Security Notes

- In production, server exits if MongoDB connection fails.
- Upload routes are rate-limited per IP.
- Upload MIME types are validated server-side.
- Keep `.env` out of version control.

## Docker

Build:

```bash
docker build -t technathon-server .
```

Run:

```bash
docker run --rm -p 5000:5000 --env-file .env technathon-server
```
