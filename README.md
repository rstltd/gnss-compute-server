# GNSS Compute Server

High-performance GNSS computation server with Pull Consumer architecture for distributed processing.

## Architecture

This server works with Cloudflare Workers in a Pull Consumer pattern:

1. **Cloudflare Worker** - Lightweight entry point that receives requests and queues tasks
2. **GNSS Compute Server** - High-performance computation engine that pulls tasks and processes GNSS data

## Features

- 🚀 **High-Performance Computing** - Dedicated server for intensive GNSS calculations
- 🔄 **Pull Consumer Pattern** - Automatically pulls tasks from Cloudflare Worker queue  
- ⚡ **Concurrent Processing** - Configurable concurrent job processing
- 📊 **Health Monitoring** - Built-in health check and metrics endpoints
- 🐳 **Docker Ready** - Containerized for easy deployment
- 🔒 **Secure** - API key authentication with Cloudflare Worker

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
export CLOUDFLARE_WORKER_URL="https://gnss-edge-function.rstltd.org"
export EXTERNAL_WORKER_API_KEY="e4795655e62c47a699abebe347fc330b4b2f5a0b4eeef0a0955d95e4ae7c6e2a"
export WORKER_ID="compute-server-01"
```

### 3. Start the Server
```bash
npm start
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOUDFLARE_WORKER_URL` | ✅ | - | Your Cloudflare Worker URL |
| `EXTERNAL_WORKER_API_KEY` | ✅ | - | API key for authentication |
| `WORKER_ID` | ❌ | `compute-server-{timestamp}` | Unique worker identifier |
| `POLL_INTERVAL` | ❌ | `5000` | Task polling interval (ms) |
| `MAX_CONCURRENT_JOBS` | ❌ | `3` | Maximum concurrent jobs |
| `PORT` | ❌ | `3001` | HTTP server port |

## API Endpoints

- **GET /health** - Health check and system status
- **GET /metrics** - Processing metrics and performance data

## GNSS Processing Capabilities

The server includes comprehensive GNSS data processing handlers:

### Core Handlers
- `CoordinateConvertHandler` - Coordinate system conversion (ECEF, WGS84, TWD97)
- `DataOutliersHandler` - Outlier detection and removal
- `DataMedianHandler` - Median filtering
- `DataLowessHandler` - LOWESS smoothing algorithm
- `DataInterpolationHandler` - Data interpolation
- `DataAverageHandler` - Data averaging
- `SwcaCalculateHandler` - SWCA (Water and Soil Conservation Agency) calculations
- `XmlFormatterHandler` - XML output formatting

### Supported Input Formats
- `.pos` files (GNSS positioning data)
- CSV format data
- JSON formatted requests

### Output Formats  
- CSV (UTF-8) for most processing types
- XML for SWCA calculations
- JSON for API responses

## Development

### Build TypeScript
```bash
npm run build
```

### Development with Auto-reload
```bash
npm run dev
```

## Deployment

### Docker
```bash
docker build -t gnss-compute-server .
docker run -d \\
  --name gnss-server \\
  -e CLOUDFLARE_WORKER_URL="https://your-worker.workers.dev" \\
  -e EXTERNAL_WORKER_API_KEY="your-api-key" \\
  -p 3001:3001 \\
  gnss-compute-server
```

### Production Considerations
- Use environment variables for configuration
- Monitor `/health` endpoint for system status
- Scale horizontally by running multiple instances
- Use process managers like PM2 for production deployment

## Architecture Integration

This compute server integrates with:
- **Cloudflare Workers** - Task queueing and result storage
- **Cloudflare KV** - Task status and result caching  
- **Cloudflare R2** - Large file storage for processing
- **Java Client** - For automated GNSS processing workflows

## Performance

- Handles large GNSS datasets (multi-MB .pos files)
- Concurrent processing with configurable limits
- Memory-efficient streaming processing
- Optimized for CPU-intensive GNSS calculations