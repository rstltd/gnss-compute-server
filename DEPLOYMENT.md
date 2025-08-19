# GNSS Pull Consumer Architecture - Deployment Guide

## 🏗️ Architecture Overview

```
┌─────────────────────┐    HTTP API     ┌─────────────────────┐
│  Cloudflare Worker  │ ◄──────────────► │   GNSS Compute      │
│  (Entry Point)      │                 │   Server            │
│                     │                 │  (Pull Consumer)    │
│ • Accept requests   │                 │                     │
│ • Queue tasks       │                 │ • Pull tasks        │
│ • Return jobId      │                 │ • Process GNSS      │
│ • Serve results     │                 │ • Submit results    │
└─────────────────────┘                 └─────────────────────┘
         │                                        │
         ▼                                        │
┌─────────────────────┐                         │
│ Cloudflare Storage  │ ◄───────────────────────┘
│                     │
│ • KV (Task Status)  │
│ • R2 (Large Files)  │
│ • Queue (Tasks)     │
└─────────────────────┘
```

## 🚀 Quick Deployment

### 1. Deploy Cloudflare Worker

```bash
cd gnss-edge-function/
wrangler secret put EXTERNAL_WORKER_API_KEY
# Enter: your-secure-api-key
npx wrangler deploy
```

### 2. Setup Compute Server

```bash
cd gnss-compute-server/
npm install
cp .env.example .env
# Edit .env with your configuration
```

**Required Environment Variables:**
```env
CLOUDFLARE_WORKER_URL=https://gnss-edge-function.your-subdomain.workers.dev
EXTERNAL_WORKER_API_KEY=your-secure-api-key
```

### 3. Start Compute Server

```bash
npm start
```

### 4. Verify Setup

```bash
# Check Cloudflare Worker
curl https://gnss-edge-function.your-subdomain.workers.dev/api/external/pull-task \\
  -H "Authorization: Bearer your-api-key"

# Check Compute Server  
curl http://localhost:3001/health
```

## 📊 Monitoring

### Health Checks
- **Cloudflare Worker**: `GET /api/external/pull-task`
- **Compute Server**: `GET /health`

### Metrics
- **Compute Server**: `GET /metrics`

## 🔄 Processing Flow

1. **Client** → POST file to Cloudflare Worker `/async-process`
2. **Worker** → Returns `jobId`, stores task in Queue
3. **Compute Server** → Polls `/api/external/pull-task`
4. **Compute Server** → Processes GNSS data with full handlers
5. **Compute Server** → Submits result via `/api/external/submit-result`
6. **Client** → Polls `/result/{jobId}` for completion

## 🐳 Production Deployment

### Docker
```bash
cd gnss-compute-server/
docker build -t gnss-compute-server .
docker run -d \\
  --name gnss-server-1 \\
  -e CLOUDFLARE_WORKER_URL="https://your-worker.workers.dev" \\
  -e EXTERNAL_WORKER_API_KEY="your-api-key" \\
  -e MAX_CONCURRENT_JOBS=5 \\
  -p 3001:3001 \\
  gnss-compute-server
```

### Scale Horizontally
```bash
# Run multiple compute servers
docker run -d --name gnss-server-2 -e WORKER_ID=server-2 ...
docker run -d --name gnss-server-3 -e WORKER_ID=server-3 ...
```

## ✅ Benefits Achieved

- ⚡ **High Performance** - Dedicated compute resources
- 🔄 **Scalable** - Multiple compute servers
- 🛡️ **Reliable** - Task queuing with retry
- 💰 **Cost Effective** - Minimal Cloudflare Worker usage
- 📊 **Monitorable** - Health checks and metrics
- 🐳 **Container Ready** - Easy deployment

## 🧪 Testing

### Submit Test Job
```bash
curl -X POST https://your-worker.workers.dev/async-process \\
  -F file=@test.pos \\
  -F handlerType=dataLowess,swcaCalculate
```

### Check Result
```bash
curl https://your-worker.workers.dev/result/{jobId}
```