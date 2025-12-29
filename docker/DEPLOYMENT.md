# Langflow 自定义版本 - Docker 部署指南

本指南帮助你在服务器上部署包含自定义组件(Seedream 4.0-4.5、视频创作功能等)的 Langflow 版本。

---

## 📋 前置要求

### 服务器要求
- **操作系统**: Linux (推荐 Ubuntu 20.04+ / CentOS 7+)
- **CPU**: 最少 2 核,推荐 4 核+
- **内存**: 最少 4GB,推荐 8GB+
- **磁盘**: 最少 20GB 可用空间
- **网络**: 开放 7860 端口

### 软件要求
- **Docker**: 20.10+
- **Docker Compose**: 2.0+

---

## 🚀 快速部署步骤

### 1. 准备服务器

安装 Docker 和 Docker Compose:

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# 重新登录以应用用户组更改
```

### 2. 上传项目文件

将整个 `langflow-final` 目录上传到服务器:

```bash
# 方式1: 使用 scp (从本地上传)
scp -r langflow-final user@your-server-ip:/home/user/

# 方式2: 使用 rsync
rsync -avz --progress langflow-final/ user@your-server-ip:/home/user/langflow-final/

# 方式3: 先在服务器上 git clone (如果代码在远程仓库)
git clone your-repo-url
```

### 3. 配置环境变量

```bash
# 进入项目目录
cd langflow-final/docker

# 复制环境变量模板
cp .env.production .env

# 编辑配置文件(重要:修改默认密码!)
nano .env
```

**必须修改的安全配置:**
```bash
# 生成随机密钥
SECRET_KEY=$(openssl rand -hex 32)

# 修改以下密码为强密码
POSTGRES_PASSWORD=your_strong_password_here
SUPERUSER_PASSWORD=your_admin_password_here
```

### 4. 构建并启动服务

```bash
# 在 docker 目录下执行
cd /path/to/langflow-final/docker

# 构建镜像并启动(第一次需要5-15分钟)
docker-compose -f production.docker-compose.yml --env-file .env up -d --build

# 查看启动日志
docker-compose -f production.docker-compose.yml logs -f
```

### 5. 验证部署

```bash
# 检查容器状态
docker-compose -f production.docker-compose.yml ps

# 应该看到以下容器运行中:
# - langflow-app      (健康)
# - langflow-postgres (健康)

# 访问服务
curl http://localhost:7860/health
# 返回: {"status": "healthy"} 或类似内容
```

### 6. 访问应用

打开浏览器访问:
```
http://your-server-ip:7860
```

使用 `.env` 中配置的管理员账户登录。

---

## 📊 服务管理命令

```bash
# 所有命令都在 docker 目录下执行
cd /path/to/langflow-final/docker

# 查看服务状态
docker-compose -f production.docker-compose.yml ps

# 查看日志
docker-compose -f production.docker-compose.yml logs -f langflow

# 重启服务
docker-compose -f production.docker-compose.yml restart

# 停止服务
docker-compose -f production.docker-compose.yml down

# 停止服务并删除数据卷(危险操作!)
docker-compose -f production.docker-compose.yml down -v

# 更新代码后重新部署
git pull
docker-compose -f production.docker-compose.yml up -d --build

# 进入容器调试
docker-compose -f production.docker-compose.yml exec langflow /bin/bash
```

---

## 🔒 安全配置建议

### 1. 配置防火墙

```bash
# Ubuntu UFW
sudo ufw allow 7860/tcp
sudo ufw enable

# CentOS firewalld
sudo firewall-cmd --permanent --add-port=7860/tcp
sudo firewall-cmd --reload
```

### 2. 使用 Nginx 反向代理(可选)

如果需要使用域名和 HTTPS:

```bash
# 安装 Nginx
sudo apt-get install nginx certbot python3-certbot-nginx

# 创建 Nginx 配置
sudo nano /etc/nginx/sites-available/langflow
```

Nginx 配置示例:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:7860;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用配置并申请 SSL 证书:
```bash
sudo ln -s /etc/nginx/sites-available/langflow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 申请 Let's Encrypt 证书
sudo certbot --nginx -d your-domain.com
```

### 3. 配置自动重启

```bash
# 创建 systemd 服务(可选)
sudo nano /etc/systemd/system/langflow-docker.service
```

```ini
[Unit]
Description=Langflow Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/langflow-final/docker
ExecStart=/usr/bin/docker-compose -f production.docker-compose.yml up -d
ExecStop=/usr/bin/docker-compose -f production.docker-compose.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

启用服务:
```bash
sudo systemctl enable langflow-docker.service
sudo systemctl start langflow-docker.service
```

---

## 📦 备份与恢复

### 数据备份

```bash
# 备份 PostgreSQL 数据库
docker-compose -f production.docker-compose.yml exec postgres \
    pg_dump -U langflow langflow > backup_$(date +%Y%m%d).sql

# 备份配置和数据卷
docker run --rm -v langflow-config:/data -v $(pwd):/backup \
    alpine tar czf /backup/config_backup_$(date +%Y%m%d).tar.gz -C /data .

docker run --rm -v langflow-app-data:/data -v $(pwd):/backup \
    alpine tar czf /backup/data_backup_$(date +%Y%m%d).tar.gz -C /data .
```

### 数据恢复

```bash
# 恢复数据库
cat backup.sql | docker-compose -f production.docker-compose.yml exec -T \
    postgres psql -U langflow langflow

# 恢复数据卷
docker run --rm -v langflow-config:/data -v $(pwd):/backup \
    alpine tar xzf /backup/config_backup.tar.gz -C /data
```

---

## 🐛 故障排查

### 问题1: 容器无法启动

```bash
# 查看详细日志
docker-compose -f production.docker-compose.yml logs langflow

# 检查容器资源
docker stats
```

### 问题2: 数据库连接失败

```bash
# 检查 PostgreSQL 容器
docker-compose -f production.docker-compose.yml logs postgres

# 测试数据库连接
docker-compose -f production.docker-compose.yml exec langflow \
    python -c "import psycopg2; conn = psycopg2.connect('postgresql://langflow:langflow@postgres:5432/langflow'); print('Connected')"
```

### 问题3: 内存不足

```bash
# 减少 Dockerfile 中的资源限制
# 或在 docker-compose.yml 中调整:
deploy:
  resources:
    limits:
      memory: 2G  # 从 4G 降低到 2G
```

### 问题4: 自定义组件未加载

```bash
# 进入容器检查文件
docker-compose -f production.docker-compose.yml exec langflow ls -la /app/src/backend/base/langflow/custom/

# 检查日志中的加载信息
docker-compose -f production.docker-compose.yml logs langflow | grep -i custom
```

---

## 📈 性能优化

### 1. 调整资源限制

编辑 `.env` 文件:
```bash
LANGFLOW_MEMORY_LIMIT=8G
LANGFLOW_CPU_LIMIT=4
```

### 2. 启用缓存

```bash
# 在 docker-compose.yml 中添加 Redis 服务
# (可选,用于高级场景)
```

### 3. 数据库优化

```bash
# 调整 PostgreSQL 配置
docker-compose -f production.docker-compose.yml exec postgres nano /var/lib/postgresql/data/pgdata/postgresql.conf
```

---

## 🔄 更新部署

当代码更新时:

```bash
# 1. 拉取最新代码
cd /path/to/langflow-final
git pull

# 2. 停止服务
cd docker
docker-compose -f production.docker-compose.yml down

# 3. 重新构建并启动
docker-compose -f production.docker-compose.yml up -d --build

# 4. 查看日志确认启动成功
docker-compose -f production.docker-compose.yml logs -f
```

---

## 📞 技术支持

如遇到问题:

1. 检查日志: `docker-compose logs`
2. 检查容器状态: `docker-compose ps`
3. 查看健康检查: `docker inspect <container_id> | grep -A 10 Health`

---

## 📝 版本信息

- **Langflow 基础版本**: 1.7.1
- **自定义组件**: Seedream 4.0-4.5
- **部署方式**: Docker Compose
- **部署日期**: 2024-12-29

---

## ⚠️ 重要提醒

1. **生产环境必须修改所有默认密码和密钥!**
2. **定期备份数据!**
3. **监控服务器资源使用情况!**
4. **及时更新依赖包安全补丁!**
