#!/bin/bash
# GNSS Compute Server - Linux 部署腳本
# 使用方法: chmod +x deploy.sh && ./deploy.sh

set -e

echo "🚀 GNSS Compute Server Linux 部署腳本"
echo "======================================"

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 檢查是否為 root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}❌ 請不要使用 root 執行此腳本${NC}"
   echo "使用方法: ./deploy.sh"
   exit 1
fi

# 檢查作業系統
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${GREEN}✅ Linux 系統檢測${NC}"
else
    echo -e "${RED}❌ 此腳本僅支援 Linux 系統${NC}"
    exit 1
fi

# 檢查 Docker
echo -e "${BLUE}🔍 檢查 Docker 安裝...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker 未安裝，正在安裝...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}✅ Docker 安裝完成${NC}"
else
    echo -e "${GREEN}✅ Docker 已安裝${NC}"
fi

# 檢查 Docker Compose (整合版本)
echo -e "${BLUE}🔍 檢查 Docker Compose...${NC}"
if docker compose version &> /dev/null; then
    echo -e "${GREEN}✅ Docker Compose 已整合在 Docker 中${NC}"
else
    echo -e "${RED}❌ Docker Compose 不可用，請安裝最新版 Docker${NC}"
    echo "安裝指令: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# 檢查環境變數檔案
echo -e "${BLUE}🔍 檢查環境變數設定...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env 檔案不存在，從範本複製...${NC}"
    cp .env.example .env
    
    echo -e "${RED}❗ 重要: 請編輯 .env 檔案設定您的真實配置${NC}"
    echo "必要設定項目:"
    echo "  - CLOUDFLARE_WORKER_URL: 您的 Cloudflare Worker URL"
    echo "  - EXTERNAL_WORKER_API_KEY: 您的 API 金鑰"
    echo ""
    
    read -p "是否現在編輯 .env 檔案? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v nano &> /dev/null; then
            nano .env
        elif command -v vim &> /dev/null; then
            vim .env
        else
            echo -e "${YELLOW}⚠️  請使用文字編輯器編輯 .env 檔案${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  請稍後手動編輯 .env 檔案再啟動服務${NC}"
    fi
else
    echo -e "${GREEN}✅ .env 檔案已存在${NC}"
fi

# 檢查防火牆設定
echo -e "${BLUE}🔍 檢查防火牆設定...${NC}"
if command -v ufw &> /dev/null; then
    echo -e "${YELLOW}📝 設定 UFW 防火牆規則...${NC}"
    sudo ufw allow 3001/tcp
    if docker compose config | grep -q "3002:3001"; then
        sudo ufw allow 3002/tcp
        echo -e "${GREEN}✅ 已開放 port 3001, 3002${NC}"
    else
        echo -e "${GREEN}✅ 已開放 port 3001${NC}"
    fi
elif command -v firewall-cmd &> /dev/null; then
    echo -e "${YELLOW}📝 設定 firewalld 防火牆規則...${NC}"
    sudo firewall-cmd --permanent --add-port=3001/tcp
    if docker compose config | grep -q "3002:3001"; then
        sudo firewall-cmd --permanent --add-port=3002/tcp
    fi
    sudo firewall-cmd --reload
    echo -e "${GREEN}✅ 防火牆規則已設定${NC}"
else
    echo -e "${YELLOW}⚠️  未檢測到防火牆管理工具，請手動開放 port 3001${NC}"
fi

# 詢問部署選項
echo -e "${BLUE}📋 選擇部署模式:${NC}"
echo "1) 單一服務器 (推薦)"  
echo "2) 多服務器 (高併發)"
read -p "請選擇 (1-2): " -n 1 -r
echo

case $REPLY in
    1)
        DEPLOY_MODE="single"
        echo -e "${GREEN}✅ 選擇單一服務器模式${NC}"
        ;;
    2)
        DEPLOY_MODE="scale"
        echo -e "${GREEN}✅ 選擇多服務器模式${NC}"
        ;;
    *)
        DEPLOY_MODE="single"
        echo -e "${YELLOW}⚠️  預設使用單一服務器模式${NC}"
        ;;
esac

# 啟動服務
echo -e "${BLUE}🚀 啟動 GNSS Compute Server...${NC}"
if [ "$DEPLOY_MODE" == "scale" ]; then
    docker compose --profile scale up -d
else
    docker compose up -d
fi

# 等待服務啟動
echo -e "${BLUE}⏳ 等待服務啟動...${NC}"
sleep 10

# 驗證部署
echo -e "${BLUE}🔍 驗證部署狀態...${NC}"

# 檢查容器狀態
if docker compose ps | grep -q "Up"; then
    echo -e "${GREEN}✅ 容器運行正常${NC}"
else
    echo -e "${RED}❌ 容器啟動失敗${NC}"
    echo "查看日誌: docker compose logs"
    exit 1
fi

# 健康檢查
echo -e "${BLUE}🏥 執行健康檢查...${NC}"
sleep 5

if curl -s http://localhost:3001/health > /dev/null; then
    echo -e "${GREEN}✅ 主要服務器健康檢查通過${NC}"
    curl -s http://localhost:3001/health | jq '.' 2>/dev/null || curl -s http://localhost:3001/health
else
    echo -e "${RED}❌ 主要服務器健康檢查失敗${NC}"
fi

if [ "$DEPLOY_MODE" == "scale" ] && curl -s http://localhost:3002/health > /dev/null; then
    echo -e "${GREEN}✅ 第二服務器健康檢查通過${NC}"
fi

# 顯示部署資訊
echo ""
echo -e "${GREEN}🎉 部署完成！${NC}"
echo "=============================="
echo -e "${BLUE}服務資訊:${NC}"
echo "• 主要服務器: http://localhost:3001"
if [ "$DEPLOY_MODE" == "scale" ]; then
    echo "• 第二服務器: http://localhost:3002"  
fi
echo ""
echo -e "${BLUE}管理指令:${NC}"
echo "• 查看狀態: docker compose ps"
echo "• 查看日誌: docker compose logs -f"
echo "• 停止服務: docker compose down"
echo "• 重啟服務: docker compose restart"
echo ""
echo -e "${BLUE}監控端點:${NC}"
echo "• 健康檢查: curl http://localhost:3001/health"
echo "• 系統指標: curl http://localhost:3001/metrics"
echo ""
echo -e "${YELLOW}⚠️  提醒: 請確保 .env 檔案包含正確的配置${NC}"