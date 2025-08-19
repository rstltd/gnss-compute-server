# Linux 主機部署指南

完整的 GNSS Compute Server Linux 部署教學

## 🔧 系統需求

- **作業系統**: Ubuntu 20.04+ / CentOS 8+ / RHEL 8+
- **Docker**: 20.10+ 
- **Docker Compose**: 2.0+
- **記憶體**: 至少 4GB (建議 8GB+)
- **CPU**: 至少 2 核心 (建議 4 核心+)
- **網路**: 能存取 Cloudflare Workers 的網路連線

## 📦 快速部署 (推薦)

### 1. 安裝 Docker 和 Docker Compose

#### Ubuntu/Debian:
```bash
# 更新套件清單
sudo apt update

# 安裝 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安裝 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 重新登入以套用權限
newgrp docker
```

#### CentOS/RHEL:
```bash
# 安裝 Docker
sudo dnf install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# 安裝 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 下載專案

```bash
# 下載專案
git clone https://github.com/ChuHsunKuang/gnss-compute-server.git
cd gnss-compute-server

# 或直接下載 ZIP (如果沒有 git)
wget https://github.com/ChuHsunKuang/gnss-compute-server/archive/refs/heads/master.zip
unzip master.zip
cd gnss-compute-server-master
```

### 3. 設定環境變數 (.env)

```bash
# 複製環境變數範本
cp .env.example .env

# 編輯環境變數 (使用您偏好的編輯器)
nano .env
# 或
vim .env
```

#### .env 檔案範例內容:
```env
# 必要設定 - 請替換為您的真實值
CLOUDFLARE_WORKER_URL=https://gnss-edge-function.您的domain.workers.dev
EXTERNAL_WORKER_API_KEY=您的真實API金鑰

# 可選設定
WORKER_ID=linux-server-001
POLL_INTERVAL=5000
MAX_CONCURRENT_JOBS=3
PORT=3001

# 效能調整
MEMORY_LIMIT_MB=4096
CPU_CORES=4
```

### 4. 部署單一服務器

```bash
# 啟動服務 (背景執行)
docker-compose up -d

# 查看日誌
docker-compose logs -f gnss-compute-server

# 檢查服務狀態
docker-compose ps
```

### 5. 部署多個服務器 (高併發)

```bash
# 啟動主要服務器 + 第二個服務器
docker-compose --profile scale up -d

# 查看所有服務狀態
docker-compose ps
```

## 🌐 防火牆和 Port 設定

### Port 開放要求:

| Port | 用途 | 是否必需 | 說明 |
|------|------|----------|------|
| **3001** | 主要服務器 API | ✅ **必需** | 用於健康檢查和監控 |
| **3002** | 第二個服務器 | ❌ 可選 | 僅在使用 scale profile 時需要 |

### Ubuntu/Debian 防火牆設定:
```bash
# 使用 ufw
sudo ufw allow 3001/tcp
sudo ufw allow 3002/tcp  # 僅在需要第二個服務器時
sudo ufw enable

# 檢查狀態
sudo ufw status
```

### CentOS/RHEL 防火牆設定:
```bash
# 使用 firewalld
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --permanent --add-port=3002/tcp  # 僅在需要第二個服務器時
sudo firewall-cmd --reload

# 檢查狀態
sudo firewall-cmd --list-ports
```

### 雲端服務器額外設定:

#### AWS EC2:
- 在 Security Groups 中開放 port 3001, 3002
- 來源設定為 `0.0.0.0/0` (或限制特定 IP)

#### Azure VM:
- 在 Network Security Group 中新增 Inbound rules
- Port: 3001, 3002, Protocol: TCP

#### Google Cloud VM:
```bash
# 建立防火牆規則
gcloud compute firewall-rules create allow-gnss-ports \
    --allow tcp:3001,tcp:3002 \
    --source-ranges 0.0.0.0/0
```

## 🔍 驗證部署

### 1. 檢查服務狀態
```bash
# Docker 容器狀態
docker-compose ps

# 健康檢查
curl http://localhost:3001/health
curl http://localhost:3002/health  # 如果啟用第二個服務器

# 查看日誌
docker-compose logs gnss-compute-server
```

### 2. 系統監控
```bash
# 資源使用情況
docker stats

# 容器日誌 (即時)
docker-compose logs -f
```

### 3. 外部連線測試
```bash
# 從外部測試 (替換為您的主機 IP)
curl http://您的主機IP:3001/health

# 預期回應:
# {"status":"healthy","workerId":"linux-server-001",...}
```

## ⚙️ 進階設定

### 1. 效能調整

編輯 `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 8G      # 根據您的系統調整
      cpus: '10.0'    # 根據您的 CPU 核心數調整
```

### 2. 自動啟動設定

```bash
# 設定開機自動啟動 Docker
sudo systemctl enable docker

# Docker Compose 服務會因為 restart: unless-stopped 自動重啟
```

### 3. 日誌管理

```bash
# 限制日誌大小 (編輯 docker-compose.yml)
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## 🚀 擴展部署

### 水平擴展 (多台主機):
```bash
# 主機 1
WORKER_ID=server-001 docker-compose up -d

# 主機 2  
WORKER_ID=server-002 docker-compose up -d

# 主機 3
WORKER_ID=server-003 docker-compose up -d
```

每台主機會自動從 Cloudflare Worker 拉取任務，實現負載分散。

## 🛠️ 故障排除

### 常見問題:

1. **連線失敗到 Cloudflare Worker**
   ```bash
   # 檢查網路連線
   curl -I https://您的worker.workers.dev
   
   # 檢查 DNS 解析
   nslookup 您的worker.workers.dev
   ```

2. **記憶體不足**
   ```bash
   # 檢查系統記憶體
   free -h
   
   # 調整 Docker 記憶體限制
   # 編輯 docker-compose.yml 中的 memory 設定
   ```

3. **Port 被占用**
   ```bash
   # 檢查 port 使用狀況
   sudo netstat -tulpn | grep 3001
   
   # 修改 docker-compose.yml 中的 ports 設定
   ports:
     - "3003:3001"  # 改用其他 port
   ```

## 📊 監控建議

建議使用以下工具監控服務:
- **Portainer**: Docker 容器管理界面
- **Grafana + Prometheus**: 系統監控
- **ELK Stack**: 日誌分析

---

## 快速部署指令摘要

```bash
# 1. 準備環境
sudo apt update && curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. 下載專案
git clone https://github.com/ChuHsunKuang/gnss-compute-server.git
cd gnss-compute-server

# 3. 設定環境
cp .env.example .env
nano .env  # 編輯您的設定

# 4. 開放防火牆
sudo ufw allow 3001/tcp

# 5. 啟動服務
docker-compose up -d

# 6. 驗證
curl http://localhost:3001/health
```

🎉 部署完成！您的 GNSS Compute Server 現在正在運行並自動處理來自 Cloudflare Worker 的任務。