# Langflow 自定义版本 - 服务器 Docker 部署指南

本指南帮助你在服务器上部署包含自定义组件的 Langflow 版本。

---

## 📋 前置要求

- **操作系统**: Linux (推荐 Ubuntu 20.04+)
- **内存**: 最少 4GB，推荐 8GB+
- **磁盘**: 最少 20GB
- **端口**: 开放 7860 端口
- **软件**: Docker 20.10+、Docker Compose 2.0+

---

## 🚀 快速部署

### 方法一：一键部署（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/akcow/langflow-final.git
cd langflow-final/docker

# 2. 运行一键部署脚本
chmod +x deploy.sh
./deploy.sh
```

脚本会自动：
- 检查 Docker 环境
- 生成随机密码和密钥
- 构建镜像并启动服务

### 方法二：手动部署

```bash
# 1. 克隆仓库
git clone https://github.com/akcow/langflow-final.git
cd langflow-final/docker

# 2. 创建配置文件
cp .env.example .env

# 3. 编辑配置（重要！修改密码）
nano .env

# 4. 构建并启动
docker compose -f production.docker-compose.yml up -d --build

# 5. 查看日志
docker compose -f production.docker-compose.yml logs -f
```

---

## ⚙️ 配置说明

编辑 `.env` 文件，**必须修改以下配置**：

```bash
# 数据库密码（必须修改）
POSTGRES_PASSWORD=your_strong_password_here

# 管理员密码（必须修改）
SUPERUSER_PASSWORD=your_admin_password_here

# 密钥（必须修改，运行以下命令生成）
# openssl rand -hex 32
SECRET_KEY=your_random_secret_key_here
```

### 可选配置

```bash
# 火山引擎 API Key（用于图片创作）
VOLCENGINE_API_KEY=your_volcengine_api_key

# 阿里云 DashScope API Key
DASHSCOPE_API_KEY=your_dashscope_api_key
```

---

## 📊 服务管理命令

```bash
# 进入 docker 目录
cd /path/to/langflow-final/docker

# 查看状态
docker compose -f production.docker-compose.yml ps

# 查看日志
docker compose -f production.docker-compose.yml logs -f

# 重启服务
docker compose -f production.docker-compose.yml restart

# 停止服务
docker compose -f production.docker-compose.yml down

# 进入容器调试
docker compose -f production.docker-compose.yml exec langflow bash
```

---

## 🔄 更新部署

```bash
cd /path/to/langflow-final

# 拉取最新代码
git pull

# 重新构建并启动
cd docker
docker compose -f production.docker-compose.yml up -d --build
```

---

## 🐛 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker compose -f production.docker-compose.yml logs langflow

# 检查容器状态
docker compose -f production.docker-compose.yml ps
```

### 数据库连接失败

```bash
# 检查 PostgreSQL 日志
docker compose -f production.docker-compose.yml logs postgres

# 测试数据库连接
docker compose -f production.docker-compose.yml exec langflow \
    python -c "import psycopg2; print('OK')"
```

### 自定义组件未显示

确保使用的是本仓库构建的镜像，而不是官方 `langflowai/langflow`。

验证方法：
```bash
docker compose -f production.docker-compose.yml exec langflow \
    python -c "import lfx; print('LFX OK')"
```

---

## 🔒 安全建议

1. **修改所有默认密码**
2. **配置防火墙**：
   ```bash
   sudo ufw allow 7860/tcp
   sudo ufw enable
   ```
3. **生产环境建议配置 HTTPS**（使用 Nginx + Let's Encrypt）

---

## 📦 备份数据

```bash
# 备份数据库
docker compose -f production.docker-compose.yml exec postgres \
    pg_dump -U langflow langflow > backup_$(date +%Y%m%d).sql

# 恢复数据库
cat backup.sql | docker compose -f production.docker-compose.yml exec -T \
    postgres psql -U langflow langflow
```

---

## 📞 获取帮助

- 查看日志：`docker compose logs`
- 检查状态：`docker compose ps`
- 健康检查：`curl http://localhost:7860/health`