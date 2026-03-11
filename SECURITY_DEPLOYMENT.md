## Production Security Checklist

### Environment Variables
- `NODE_ENV=production`
- `JWT_SECRET` (strong random)
- `FIELD_ENC_KEY` (64 hex chars, AES-256-GCM key)
- `DOC_URL_SIGNING_SECRET` (strong random, separate from JWT recommended)
- `ADMIN_ALERTS_ENABLED=true` (enables critical operation alert emails)
- `BACKEND_URL=https://api.yourdomain.com` (used for signed document links)
- `CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

### Private Documents (Cloudinary)
- Uploads are stored with delivery type `private`
- UI must request `GET /api/documents/signed-url/:id` to download

### Brute Force Protection
- Login locks the account for 15 minutes after 5 failed attempts
- Keep reverse proxy rate limiting enabled as well (Cloudflare/Nginx)

### HTTPS Enforcement
- Backend redirects HTTP to HTTPS in production
- Ensure your load balancer sets `X-Forwarded-Proto=https`

### Daily Backups
Recommended options:
- **MongoDB Atlas**: enable automated backups + point-in-time recovery
- **Self-hosted MongoDB**: schedule a daily `mongodump` to encrypted storage
  - Encrypt backup artifact (AES-256) before upload
  - Store offsite (S3/Backblaze) with versioning + lifecycle retention

### Email Security (Domain DNS)
Configure on your sending domain:
- SPF: include your email provider(s)
- DKIM: publish provider DKIM keys
- DMARC: start with `p=none` then move to `quarantine`/`reject`

### Recommended Frontend Security Headers (via CDN/Proxy)
- `Strict-Transport-Security`
- `Content-Security-Policy`
- `X-Content-Type-Options`
- `Referrer-Policy`
