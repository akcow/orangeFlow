#!/bin/bash

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   LangFlow 一键部署启动器             ║"
echo "║   版本: 1.0.0                          ║"
echo "╚════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

# 步骤 1: 检查 Python 环境
echo "[1/6] 检查 Python 环境..."
if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo "[错误] 未找到 Python，请先安装 Python 3.10-3.13"
        exit 1
    else
        PYTHON_CMD=python
    fi
else
    PYTHON_CMD=python3
fi

PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}')
echo "✓ Python 版本: $PYTHON_VERSION"
echo ""

# 步骤 2: 检查 Node.js 环境
echo "[2/6] 检查 Node.js 环境..."
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version 2>&1)
echo "✓ Node.js 版本: $NODE_VERSION"
echo ""

# 步骤 3: 检查并创建虚拟环境
echo "[3/6] 检查虚拟环境..."
if [ ! -d "venv" ]; then
    echo "正在创建虚拟环境..."
    $PYTHON_CMD -m venv venv
    if [ $? -ne 0 ]; then
        echo "[错误] 虚拟环境创建失败"
        exit 1
    fi
    echo "✓ 虚拟环境创建成功"
else
    echo "✓ 虚拟环境已存在"
fi
echo ""

# 步骤 4: 激活虚拟环境并安装依赖
echo "[4/6] 检查 Python 依赖..."
source venv/bin/activate
if [ $? -ne 0 ]; then
    echo "[错误] 虚拟环境激活失败"
    exit 1
fi
echo "✓ 虚拟环境已激活"
echo ""

echo "正在升级 pip..."
python -m pip install --upgrade pip > /dev/null 2>&1
echo "✓ pip 已升级"
echo ""

if [ ! -d "venv/lib/python*/site-packages/langflow" ]; then
    echo "正在安装 Python 依赖包（这可能需要几分钟）..."
    echo ""
    pip install -e .

    if [ $? -ne 0 ]; then
        echo ""
        echo "[错误] 依赖安装失败，请检查网络连接"
        echo "如需重试，请重新运行此脚本"
        exit 1
    fi

    echo ""
    echo "✓ Python 依赖包安装完成"
else
    echo "✓ Python 依赖包已安装"
fi
echo ""

# 步骤 5: 安装前端依赖并构建
echo "[5/6] 检查前端依赖..."
cd src/frontend

if [ ! -d "node_modules" ]; then
    echo "正在安装前端依赖包（这可能需要几分钟）..."
    echo ""
    npm install

    if [ $? -ne 0 ]; then
        echo ""
        echo "[错误] 前端依赖安装失败"
        cd ../..
        exit 1
    fi

    echo ""
    echo "✓ 前端依赖包安装完成"
else
    echo "✓ 前端依赖包已安装"
fi
echo ""

echo "正在构建前端..."
echo ""
npm run build

if [ $? -ne 0 ]; then
    echo ""
    echo "[错误] 前端构建失败"
    cd ../..
    exit 1
fi

echo ""
echo "✓ 前端构建完成"
cd ../..
echo ""

# 步骤 6: 启动服务
echo "[6/6] 准备启动服务..."
echo ""

# 设置环境变量
export LANGFLOW_SKIP_AUTH_AUTO_LOGIN=true
export LANGFLOW_AUTO_LOGIN=true
export LANGFLOW_COMPONENTS_PATH="$(pwd)/src/lfx/src/lfx/components"
export PYTHONPATH="$(pwd)/src/backend/base:$(pwd)/src/lfx/src"
export LFX_DEV=1

echo "环境变量配置:"
echo "  LANGFLOW_COMPONENTS_PATH=$LANGFLOW_COMPONENTS_PATH"
echo "  PYTHONPATH=$PYTHONPATH"
echo "  LFX_DEV=$LFX_DEV"
echo ""

echo "╔════════════════════════════════════════╗"
echo "║   正在启动 LangFlow 服务...           ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "启动模式: 前台运行（可查看日志）"
echo "访问地址: http://localhost:7860"
echo ""
echo "按 Ctrl+C 可停止服务"
echo ""
echo "========================================"
echo ""

# 启动服务
cd src/backend/base
python -m langflow run --host 0.0.0.0 --port 7860

cd ../..
echo ""
echo "服务已停止"
