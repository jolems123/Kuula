# Server Setup — One-Time Bootstrap

> Run this once on a fresh Ubuntu 22.04+ VPS (DigitalOcean / Hetzner /
> AWS Lightsail) with at least 2 GB RAM. After this, every deploy is
> automatic via the `deploy-backend.yml` workflow on tag push.

## 1. Provision the server

```bash
# On your local machine — create the VPS however you like, then SSH in.
ssh root@<server-ip>

# Update + install Docker + Docker Compose plugin
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y ufw fail2ban

# Firewall — only allow SSH + HTTP + HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## 2. Create the deploy user

The GitHub workflow SSHes in as this user.

```bash
adduser --disabled-password --gecos "" kuula-deploy
usermod -aG docker kuula-deploy
mkdir -p /home/kuula-deploy/.ssh
chmod 700 /home/kuula-deploy/.ssh

# Generate an SSH keypair for CI (locally, NOT on the server)
ssh-keygen -t ed25519 -C "kuula-ci-deploy" -f kuula-ci-deploy -N ""

# Append the public key to the deploy user's authorized_keys
cat kuula-ci-deploy.pub >> /home/kuula-deploy/.ssh/authorized_keys
chown -R kuula-deploy:kuula-deploy /home/kuula-deploy/.ssh
chmod 600 /home/kuula-deploy/.ssh/authorized_keys
```

## 3. Create the app directory + production env

```bash
mkdir -p /opt/kuula
chown kuula-deploy:kuula-deploy /opt/kuula

# Generate the production .env (NEVER commit this file)
cat > /opt/kuula/.env <<'EOF'
# ── Database ────────────────────────────────────────────────────────────────
POSTGRES_USER=kuula
POSTGRES_PASSWORD=$(openssl rand -hex 32)
POSTGRES_DB=kuula

# ── App ─────────────────────────────────────────────────────────────────────
DATABASE_URL=postgres://kuula:$(openssl rand -hex 32)@postgres:5432/kuula
# IMPORTANT: must match POSTGRES_PASSWORD above. Set both to the same value.
JWT_SECRET=$(openssl rand -hex 48)
JWT_ISSUOR=kuula-api
JWT_AUDIENCE=kuula-app
CORS_ORIGIN=https://kuula.ug,https://www.kuula.ug,capacitor://localhost
DEBUG_OTP=false
LOG_LEVEL=info

# ── Mobile money (server-side only — never expose to the browser) ────────────
MTN_BASE_URL=https://momodeveloper.mtn.com
MTN_API_USER=your-mtn-api-user
MTN_API_KEY=your-mtn-api-key
MTN_SUBSCRIPTION_KEY=your-mtn-subscription-key
MTN_TARGET_ENVIRONMENT=mtnuganda
MTN_CALLBACK_URL=https://api.kuula.ug/mtn/callback

AIRTEL_BASE_URL=https://openapi.airtel.africa
AIRTEL_CLIENT_ID=your-airtel-client-id
AIRTEL_CLIENT_SECRET=your-airtel-client-secret
AIRTEL_CALLBACK_URL=https://api.kuula.ug/airtel/callback

# ── Africa's Talking SMS ────────────────────────────────────────────────────
AT_USERNAME=kuula
AT_API_KEY=your-at-api-key
AT_SENDER_ID=KUULA
EOF

chmod 600 /opt/kuula/.env
chown kuula-deploy:kuula-deploy /opt/kuula/.env
```

> **Edit the .env file** to fix the `DATABASE_URL` so its password matches
> `POSTGRES_PASSWORD`, and replace the MTN / Airtel / Africa's Talking
> placeholders with real credentials from those providers.

## 4. First-time deploy

```bash
# As the deploy user
su - kuula-deploy
cd /opt/kuula

# Pull the docker-compose.prod.yml + Caddyfile from the repo
curl -fsSL https://raw.githubusercontent.com/jolems123/KuulaMobile/main/deploy/docker-compose.prod.yml \
  -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/jolems123/KuulaMobile/main/deploy/Caddyfile \
  -o Caddyfile

# Point DNS for api.kuula.ug → this server's IP FIRST, otherwise Caddy
# can't provision the TLS certificate.

# Log into GHCR using a Personal Access Token with `read:packages` scope
echo "$GHCR_PAT" | docker login ghcr.io -u jolems123 --password-stdin

# Pull + start
export KUULA_IMAGE_TAG=latest
docker compose --env-file .env pull
docker compose --env-file .env up -d

# Verify
curl http://localhost:3000/api/health
# → {"ok":true,"service":"kuula-api",...}
```

## 5. Set GitHub secrets for auto-deploy

In the repo → Settings → Secrets and variables → Actions → New secret:

| Secret name | Value |
|---|---|
| `DEPLOY_SSH_KEY` | Contents of `kuula-ci-deploy` (the **private** key, NOT the `.pub`) |
| `DEPLOY_HOST` | Your server's IP or hostname (e.g. `api.kuula.ug`) |
| `DEPLOY_USER` | `kuula-deploy` |
| `PUBLIC_API_URL` | `https://api.kuula.ug` |

## 6. (Optional) Enable manual approval gate

In the repo → Settings → Environments → New environment → name it
`production`. Under "Required reviewers", add yourself. Now every
auto-deploy waits for your manual approval before SSH-ing into the
server — so a malicious or buggy tag push can't ship to prod without
your sign-off.

## 7. Cut your first release

```bash
# Locally, on main
git tag v2.4.2
git push origin v2.4.2
```

Watch the Actions tab → "Deploy Backend" →
1. Build job pushes image to `ghcr.io/jolems123/kuula-api:v2.4.2`
2. Deploy job SSHes onto the server, pulls the new image, restarts the API container, verifies health.

## 8. Disaster recovery

**Rollback to a previous version:**

```bash
ssh kuula-deploy@api.kuula.ug
cd /opt/kuula
export KUULA_IMAGE_TAG=v2.4.1   # previous tag
docker compose --env-file .env up -d api
```

**Database backup (run daily via cron):**

```bash
# Add to /etc/cron.daily/kuula-backup
docker exec kuula-postgres pg_dump -U kuula kuula | \
  gzip > /backups/kuula-$(date +\%F).sql.gz
find /backups -name "kuula-*.sql.gz" -mtime +30 -delete
```

## 9. Monitoring

- **Health check:** `curl https://api.kuula.ug/api/health` returns `{"ok":true}`.
- **Logs:** `docker logs -f kuula-api` (or `docker compose logs -f api`).
- **DB:** `docker exec -it kuula-postgres psql -U kuula kuula`.
