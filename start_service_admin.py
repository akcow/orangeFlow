#!/usr/bin/env python3
"""OrangeFlow dev launcher (admin login mode, PostgreSQL-first)."""

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
from getpass import getpass

from scripts.clear_component_cache import clear_component_index_cache
from start_service import (
    BACKEND_BASE,
    CACHE_TARGETS,
    COMPONENTS_PATH,
    LFX_SRC,
    _default_postgres_url,
    _ensure_frontend_built,
    _ensure_postgres_ready,
    _ensure_python_dependencies,
    _ensure_uv_environment,
    _is_port_available,
    _load_repo_dotenv,
    _normalize_database_url,
    remove_path,
    run,
)


def build_env(
    *,
    admin_username: str | None,
    admin_password: str | None,
    database_url: str | None = None,
) -> dict[str, str]:
    env = os.environ.copy()
    _load_repo_dotenv(env)
    separator = os.pathsep
    existing_py_path = env.get("PYTHONPATH")
    injected_paths = [str(BACKEND_BASE), str(LFX_SRC)]
    env["PYTHONPATH"] = separator.join(injected_paths + ([existing_py_path] if existing_py_path else []))
    env["LANGFLOW_COMPONENTS_PATH"] = str(COMPONENTS_PATH)
    env["LANGFLOW_AUTO_LOGIN"] = "false"
    env["LANGFLOW_SKIP_AUTH_AUTO_LOGIN"] = env.get("LANGFLOW_SKIP_AUTH_AUTO_LOGIN") or "true"
    if admin_username:
        env["LANGFLOW_SUPERUSER"] = admin_username
    if admin_password:
        env["LANGFLOW_SUPERUSER_PASSWORD"] = admin_password
    env["LANGFLOW_DATABASE_URL"] = _normalize_database_url(
        database_url or env.get("LANGFLOW_DATABASE_URL") or _default_postgres_url(env)
    )
    env["LFX_DEV"] = "1"
    return env


def _resolve_port(host: str, port: int | None) -> int:
    if port is not None:
        if not _is_port_available(host, port):
            raise RuntimeError(f"Port {port} is already in use. Stop the existing process or pick another port.")
        return port

    configured = os.environ.get("LANGFLOW_PORT") or os.environ.get("LANGFLOW_DEV_PORT")
    if configured:
        try:
            cfg_port = int(configured)
        except ValueError as exc:
            raise ValueError(f"Invalid LANGFLOW_PORT/LANGFLOW_DEV_PORT: {configured}") from exc
        if not _is_port_available(host, cfg_port):
            raise RuntimeError(f"Port {cfg_port} is already in use. Stop the existing process or pick another port.")
        return cfg_port

    preferred = 7860
    if _is_port_available(host, preferred):
        return preferred
    for candidate in range(preferred + 1, preferred + 51):
        if _is_port_available(host, candidate):
            print(f"[port] {preferred} is busy; using {candidate} instead (set LANGFLOW_PORT to override).")
            return candidate
    raise RuntimeError(f"No free port found in range {preferred}-{preferred+50}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OrangeFlow dev launcher (admin login mode, PostgreSQL-first).")
    parser.add_argument("--admin-username", default=os.environ.get("LANGFLOW_SUPERUSER") or "admin")
    parser.add_argument("--admin-password", default=os.environ.get("LANGFLOW_SUPERUSER_PASSWORD"))
    parser.add_argument(
        "--database-url",
        default=None,
        help="PostgreSQL connection string override for this session.",
    )
    parser.add_argument(
        "--db-path",
        default=None,
        help="Deprecated. SQLite is no longer supported by start_service_admin.py.",
    )
    parser.add_argument(
        "--reset-db",
        action="store_true",
        help="Deprecated. SQLite reset mode is no longer supported.",
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--skip-frontend", action="store_true", help="Skip npm install/build + sync step.")
    parser.add_argument("--skip-clean", action="store_true", help="Skip cache cleanup step.")
    return parser.parse_args()


def main() -> None:
    _ensure_uv_environment()
    args = parse_args()

    if args.db_path or args.reset_db:
        raise ValueError(
            "start_service_admin.py no longer supports SQLite flags --db-path/--reset-db. "
            "Use PostgreSQL via --database-url or LANGFLOW_DATABASE_URL."
        )

    admin_password = args.admin_password
    if not admin_password:
        admin_password = getpass(f"Set password for superuser '{args.admin_username}': ")
        if not admin_password:
            raise ValueError("Admin password cannot be empty")

    print("OrangeFlow admin-login launcher")
    print("1) clean caches  2) ensure python deps  3) set env  4) ensure postgres  5) ensure frontend  6) run service")

    if not args.skip_clean:
        print("\n[1/6] Cleaning caches and component index...")
        clear_component_index_cache(verbose=True)
        for target in CACHE_TARGETS:
            remove_path(target)
    else:
        print("\n[1/6] Skipping cache cleanup (--skip-clean).")

    print("\n[2/6] Ensuring Python dependencies (uv sync --extra postgresql)...")
    _ensure_python_dependencies()

    env = build_env(
        admin_username=args.admin_username,
        admin_password=admin_password,
        database_url=args.database_url,
    )
    host = args.host
    port = _resolve_port(host, args.port)

    print("\n[3/6] Environment summary:")
    print(f"   LANGFLOW_COMPONENTS_PATH={env['LANGFLOW_COMPONENTS_PATH']}")
    print(f"   PYTHONPATH={env['PYTHONPATH']}")
    print(f"   LFX_DEV={env['LFX_DEV']}")
    print("   LANGFLOW_AUTO_LOGIN=false")
    print(f"   LANGFLOW_SUPERUSER={args.admin_username}")
    print(f"   LANGFLOW_DATABASE_URL={env['LANGFLOW_DATABASE_URL']}")

    print("\n[4/6] Ensuring PostgreSQL is ready...")
    _ensure_postgres_ready(env)

    if not args.skip_frontend:
        print("\n[5/6] Ensuring frontend dependencies + build...")
        _ensure_frontend_built(env, build_mode="admin")
    else:
        print("\n[5/6] Skipping frontend build (--skip-frontend).")

    print("\n[6/6] Starting OrangeFlow (Ctrl+C to stop)...")
    print(f"   URL (localhost): http://localhost:{port}")
    print(f"   URL (127.0.0.1): http://127.0.0.1:{port}")
    print(f"   Admin login: http://127.0.0.1:{port}/login/admin?force=1")

    run([sys.executable, "-m", "langflow", "run", "--host", host, "--port", str(port)], cwd=BACKEND_BASE, env=env)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nServer stopped")
    except subprocess.CalledProcessError as exc:
        print(f"\nCommand failed: {exc}")
        sys.exit(exc.returncode)
    except Exception as exc:  # noqa: BLE001
        print(f"\nFailed to start OrangeFlow: {exc}")
        sys.exit(1)
