@echo off
echo ========================================
echo    Langflow 自定义版本 - 快速启动
echo ========================================
echo.

REM 检查容器是否已存在
docker ps -a | findstr langflow-test >nul
if %errorlevel%==0 (
    echo [1/3] 停止旧容器...
    docker stop langflow-test >nul 2>&1
    docker rm langflow-test >nul 2>&1
    echo     旧容器已删除
)

echo [2/3] 启动新容器...
docker run -d --name langflow-test -p 7860:7860 ^
  -e LANGFLOW_SUPERUSER=admin ^
  -e LANGFLOW_SUPERUSER_PASSWORD=admin123 ^
  -e LANGFLOW_SKIP_AUTH_AUTO_LOGIN=true ^
  akcow/langflow-custom:latest

if %errorlevel%==0 (
    echo     容器启动成功
) else (
    echo     容器启动失败!
    pause
    exit /b 1
)

echo [3/3] 等待服务就绪...
timeout /t 10 /nobreak >nul

REM 检查服务状态
curl -s http://localhost:7860/health >nul 2>&1
if %errorlevel%==0 (
    echo.
    echo ========================================
    echo       启动成功!
    echo ========================================
    echo.
    echo 访问地址: http://localhost:7860
    echo 管理员账户:
    echo   用户名: admin
    echo   密码: admin123
    echo.
    echo 容器名称: langflow-test
    echo.
    echo 常用命令:
    echo   查看日志: docker logs -f langflow-test
    echo   停止服务: docker stop langflow-test
    echo   启动服务: docker start langflow-test
    echo.
    echo ========================================
    echo.
) else (
    echo 服务正在启动中,请稍等片刻...
    echo 请稍后访问: http://localhost:7860
)

start http://localhost:7860
