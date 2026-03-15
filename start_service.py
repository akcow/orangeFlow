# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""One-stop LangFlow dev launcher (see start-langflow-dev.md)."""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import time
import importlib
from pathlib import Path
from urllib.parse import quote

from scripts.clear_component_cache import clear_component_index_cache

REPO_ROOT = Path(__file__).resolve().parent
BACKEND_BASE = REPO_ROOT / "src" / "backend" / "base"
FRONTEND_DIR = REPO_ROOT / "src" / "frontend"
FRONTEND_BUILD_DIR = FRONTEND_DIR / "build"
BACKEND_FRONTEND_DIR = BACKEND_BASE / "langflow" / "frontend"
LFX_SRC = REPO_ROOT / "src" / "lfx" / "src"
COMPONENTS_PATH = LFX_SRC / "lfx" / "components"
LOCAL_POSTGRES_COMPOSE_FILE = REPO_ROOT / "docker" / "postgres.docker-compose.yml"
UV_CACHE_DIR = REPO_ROOT / ".uv-cache"
DEFAULT_POSTGRES_USER = "langflow"
DEFAULT_POSTGRES_PASSWORD = "langflow"
DEFAULT_POSTGRES_DB = "langflow"
DEFAULT_POSTGRES_HOST = "127.0.0.1"
DEFAULT_POSTGRES_PORT = "5433"

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
    # Last resort use COMSPEC /c so PATHEXT rules apply
    comspec = os.environ.get("COMSPEC", r"C:\Windows\System32\cmd.exe")
    return [comspec, "/c", *cmd]


def run(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    location = cwd if cwd else REPO_ROOT
    cmd = _resolve_command(cmd)
    printable = " ".join(cmd)
    print(f"\n-> {printable}\n   cwd={location}")
    subprocess.run(cmd, cwd=location, env=env, check=True)


def _uv_env(base_env: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(base_env or os.environ.copy())
    env.setdefault("UV_CACHE_DIR", str(UV_CACHE_DIR))
    UV_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return env


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


def _local_venv_python() -> Path | None:
    venv_root = REPO_ROOT / ".venv"
    candidate = venv_root / ("Scripts" if os.name == "nt" else "bin") / (
        "python.exe" if os.name == "nt" else "python"
    )
    return candidate if candidate.exists() else None


def _ensure_uv_environment() -> None:
    """Ensure we run inside the repo's uv environment when available.

    NOTE: Re-exec to .venv / uv is disabled. The script now always runs
    with whatever Python interpreter invoked it (e.g. the active conda env).
    """
    return


def _ensure_uv_installed() -> None:
    """Ensure uv is installed, auto-install if missing.

    uv is required for dependency management in this project.
    This function will automatically install uv if it's not found.
    """
    if shutil.which("uv"):
        return

    print("\n[uv] uv not found, attempting to install...")

    # Use the official install script
    # On Windows, we use PowerShell to run the installer
    if os.name == "nt":
        # Windows: use PowerShell to install uv
        install_cmd = [
            "powershell",
            "-ExecutionPolicy",
            "Bypass",
            "-c",
            "irm https://astral.sh/uv/install.ps1 | iex",
        ]
    else:
        # Unix: use curl and sh
        install_cmd = ["curl", "-LsSf", "https://astral.sh/uv/install.sh", "|", "sh"]
        # Use shell=True for pipe to work
        subprocess.run(" ".join(install_cmd), shell=True, cwd=REPO_ROOT, check=True)
        return

    try:
        subprocess.run(_resolve_command(install_cmd), cwd=REPO_ROOT, check=True)
        print("[uv] uv installed successfully.")
    except subprocess.CalledProcessError as exc:
        print(f"\n[error] Failed to install uv automatically: {exc}")
        print("\nPlease install uv manually:")
        if os.name == "nt":
            print("  powershell -ExecutionPolicy Bypass -c 'irm https://astral.sh/uv/install.ps1 | iex'")
        else:
            print("  curl -LsSf https://astral.sh/uv/install.sh | sh")
        print("\nOr visit: https://docs.astral.sh/uv/getting-started/installation/")
        raise SystemExit(1) from exc

    # Verify installation succeeded
    if not shutil.which("uv"):
        print("\n[error] uv installation appeared to succeed but 'uv' command not found.")
        print("You may need to restart your terminal or add uv to your PATH.")
        raise SystemExit(1)


def _ensure_python_dependencies() -> None:
    """Make sure Python deps are installed before starting the backend.

    This repo uses uv workspaces. If a developer has a .venv but hasn't run `uv sync`,
    imports can fail at runtime (e.g. `from jose import JWTError`).
    """
    if os.environ.get("LANGFLOW_SKIP_UV_SYNC") == "1":
        return

    # Auto-install uv if missing, then run uv sync
    _ensure_uv_installed()

    # `uv sync` is idempotent and fast when already up-to-date.
    # Always install the PostgreSQL extra so the runtime has a working driver.
    try:
        run(["uv", "sync", "--extra", "postgresql"], cwd=REPO_ROOT, env=_uv_env())
    except subprocess.CalledProcessError:
        required_modules = ("psycopg", "dotenv", "fastapi", "uvicorn")
        missing = []
        for module_name in required_modules:
            try:
                importlib.import_module(module_name)
            except Exception:
                missing.append(module_name)
        if missing:
            raise
        print(
            "[warn] uv sync failed, but the current environment already contains the required runtime packages. "
            "Continuing with the existing .venv."
        )


def _load_repo_dotenv(env: dict[str, str]) -> None:
    env_file = REPO_ROOT / ".env"
    if not env_file.exists():
        return

    from dotenv import dotenv_values

    for key, value in dotenv_values(env_file).items():
        if value is None or key in env:
            continue
        env[key] = value


def _default_postgres_url(env: dict[str, str]) -> str:
    user = env.get("POSTGRES_USER") or DEFAULT_POSTGRES_USER
    password = env.get("POSTGRES_PASSWORD") or DEFAULT_POSTGRES_PASSWORD
    db_name = env.get("POSTGRES_DB") or DEFAULT_POSTGRES_DB
    host = env.get("POSTGRES_HOST") or DEFAULT_POSTGRES_HOST
    port = env.get("POSTGRES_PORT") or DEFAULT_POSTGRES_PORT
    return (
        f"postgresql://{quote(user)}:{quote(password)}@{host}:{port}/{quote(db_name)}"
    )


def _normalize_database_url(url: str) -> str:
    normalized = url.strip().strip("'").strip('"')
    if "://" not in normalized:
        raise ValueError(
            "LANGFLOW_DATABASE_URL is invalid. Expected a full PostgreSQL URL like "
            "'postgresql://langflow:password@127.0.0.1:5433/langflow'."
        )

    driver = normalized.split("://", maxsplit=1)[0].lower()
    if driver.startswith("sqlite"):
        raise ValueError(
            "start_service.py no longer supports SQLite defaults. "
            "Set LANGFLOW_DATABASE_URL to PostgreSQL, or use the bundled local PostgreSQL defaults."
        )
    if not (driver.startswith("postgresql") or driver.startswith("postgres")):
        raise ValueError(
            "start_service.py requires PostgreSQL. "
            f"Unsupported database driver: {driver!r}."
        )
    return normalized


def _psycopg_connection_url(url: str) -> str:
    normalized = _normalize_database_url(url)
    driver, rest = normalized.split("://", maxsplit=1)
    driver = driver.lower()
    if driver in {"postgres", "postgresql", "postgresql+psycopg", "postgresql+psycopg2"}:
        return f"postgresql://{rest}"
    if driver == "postgresql+psycopg2binary":
        return f"postgresql://{rest}"
    return normalized


def _connect_postgres(database_url: str) -> None:
    import psycopg

    with psycopg.connect(_psycopg_connection_url(database_url), connect_timeout=3) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()


def _start_local_postgres(env: dict[str, str]) -> None:
    if not LOCAL_POSTGRES_COMPOSE_FILE.exists():
        raise FileNotFoundError(
            f"Missing local PostgreSQL compose file: {LOCAL_POSTGRES_COMPOSE_FILE}"
        )
    if not shutil.which("docker"):
        raise RuntimeError(
            "Local PostgreSQL is not reachable and Docker is not installed. "
            "Install Docker Desktop, or set LANGFLOW_DATABASE_URL to an existing PostgreSQL instance."
        )

    print(
        "[db] Local PostgreSQL not reachable. Bootstrapping "
        f"{LOCAL_POSTGRES_COMPOSE_FILE.relative_to(REPO_ROOT)} ..."
    )
    run(
        ["docker", "compose", "-f", str(LOCAL_POSTGRES_COMPOSE_FILE), "up", "-d", "postgres"],
        cwd=REPO_ROOT,
        env=env,
    )


def _ensure_postgres_ready(env: dict[str, str]) -> None:
    database_url = _normalize_database_url(env["LANGFLOW_DATABASE_URL"])
    default_local_url = _default_postgres_url(env)
    env["LANGFLOW_DATABASE_URL"] = database_url

    try:
        _connect_postgres(database_url)
        print("[db] PostgreSQL connection OK.")
        return
    except Exception as exc:
        if database_url != default_local_url:
            raise RuntimeError(
                "Failed to connect to PostgreSQL using LANGFLOW_DATABASE_URL. "
                f"Please verify the database is reachable before starting Langflow.\n"
                f"Database URL: {database_url}\n"
                f"Original error: {exc}"
            ) from exc

    _start_local_postgres(env)

    last_error: Exception | None = None
    for _attempt in range(20):
        try:
            _connect_postgres(database_url)
            print("[db] Local PostgreSQL is ready.")
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(2)

    raise RuntimeError(
        "Local PostgreSQL failed to become ready after Docker bootstrap. "
        f"Please inspect `docker compose -f {LOCAL_POSTGRES_COMPOSE_FILE} logs postgres`.\n"
        f"Database URL: {database_url}\n"
        f"Last error: {last_error}"
    )


def _ensure_frontend_built(env: dict[str, str], *, build_mode: str = "dev") -> None:
    """Build and sync the frontend only when needed."""
    package_json = FRONTEND_DIR / "package.json"
    if not package_json.exists():
        raise FileNotFoundError(f"Missing frontend package.json at {package_json}")

    if "NODE_OPTIONS" not in env:
        env["NODE_OPTIONS"] = "--max-old-space-size=8192"

    # Vite/Rollup native builds have been observed to crash on some Windows setups with very new Node.js versions.
    # Provide a helpful hint early so failures are actionable.
    try:
        node_version = subprocess.check_output(_resolve_command(["node", "-v"]), text=True).strip()
        if node_version.startswith("v"):
            major = int(node_version[1:].split(".", 1)[0])
            if major >= 23:
                print(
                    f"[warn] Detected Node.js {node_version}. If `npm run build` crashes on Windows "
                    "with exit code -1073740791/3221226505, use Node.js 20 LTS or 22 LTS."
                )
    except Exception:
        pass

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
        FRONTEND_DIR / "vite.config.mts",
        FRONTEND_DIR / "vite.config.ts",
        FRONTEND_DIR / "vite.config.js",
        FRONTEND_DIR / "package.json",
        FRONTEND_DIR / "package-lock.json",
    ]
    source_mtime = newest_mtime(frontend_sources)

    stamp = FRONTEND_BUILD_DIR / ".langflow_build_mode"
    want_stamp = build_mode
    have_stamp = ""
    try:
        have_stamp = stamp.read_text(encoding="utf-8").strip() if stamp.exists() else ""
    except Exception:
        have_stamp = ""
    force_build = have_stamp != want_stamp

    build_exists = FRONTEND_BUILD_DIR.exists()
    build_mtime = newest_mtime([FRONTEND_BUILD_DIR]) if build_exists else 0.0
    needs_build = (not build_exists) or force_build or (source_mtime > build_mtime)

    if needs_build:
        try:
            run(["npm", "run", "build"], cwd=FRONTEND_DIR, env=env)
        except subprocess.CalledProcessError:
            if not FRONTEND_BUILD_DIR.exists():
                raise
            print(
                "[warn] Frontend build failed, but an existing frontend build is available. "
                "Reusing the last successful build."
            )

    FRONTEND_BUILD_DIR.mkdir(parents=True, exist_ok=True)
    try:
        stamp.write_text(want_stamp + "\n", encoding="utf-8")
    except Exception:
        pass

    # Always sync build into backend folder when it is missing or older than the build output.
    if not BACKEND_FRONTEND_DIR.exists():
        copy_frontend_build()
        return
    backend_mtime = newest_mtime([BACKEND_FRONTEND_DIR])
    build_mtime = newest_mtime([FRONTEND_BUILD_DIR])
    if build_mtime > backend_mtime:
        copy_frontend_build()


def build_env() -> dict[str, str]:
    env = os.environ.copy()
    _load_repo_dotenv(env)
    separator = os.pathsep
    existing_py_path = env.get("PYTHONPATH")
    injected_paths = [str(BACKEND_BASE), str(LFX_SRC)]
    env["PYTHONPATH"] = separator.join(
        injected_paths + ([existing_py_path] if existing_py_path else [])
    )
    env["LANGFLOW_COMPONENTS_PATH"] = str(COMPONENTS_PATH)
    env["LANGFLOW_SKIP_AUTH_AUTO_LOGIN"] = "true"
    # Always auto-login during local development so the UI skips the sign-in screen.
    env["LANGFLOW_AUTO_LOGIN"] = "true"
    # start_service.py is now PostgreSQL-first and never silently falls back to SQLite.
    env["LANGFLOW_DATABASE_URL"] = _normalize_database_url(
        env.get("LANGFLOW_DATABASE_URL") or _default_postgres_url(env)
    )
    # Force dev mode so component templates are rebuilt from current source (avoids stale prebuilt indexes).
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


def _resolve_port(host: str) -> int:
    configured = os.environ.get("LANGFLOW_PORT") or os.environ.get("LANGFLOW_DEV_PORT")
    if configured:
        try:
            port = int(configured)
        except ValueError as exc:
            raise ValueError(f"Invalid LANGFLOW_PORT/LANGFLOW_DEV_PORT: {configured}") from exc
        if not _is_port_available(host, port):
            raise RuntimeError(f"Port {port} is already in use. Stop the existing process or pick another port.")
        return port

    preferred = 7860
    if _is_port_available(host, preferred):
        return preferred

    for port in range(preferred + 1, preferred + 51):
        if _is_port_available(host, port):
            print(f"[port] {preferred} is busy; using {port} instead (set LANGFLOW_PORT to override).")
            return port

    raise RuntimeError(f"No free port found in range {preferred}-{preferred+50}.")


def main() -> None:
    _ensure_uv_environment()

    print("LangFlow dev launcher")
    print("1) clean caches  2) ensure python deps  3) set env  4) ensure postgres  5) ensure frontend  6) run service")

    print("\n[1/6] Cleaning caches and component index...")
    clear_component_index_cache(verbose=True)
    for target in CACHE_TARGETS:
        remove_path(target)

    print("\n[2/6] Ensuring Python dependencies (uv sync --extra postgresql)...")
    _ensure_python_dependencies()

    env = build_env()
    print("\n[3/6] Environment summary:")
    print(f"   LANGFLOW_COMPONENTS_PATH={env['LANGFLOW_COMPONENTS_PATH']}")
    print(f"   PYTHONPATH={env['PYTHONPATH']}")
    print(f"   LANGFLOW_DATABASE_URL={env['LANGFLOW_DATABASE_URL']}")
    print(f"   LFX_DEV={env['LFX_DEV']}")

    print("\n[4/6] Ensuring PostgreSQL is ready...")
    _ensure_postgres_ready(env)

    print("\n[5/6] Ensuring frontend dependencies + build...")
    _ensure_frontend_built(env)

    print("\n[6/6] Starting LangFlow (Ctrl+C to stop)...")
    host = "0.0.0.0"
    port = _resolve_port(host)
    print(f"   URL: http://localhost:{port}")

    run(
        [sys.executable, "-m", "langflow", "run", "--host", host, "--port", str(port)],
        cwd=BACKEND_BASE,
        env=env,
    )


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
