#!/bin/bash

# ============================================
# Langflow 一键部署脚本
# 用于服务器快速部署
# ============================================

set -e  # 遇到错误立即退出

echo "=========================================="
echo "   Langflow 自定义版本 - 一键部署脚本"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否在 docker 目录
if [ ! -f "production.docker-compose.yml" ]; then
    echo -e "${RED}错误: 请在 docker 目录下运行此脚本${NC}"
    echo "当前目录: $(pwd)"
    exit 1
fi

# 检查 Docker 是否安装
echo -e "${GREEN}[1/7]${NC} 检查 Docker 环境..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装${NC}"
    echo "请先安装 Docker: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}错误: Docker Compose 未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker 环境检查通过${NC}"
echo ""

# 检查环境变量文件
echo -e "${GREEN}[2/7]${NC} 检查配置文件..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}未找到 .env 文件,从模板创建...${NC}"
    cp .env.production .env

    # 生成随机密钥
    SECRET_KEY=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-16)
    ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-16)

    # 更新 .env 文件
    sed -i "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$DB_PASSWORD/" .env
    sed -i "s/SUPERUSER_PASSWORD=.*/SUPERUSER_PASSWORD=$ADMIN_PASSWORD/" .env

    echo -e "${GREEN}✓ 已生成随机密码和密钥${NC}"
    echo -e "${YELLOW}⚠️  请保存以下凭据:${NC}"
    echo ""
    echo "数据库密码: $DB_PASSWORD"
    echo "管理员密码: $ADMIN_PASSWORD"
    echo "密钥: $SECRET_KEY"
    echo ""
    read -p "按回车键继续..."
else
    echo -e "${GREEN}✓ 配置文件已存在${NC}"
fi
echo ""

# 停止旧容器(如果存在)
echo -e "${GREEN}[3/7]${NC} 停止旧容器..."
if docker-compose -f production.docker-compose.yml ps | grep -q "Up"; then
    echo "发现运行中的容器,正在停止..."
    docker-compose -f production.docker-compose.yml down
    echo -e "${GREEN}✓ 旧容器已停止${NC}"
else
    echo -e "${GREEN}✓ 没有运行中的容器${NC}"
fi
echo ""

# 构建镜像
echo -e "${GREEN}[4/7]${NC} 构建 Docker 镜像..."
echo -e "${YELLOW}这可能需要 5-15 分钟,请耐心等待...${NC}"
if docker-compose -f production.docker-compose.yml build --no-cache; then
    echo -e "${GREEN}✓ 镜像构建成功${NC}"
else
    echo -e "${RED}✗ 镜像构建失败${NC}"
    exit 1
fi
echo ""

# 启动服务
echo -e "${GREEN}[5/7]${NC} 启动服务..."
if docker-compose -f production.docker-compose.yml up -d; then
    echo -e "${GREEN}✓ 服务已启动${NC}"
else
    echo -e "${RED}✗ 服务启动失败${NC}"
    echo "运行以下命令查看日志:"
    echo "docker-compose -f production.docker-compose.yml logs"
    exit 1
fi
echo ""

# 等待服务就绪
echo -e "${GREEN}[6/7]${NC} 等待服务就绪..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:7860/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 服务已就绪${NC}"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo ""
    echo -e "${YELLOW}⚠️  服务可能需要更长时间启动${NC}"
    echo "请运行以下命令查看日志:"
    echo "docker-compose -f production.docker-compose.yml logs -f"
fi
echo ""

# 显示部署信息
echo -e "${GREEN}[7/7]${NC} 部署完成!"
echo ""
echo "=========================================="
echo -e "${GREEN}   部署成功!${NC}"
echo "=========================================="
echo ""
echo "服务地址:"
echo -e "  本地访问: ${GREEN}http://localhost:7860${NC}"
echo -e "  外网访问: ${GREEN}http://$(hostname -I | awk '{print $1}'):7860${NC}"
echo ""
echo "管理命令:"
echo "  查看日志: docker-compose -f production.docker-compose.yml logs -f"
echo "  停止服务: docker-compose -f production.docker-compose.yml down"
echo "  重启服务: docker-compose -f production.docker-compose.yml restart"
echo ""
echo "默认管理员账户:"
echo "  用户名: admin"
echo "  密码: (查看 .env 文件中的 SUPERUSER_PASSWORD)"
echo ""
echo "如需修改配置,请编辑 .env 文件后重启服务"
echo ""
echo -e "${YELLOW}⚠️  重要提示:${NC}"
echo "1. 请及时备份数据库和配置文件"
echo "2. 生产环境建议配置 HTTPS"
echo "3. 定期更新依赖包和安全补丁"
echo ""
echo "详细文档: cat DEPLOYMENT.md"
echo "=========================================="
