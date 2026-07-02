# Azure Deployment Guide — Kuula Mobile

This guide covers deploying the full Kuula stack (frontend + backend + database) to Microsoft Azure, optimized for the East Africa region serving Uganda.

## Architecture Overview

```
Internet → Azure CDN (Front Door) → Azure Blob Storage ($web) [Frontend]
                                        ↓
                          Azure Container Apps (ACA) [Backend API]
                                        ↓
                          Azure Database for PostgreSQL [Database]
```

## Prerequisites

- Azure subscription with billing enabled
- Azure CLI installed (`az --version`)
- GitHub repo connected to Azure (OIDC or service principal)

## Quick Setup (One-Time)

```bash
# 1. Set variables
LOCATION="eastusa2"  # or eastafrica if available in your subscription
RG_NAME="kuula-rg-production"
ACR_NAME="kuulacregistry"
STORAGE_NAME="kuulaproduction"
POSTGRES_SERVER="kuula-postgres"
ENV="production"

# 2. Create resource group
az group create --name $RG_NAME --location $LOCATION

# 3. Create Azure Container Registry
az acr create \
  --resource-group $RG_NAME \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

# 4. Create Azure Blob Storage (for frontend static assets)
az storage account create \
  --resource-group $RG_NAME \
  --name $STORAGE_NAME \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access true

# Enable static website
az storage blob service-properties update \
  --account-name $STORAGE_NAME \
  --static-website \
  --index-document index.html \
  --error-document 404.html

# 5. Create Azure CDN Profile + Endpoint
az cdn profile create \
  --resource-group $RG_NAME \
  --name kuula-cdn \
  --sku Standard_Microsoft

az cdn endpoint create \
  --resource-group $RG_NAME \
  --profile-name kuula-cdn \
  --name kuula-$ENV \
  --origin "$STORAGE_NAME.blob.core.windows.net" \
  --origin-host-head "$STORAGE_NAME.z5.web.core.windows.net" \
  --enable-compression true

# 6. Create Azure Container Apps Environment
az containerapp env create \
  --resource-group $RG_NAME \
  --name kuula-env-$ENV \
  --location $LOCATION

# 7. Create Azure Database for PostgreSQL (Flexible Server)
az postgres flexible-server create \
  --resource-group $RG_NAME \
  --name $POSTGRES_SERVER \
  --location $LOCATION \
  --admin-user kuula_admin \
  --admin-password $POSTGRES_ADMIN_PASSWORD \
  --sku-name Standard_B1ms \
  --storage-size 32Gb \
  --version 16 \
  --tier Burstable

# Allow Azure services to access the PostgreSQL server
az postgres flexible-server firewall-rule create \
  --resource-group $RG_NAME \
  --name $POSTGRES_SERVER \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Create the database
az postgres flexible-server db create \
  --resource-group $RG_NAME \
  --server-name $POSTGRES_SERVER \
  --database-name kuula

# 8. Create Azure Container App (Backend API)
az containerapp create \
  --resource-group $RG_NAME \
  --name kuula-api-$ENV \
  --environment kuula-env-$ENV \
  --image kuulacregistry.azurecr.io/kuula-api:latest \
  --registry-server kuulacregistry.azurecr.io \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 3000 \
  --ingress external \
  --env-vars \
    DATABASE_URL="postgres://kuula_admin:$POSTGRES_ADMIN_PASSWORD@$POSTGRES_SERVER.postgres.database.azure.com:5432/kuula?sslmode=require" \
    JWT_SECRET="$JWT_SECRET" \
    NODE_ENV="production" \
  --min-replicas 1 \
  --max-replicas 5 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --query "properties.configuration.ingress.fqdn"
```

## GitHub Actions Secrets Required

Add these to your GitHub repository settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `AZURE_CREDENTIALS` | Azure service principal JSON (use `az ad sp create-for-rbac`) |
| `ACR_USERNAME` | ACR admin username (`az acr credential show -n kuulacregistry --query "username"`) |
| `ACR_PASSWORD` | ACR admin password (`az acr credential show -n kuulacregistry --query "passwords[0].value"`) |
| `VITE_API_BASE_URL_PROD` | Your ACA backend URL (e.g. `https://kuula-api-production.xxx.eastus2.azurecontainerapps.io`) |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded Android signing keystore |
| `ANDROID_STORE_PASSWORD` | Android keystore store password |
| `ANDROID_KEY_ALIAS` | Android key alias |
| `ANDROID_KEY_PASSWORD` | Android key password |

## Environment Variables for Backend

Set these in the Azure Container App configuration or via GitHub Actions:

```bash
# Database
DATABASE_URL=postgres://kuula_admin:PASSWORD@kuula-postgres.postgres.database.azure.com:5432/kuula?sslmode=require

# Security
JWT_SECRET=<32+ character random string>
NODE_ENV=production

# Mobile Money APIs (optional — production credentials)
MTN_API_USER_ID=<from MTN sandbox>
MTN_API_KEY=<from MTN sandbox>
MTN_PRIMARY_KEY=<from MTN sandbox>
MTN_DISBURSEMENT_KEY=<from MTN sandbox>
MTN_MOMO_HOST=https://sandbox.momodeveloper.mtn.com
AIRTEL_CLIENT_ID=<from Airtel sandbox>
AIRTEL_CLIENT_SECRET=<from Airtel sandbox>

# SMS (optional)
AFRICASTALKING_API_KEY=<from Africa's Talking>
AFRICASTALKING_USERNAME=<from Africa's Talking>

# CORS
ALLOWED_ORIGINS=https://kuula.ug,https://app.kuula.ug
```

## Deploying Frontend

The frontend (Vite build output) is deployed to Azure Blob Storage's `$web` container:

```bash
# Build
cd KuulaMobile
npm run build

# Deploy to Blob Storage
az storage blob upload-batch \
  --destination '$web' \
  --source dist/ \
  --account-name $STORAGE_NAME \
  --auth-mode login \
  --overwrite \
  --content-cache-control "public, max-age=31536000, immutable"

# Purge CDN cache
az cdn endpoint purge \
  --resource-group $RG_NAME \
  --profile-name kuula-cdn \
  --name kuula-$ENV \
  --content-paths "/*"
```

## Deploying Backend

```bash
# Build + push Docker image
az acr login --name $ACR_NAME
docker build -t kuulacregistry.azurecr.io/kuula-api:latest ./backend
docker push kuulacregistry.azurecr.io/kuula-api:latest

# Update Container App
az containerapp up \
  --resource-group $RG_NAME \
  --name kuula-api-$ENV \
  --image kuulacregistry.azurecr.io/kuula-api:latest \
  --registry-server kuulacregistry.azurecr.io
```

## Database Migrations

Run migrations after deploying a new backend version:

```bash
# Option 1: Remote exec into container
az containerapp exec \
  --resource-group $RG_NAME \
  --name kuula-api-$ENV \
  --command "npx node-pg-migrate up"

# Option 2: Direct connection
DATABASE_URL="postgres://kuula_admin:PASSWORD@kuula-postgres.postgres.database.azure.com:5432/kuula?sslmode=require" \
  npx node-pg-migrate up --migrations-dir backend/src/db/migrations
```

## Monitoring

```bash
# Container App logs
az containerapp logs show \
  --resource-group $RG_NAME \
  --name kuula-api-$ENV \
  --follow

# PostgreSQL logs
az postgres flexible-server logs list \
  --resource-group $RG_NAME \
  --server-name $POSTGRES_SERVER
```

## Cost Estimates (Pay-As-You-Go)

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Container Apps (1-3 replicas) | ~$30-60 |
| PostgreSQL Flexible (Burstable B1ms) | ~$50 |
| Blob Storage (50GB) | ~$1 |
| CDN (1TB transfer) | ~$40 |
| Container Registry (Basic) | ~$5 |
| **Total** | **~$130-160/month** |
