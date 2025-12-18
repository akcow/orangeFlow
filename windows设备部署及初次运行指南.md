# Windows 设备部署及初次运行指南

## 1. 环境与工具准备
- 64 位 Windows 10/11，剩余磁盘 ≥ 40 GB。
- Python 3.10~3.12（建议 3.12，安装时勾选“Add python.exe to PATH”）。
- [uv](https://github.com/astral-sh/uv) 用于解析 `pyproject.toml` 并创建虚拟环境。
- Node.js 20 LTS + npm（用于前端 build）。
- Git、Visual C++ Build Tools（编译部分依赖时会用到）。

快速命令示例：
```powershell
winget install Git.Git
winget install Python.Python.3.12
winget install OpenJS.NodeJS.LTS
pipx install uv
```

## 2. 克隆与目录结构
```powershell
git clone <your-langflow-fork> langflow-pro
cd langflow-pro
```
首次进入仓库后建议运行 `tree /f /a` 熟悉 `src/backend`、`src/frontend`、`src/lfx` 三个 workspace。

## 3. 配置 `.env`
复制模板并根据需要修改：
```powershell
Copy-Item .env.example .env
```
至少确认：
```dotenv
LANGFLOW_SUPERUSER=admin            # 自定义可登录的初始账号
LANGFLOW_SUPERUSER_PASSWORD=Passw0rd!
LANGFLOW_AUTO_LOGIN=true            # 首次体验可直接跳过登录
LANGFLOW_SKIP_AUTH_AUTO_LOGIN=false # 与 start_service.py 默认值相反
LANGFLOW_PORT=7860
LANGFLOW_HOST=0.0.0.0
```
如需接入 Doubao/火山 API，请在 `.env` 中填入 `ARK_API_KEY`、`TS_APP_ID` 等密钥。

## 4. 安装依赖
1. **后端 / LFX**（`uv` 会在 `.venv` 下创建隔离环境）
    ```powershell
    uv sync --frozen --extra postgresql
    ```
2. **前端**（第一次安装使用 `npm ci` 可锁定 `package-lock.json`）
    ```powershell
    cd src/frontend
    npm ci
    cd ../..
    ```

> 如果公司代理阻断下载，可提前配置 `npm config set proxy` 与 `setx UV_HTTP_PROXY`。

## 5. 首次构建
1. 清理旧缓存（可选）
    ```powershell
    python -m scripts.clear_component_cache
    Remove-Item -Recurse -Force src/frontend/.vite, src/frontend/build -ErrorAction SilentlyContinue
    ```
2. 构建前端
    ```powershell
    cd src/frontend
    npm run build
    cd ../..
    ```
3. 将 `build` 结果同步到后端静态目录（`start_service.py` 会自动做，但首次可以人工确认）
    ```powershell
    robocopy src\frontend\build src\backend\base\langflow\frontend /MIR
    ```

## 6. 启动 LangFlow
1. 激活虚拟环境（示例）
    ```powershell
    .\.venv\Scripts\Activate.ps1
    ```
2. 一键启动
    ```powershell
    python start_service.py
    ```
    该脚本会：
    - 清理 `.vite`、`__pycache__`、旧 build；
    - 运行 `npm run build`；
    - 设置 `PYTHONPATH`、`LANGFLOW_COMPONENTS_PATH`、`LFX_DEV`；
    - 执行 `python -m langflow run --host 0.0.0.0 --port 7860`。
3. 浏览器访问 http://localhost:7860 ，若开启自动登录会直接进入工作台；否则使用 `.env` 中的账号密码。

## 7. 日常命令速查
- 仅重新构建前端：
  ```powershell
  cd src/frontend
  npm run build && robocopy build ..\backend\base\langflow\frontend /MIR
  ```
- 后端热更新（跳过重装依赖）：
  ```powershell
  uv run uvicorn --factory langflow.main:create_app --host 0.0.0.0 --port 7860 --reload --env-file .env
  ```
- 停止服务：`Ctrl + C`。

## 8. 常见问题
| 现象 | 处理办法 |
| --- | --- |
| `ModuleNotFoundError: langflow` 或 uv 找不到依赖 | 确认已经执行 `uv sync --frozen`，并使用 `.venv` 中的 python 运行 `start_service.py`。 |
| `npm run build` 卡在下载 | 检查公司代理或切换淘宝镜像：`npm config set registry https://registry.npmmirror.com`。 |
| Docker/WSL 页面停在登录界面 | `.env` 中开启 `LANGFLOW_AUTO_LOGIN=true`，或用 `LANGFLOW_SUPERUSER`/`LANGFLOW_SUPERUSER_PASSWORD` 登录。 |
| 前端白屏 | 删除 `src/frontend/.vite`、`src/frontend/build` 并重新运行 `python start_service.py`，确保 `robocopy` 同步成功。 |
| 端口被占用 | 修改 `.env` 里的 `LANGFLOW_PORT` 并重新启动。 |

## 9. 建议的首测流程
1. 启动后新建空白 Flow，添加 Doubao 组件确保组件索引加载正常；
2. 上传一张图片测 Seedream 推理；
3. 在“设置”>“API Keys”中填写必要密钥；
4. 通过 `Ctrl + Shift + R` 强制刷新浏览器，确认静态资源命中本地 build（`assets/*.js` 返回 200 且为 JavaScript）。

完成以上步骤后，即可进入日常开发或部署流程。
