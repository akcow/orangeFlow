# 生产环境 Dockerfile - 基于你的自定义代码构建
# 适用于服务器部署

FROM python:3.12

LABEL maintainer="your-email@example.com"
LABEL description="Custom Langflow with Seedream Components"

# 设置环境变量
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LANGFLOW_CONFIG_DIR=/app/langflow_config \
    LANGFLOW_LOG_LEVEL=INFO

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 安装 uv
RUN pip install --no-cache-dir uv

# 复制项目文件
COPY pyproject.toml uv.lock README.md ./
COPY src/backend/base/pyproject.toml ./src/backend/base/
COPY src/backend/base/README.md ./src/backend/base/
COPY src/lfx/pyproject.toml ./src/lfx/
COPY src/lfx/README.md ./src/lfx/

# 使用 uv 安装依赖
RUN uv sync --frozen --no-dev --no-editable --extra postgresql

# 复制源代码
COPY src ./src

# 设置 Python 路径
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src/backend/base:/app/src/lfx/src:$PYTHONPATH"

# 创建配置目录
RUN mkdir -p /app/langflow_config

# 暴露端口
EXPOSE 7860

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:7860/health || exit 1

# 启动命令
CMD ["python", "-m", "langflow", "run", \
     "--host", "0.0.0.0", \
     "--port", "7860", \
     "--log-level", "info"]
