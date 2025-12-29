# Langflow Docker 部署目录

本目录包含 Langflow 自定义版本的 Docker 部署配置。

## 📁 目录结构

```
docker/
├── .dockerignore                      # Docker 构建排除规则
├── production.Dockerfile              # 生产环境镜像构建文件
├── production.docker-compose.yml      # 生产环境容器编排配置
├── .env.production                    # 环境变量配置模板
├── deploy.sh                          # 一键部署脚本
├── DEPLOYMENT.md                      # 详细部署文档
│
├── dev.Dockerfile                     # 开发环境镜像构建文件
├── dev.docker-compose.yml             # 开发环境容器编排配置
└── dev.start.sh                       # 开发环境启动脚本
```

---

## 🚀 快速开始

### 生产环境部署(服务器部署)

**适用场景**: 将项目部署到服务器供他人使用

```bash
# 1. 配置环境变量
cp .env.production .env
nano .env  # 修改密码和密钥

# 2. 一键部署
bash deploy.sh

# 3. 访问服务
# http://your-server-ip:7860
```

**详细文档**: [DEPLOYMENT.md](DEPLOYMENT.md)

---

### 开发环境部署(本地开发)

**适用场景**: 本地开发和测试

```bash
# 启动开发环境
docker-compose -f dev.docker-compose.yml up -d --build

# 查看日志
docker-compose -f dev.docker-compose.yml logs -f

# 访问服务
# http://localhost:7860
```

---

## 📋 配置说明

### 生产环境配置

| 文件 | 说明 |
|------|------|
| `production.Dockerfile` | 基于 Python 3.12,包含你的所有自定义代码(Speedream组件、视频创作等) |
| `production.docker-compose.yml` | 包含 Langflow + PostgreSQL 数据库 |
| `.env.production` | 环境变量模板(数据库密码、管理员账户等) |

**特性**:
- ✅ 包含所有自定义组件
- ✅ 数据持久化
- ✅ 自动重启
- ✅ 健康检查
- ✅ 资源限制
- ✅ 日志管理

---

### 开发环境配置

| 文件 | 说明 |
|------|------|
| `dev.Dockerfile` | 开发环境构建,使用 uv 包管理器 |
| `dev.docker-compose.yml` | 开发环境编排,挂载本地代码 |
| `dev.start.sh` | 启动脚本,同时运行前后端 |

**特性**:
- ✅ 实时代码更新(挂载本地目录)
- ✅ 前后端同时运行
- ✅ 开发工具支持
- ✅ 调试友好

---

## 🔧 常用命令

### 生产环境

```bash
# 启动服务
docker-compose -f production.docker-compose.yml up -d

# 查看状态
docker-compose -f production.docker-compose.yml ps

# 查看日志
docker-compose -f production.docker-compose.yml logs -f langflow

# 重启服务
docker-compose -f production.docker-compose.yml restart

# 停止服务
docker-compose -f production.docker-compose.yml down

# 重新构建(代码更新后)
docker-compose -f production.docker-compose.yml up -d --build
```

### 开发环境

```bash
# 启动开发环境
docker-compose -f dev.docker-compose.yml up -d

# 进入容器
docker-compose -f dev.docker-compose.yml exec langflow /bin/bash

# 停止开发环境
docker-compose -f dev.docker-compose.yml down
```

---

## 🔒 安全配置

部署前**必须修改** `.env` 文件中的以下配置:

```bash
# 生成随机密钥
SECRET_KEY=$(openssl rand -hex 32)

# 修改为强密码
POSTGRES_PASSWORD=your_strong_password
SUPERUSER_PASSWORD=your_admin_password
```

---

## 📊 包含的自定义功能

本 Docker 配置包含以下自定义组件和功能:

- ✅ **Seedream 4.0-4.5 组件** - 自定义 AI 组件
- ✅ **视频创作功能** - 视频处理相关
- ✅ **豆包 AI 组件** - 豆包音频布局
- ✅ **UI 优化** - 流程侧边栏、预览面板
- ✅ **前端修改** - 自定义界面
- ✅ **组件过滤** - 自定义组件加载逻辑

---

## 🆚 与官方版本的区别

| 特性 | 官方版本 | 本自定义版本 |
|------|---------|-------------|
| 镜像来源 | langflowai/langflow | 本地构建 |
| 自定义组件 | ❌ | ✅ 包含所有 |
| 数据库 | PostgreSQL | PostgreSQL |
| 适用场景 | 标准使用 | 你的特定需求 |

---

## 📦 镜像信息

- **基础镜像**: python:3.12-slim
- **包管理器**: uv (快速 Python 包管理)
- **工作目录**: /app
- **暴露端口**: 7860
- **配置目录**: /app/langflow_config

---

## 🐛 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker-compose -f production.docker-compose.yml logs langflow

# 检查容器状态
docker ps -a
```

### 内存不足

编辑 `production.docker-compose.yml`,调整资源限制:

```yaml
deploy:
  resources:
    limits:
      memory: 2G  # 减少内存限制
```

### 自定义组件未加载

```bash
# 进入容器检查
docker-compose -f production.docker-compose.yml exec langflow ls -la /app/src/backend/base/langflow/custom/

# 查看加载日志
docker-compose -f production.docker-compose.yml logs langflow | grep -i custom
```

---

## 📚 相关文档

- [详细部署指南](DEPLOYMENT.md)
- [一键部署脚本](deploy.sh)
- [环境变量配置](.env.production)

---

## ⚠️ 重要提醒

1. **生产环境必须修改默认密码和密钥**
2. **定期备份数据库**
3. **监控服务器资源使用**
4. **及时更新安全补丁**

---

## 📞 技术支持

如遇问题请查看:
1. [DEPLOYMENT.md](DEPLOYMENT.md) - 完整部署文档
2. 容器日志: `docker-compose logs`
3. 健康检查: `docker inspect <container_id>`

---

**版本**: 1.7.1 (自定义版本)
**更新日期**: 2025-12-29
**维护**: Langflow Custom Team
