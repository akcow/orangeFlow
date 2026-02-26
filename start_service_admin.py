# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""LangFlow dev launcher (admin login mode).

This is a variant of `start_service.py` that:
- disables AUTO_LOGIN so the UI shows the login screen
- ensures a superuser exists (via LANGFLOW_SUPERUSER / LANGFLOW_SUPERUSER_PASSWORD)
- keeps the rest of the dev workflow (uv sync, frontend build, cache cleanup)

Usage:
  python start_service_admin.py --admin-username admin
  python start_service_admin.py --admin-username admin --admin-password 123456

Notes:
  - We intentionally do NOT pass `--env-file .env` when starting `langflow run`.
    Langflow will still auto-load a nearby `.env`, but without overriding already-set
    environment variables, which prevents accidental overrides of LANGFLOW_AUTO_LOGIN.
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
from getpass import getpass
from pathlib import Path

from scripts.clear_component_cache import clear_component_index_cache

REPO_ROOT = Path(__file__).resolve().parent
RUNTIME_DATA_DIR = REPO_ROOT / "data" / "runtime"
SHARED_DEV_DB_PATH = RUNTIME_DATA_DIR / "langflow_shared.db"
LEGACY_DB_CANDIDATES = [
    REPO_ROOT / "src" / "lfx" / "src" / "lfx" / "langflow.db",
]
BACKEND_BASE = REPO_ROOT / "src" / "backend" / "base"
FRONTEND_DIR = REPO_ROOT / "src" / "frontend"
FRONTEND_BUILD_DIR = FRONTEND_DIR / "build"
BACKEND_FRONTEND_DIR = BACKEND_BASE / "langflow" / "frontend"
LFX_SRC = REPO_ROOT / "src" / "lfx" / "src"
COMPONENTS_PATH = LFX_SRC / "lfx" / "components"

CACHE_TARGETS = [
    FRONTEND_DIR / ".vite",
    FRONTEND_DIR / "node_modules" / ".vite",
    BACKEND_BASE / "__pycache__",
    BACKEND_BASE / "langflow" / "__pycache__",
    LFX_SRC / "lfx" / "__pycache__",
]


def _resolve_command(cmd: list[str]) -> list[str]:
    """On Windows, prefer npm.cmd/bat/exe if bare command is missing."""
    if os.name != "nt":
        return cmd
    executable = shutil.which(cmd[0])
    if executable:
        return [executable, *cmd[1:]]
    for ext in (".cmd", ".bat", ".exe"):
        executable = shutil.which(cmd[0] + ext)
        if executable:
            return [executable, *cmd[1:]]
    comspec = os.environ.get("COMSPEC", r"C:\Windows\System32\cmd.exe")
    return [comspec, "/c", *cmd]


def run(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    location = cwd if cwd else REPO_ROOT
    cmd = _resolve_command(cmd)
    printable = " ".join(cmd)
    print(f"\n-> {printable}\n   cwd={location}")
    subprocess.run(cmd, cwd=location, env=env, check=True)


def remove_path(path: Path) -> None:
    if not path.exists():
        return
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()
    print(f"[cache] removed {path.relative_to(REPO_ROOT)}")


def copy_frontend_build() -> None:
    if not FRONTEND_BUILD_DIR.exists():
        raise FileNotFoundError("frontend build output missing, did npm run build succeed?")
    if BACKEND_FRONTEND_DIR.exists():
        shutil.rmtree(BACKEND_FRONTEND_DIR)
    shutil.copytree(FRONTEND_BUILD_DIR, BACKEND_FRONTEND_DIR)
    print(f"[copy] synced build to {BACKEND_FRONTEND_DIR.relative_to(REPO_ROOT)}")


def _ensure_shared_default_db() -> Path:
    """Return the shared dev DB path and seed it from legacy locations when needed."""
    RUNTIME_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SHARED_DEV_DB_PATH.exists():
        return SHARED_DEV_DB_PATH

    for legacy_path in LEGACY_DB_CANDIDATES:
        if not legacy_path.exists():
            continue
        try:
            shutil.copy2(legacy_path, SHARED_DEV_DB_PATH)
            for suffix in ("-shm", "-wal"):
                legacy_sidecar = legacy_path.with_name(legacy_path.name + suffix)
                new_sidecar = SHARED_DEV_DB_PATH.with_name(SHARED_DEV_DB_PATH.name + suffix)
                if legacy_sidecar.exists():
                    shutil.copy2(legacy_sidecar, new_sidecar)
            print(
                "[db] initialized shared dev database from legacy path: "
                f"{legacy_path.relative_to(REPO_ROOT)} -> {SHARED_DEV_DB_PATH.relative_to(REPO_ROOT)}"
            )
            break
        except OSError as exc:
            print(
                "[db] warning: failed to seed shared DB from "
                f"{legacy_path.relative_to(REPO_ROOT)}: {exc}"
            )
    return SHARED_DEV_DB_PATH


def _local_venv_python() -> Path | None:
    venv_root = REPO_ROOT / ".venv"
    candidate = venv_root / ("Scripts" if os.name == "nt" else "bin") / (
        "python.exe" if os.name == "nt" else "python"
    )
    return candidate if candidate.exists() else None


def _ensure_uv_environment() -> None:
    if os.environ.get("LANGFLOW_START_SERVICE_REEXEC") == "1":
        return

    exe = Path(sys.executable).resolve()
    if ".venv" in exe.parts:
        return

    venv_python = _local_venv_python()
    if venv_python is not None:
        env = os.environ.copy()
        env["LANGFLOW_START_SERVICE_REEXEC"] = "1"
        cmd = [str(venv_python), str(Path(__file__).resolve()), *sys.argv[1:]]
        subprocess.run(cmd, cwd=REPO_ROOT, env=env, check=True)
        raise SystemExit(0)

    if shutil.which("uv"):
        env = os.environ.copy()
        env["LANGFLOW_START_SERVICE_REEXEC"] = "1"
        cmd = ["uv", "run", "python", str(Path(__file__).resolve()), *sys.argv[1:]]
        subprocess.run(_resolve_command(cmd), cwd=REPO_ROOT, env=env, check=True)
        raise SystemExit(0)


def _ensure_python_dependencies() -> None:
    if os.environ.get("LANGFLOW_SKIP_UV_SYNC") == "1":
        return
    if not shutil.which("uv"):
        return
    run(["uv", "sync"], cwd=REPO_ROOT)


def _ensure_frontend_built(env: dict[str, str]) -> None:
    package_json = FRONTEND_DIR / "package.json"
    if not package_json.exists():
        raise FileNotFoundError(f"Missing frontend package.json at {package_json}")

    if "NODE_OPTIONS" not in env:
        env["NODE_OPTIONS"] = "--max-old-space-size=8192"

    node_modules = FRONTEND_DIR / "node_modules"
    lockfile = FRONTEND_DIR / "package-lock.json"

    if not node_modules.exists():
        if lockfile.exists():
            run(["npm", "ci"], cwd=FRONTEND_DIR, env=env)
        else:
            run(["npm", "install"], cwd=FRONTEND_DIR, env=env)

    def newest_mtime(paths: list[Path]) -> float:
        mtimes: list[float] = []
        for p in paths:
            if not p.exists():
                continue
            if p.is_file():
                mtimes.append(p.stat().st_mtime)
                continue
            for child in p.rglob("*"):
                if child.is_file():
                    mtimes.append(child.stat().st_mtime)
        return max(mtimes) if mtimes else 0.0

    frontend_sources = [
        FRONTEND_DIR / "src",
        FRONTEND_DIR / "public",
        FRONTEND_DIR / "index.html",
        FRONTEND_DIR / "vite.config.ts",
        FRONTEND_DIR / "vite.config.js",
        FRONTEND_DIR / "package.json",
        FRONTEND_DIR / "package-lock.json",
    ]
    source_mtime = newest_mtime(frontend_sources)

    # This launcher relies on a frontend build that was produced with LANGFLOW_AUTO_LOGIN=false.
    # If the build was previously produced by a different launcher (e.g. auto-login dev mode),
    # source mtimes won't change but behavior will. Keep a tiny stamp file to force rebuild when needed.
    stamp = FRONTEND_BUILD_DIR / ".langflow_build_mode"
    want_stamp = "admin"
    have_stamp = ""
    try:
        have_stamp = stamp.read_text(encoding="utf-8").strip() if stamp.exists() else ""
    except Exception:
        have_stamp = ""

    force_build = have_stamp != want_stamp

    if (not FRONTEND_BUILD_DIR.exists()) or force_build:
        run(["npm", "run", "build"], cwd=FRONTEND_DIR, env=env)
    else:
        build_mtime = newest_mtime([FRONTEND_BUILD_DIR])
        if source_mtime > build_mtime:
            run(["npm", "run", "build"], cwd=FRONTEND_DIR, env=env)

    # Refresh stamp after build (or after a skip where it already matches).
    FRONTEND_BUILD_DIR.mkdir(parents=True, exist_ok=True)
    try:
        stamp.write_text(want_stamp + "\n", encoding="utf-8")
    except Exception:
        # Best-effort; don't fail startup due to stamp write issues.
        pass

    if not BACKEND_FRONTEND_DIR.exists():
        copy_frontend_build()
        return
    backend_mtime = newest_mtime([BACKEND_FRONTEND_DIR])
    build_mtime = newest_mtime([FRONTEND_BUILD_DIR])
    if build_mtime > backend_mtime:
        copy_frontend_build()


def build_env(*, admin_username: str | None, admin_password: str | None) -> dict[str, str]:
    env = os.environ.copy()
    separator = os.pathsep
    existing_py_path = env.get("PYTHONPATH")
    injected_paths = [str(BACKEND_BASE), str(LFX_SRC)]
    env["PYTHONPATH"] = separator.join(injected_paths + ([existing_py_path] if existing_py_path else []))
    env["LANGFLOW_COMPONENTS_PATH"] = str(COMPONENTS_PATH)

    # Admin login mode: disable auto login.
    env["LANGFLOW_AUTO_LOGIN"] = "false"

    # Keeps the legacy auto-login check from blocking startup in some environments.
    env["LANGFLOW_SKIP_AUTH_AUTO_LOGIN"] = env.get("LANGFLOW_SKIP_AUTH_AUTO_LOGIN") or "true"

    # Ensure a superuser exists on boot (Langflow will create/update as needed).
    if admin_username:
        env["LANGFLOW_SUPERUSER"] = admin_username
    if admin_password:
        env["LANGFLOW_SUPERUSER_PASSWORD"] = admin_password

    # Force dev mode so component templates are rebuilt from current source.
    env["LFX_DEV"] = "1"
    return env


def _is_port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
        return True


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
    for p in range(preferred + 1, preferred + 51):
        if _is_port_available(host, p):
            print(f"[port] {preferred} is busy; using {p} instead (set LANGFLOW_PORT to override).")
            return p
    raise RuntimeError(f"No free port found in range {preferred}-{preferred+50}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="LangFlow dev launcher (admin login mode).")
    parser.add_argument("--admin-username", default=os.environ.get("LANGFLOW_SUPERUSER") or "admin")
    parser.add_argument("--admin-password", default=os.environ.get("LANGFLOW_SUPERUSER_PASSWORD"))
    parser.add_argument(
        "--db-path",
        default=None,
        help=(
            "SQLite DB path for this dev session. "
            "If omitted, defaults to ./data/runtime/langflow_shared.db."
        ),
    )
    parser.add_argument(
        "--reset-db",
        action="store_true",
        help="Delete --db-path before starting (destructive).",
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--skip-frontend", action="store_true", help="Skip npm install/build + sync step.")
    parser.add_argument("--skip-clean", action="store_true", help="Skip cache cleanup step.")
    return parser.parse_args()


def main() -> None:
    _ensure_uv_environment()
    args = parse_args()

    admin_password = args.admin_password
    if not admin_password:
        # Keep it interactive to avoid hardcoding credentials in the repo.
        admin_password = getpass(f"Set password for superuser '{args.admin_username}': ")
        if not admin_password:
            raise ValueError("Admin password cannot be empty")

    print("LangFlow admin-login launcher")
    print("1) clean caches  2) ensure python deps  3) ensure frontend  4) set env  5) run service")

    if not args.skip_clean:
        print("\n[1/5] Cleaning caches and component index...")
        clear_component_index_cache(verbose=True)
        for target in CACHE_TARGETS:
            remove_path(target)
    else:
        print("\n[1/5] Skipping cache cleanup (--skip-clean).")

    print("\n[2/5] Ensuring Python dependencies (uv sync)...")
    _ensure_python_dependencies()

    env = build_env(admin_username=args.admin_username, admin_password=admin_password)
    host = args.host
    port = _resolve_port(host, args.port)

    db_path = (
        Path(args.db_path).expanduser().resolve()
        if args.db_path
        else _ensure_shared_default_db().resolve()
    )
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if args.reset_db and db_path.exists():
        db_path.unlink()
        print(f"[db] removed {db_path}")
    db_url = f"sqlite:///{db_path.as_posix()}"
    env["LANGFLOW_DATABASE_URL"] = db_url

    if not args.skip_frontend:
        print("\n[3/5] Ensuring frontend dependencies + build...")
        _ensure_frontend_built(env)
    else:
        print("\n[3/5] Skipping frontend build (--skip-frontend).")

    print("\n[4/5] Environment summary:")
    print(f"   LANGFLOW_COMPONENTS_PATH={env['LANGFLOW_COMPONENTS_PATH']}")
    print(f"   PYTHONPATH={env['PYTHONPATH']}")
    print(f"   LFX_DEV={env['LFX_DEV']}")
    print("   LANGFLOW_AUTO_LOGIN=false")
    print(f"   LANGFLOW_SUPERUSER={args.admin_username}")
    print(f"   LANGFLOW_DATABASE_URL={db_url}")

    print("\n[5/5] Starting LangFlow (Ctrl+C to stop)...")
    print(f"   URL (localhost): http://localhost:{port}")
    print(f"   URL (127.0.0.1): http://127.0.0.1:{port}")
    print(f"   Admin login: http://127.0.0.1:{port}/login/admin?force=1")

    # Do not pass `--env-file`. Langflow will best-effort load `.env` without overriding our env by default.
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
        print(f"\nFailed to start LangFlow: {exc}")
        sys.exit(1)
