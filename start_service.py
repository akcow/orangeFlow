# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""One-stop LangFlow dev launcher (see start-langflow-dev.md)."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import socket
from pathlib import Path

from scripts.clear_component_cache import clear_component_index_cache

REPO_ROOT = Path(__file__).resolve().parent
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
    # Last resort use COMSPEC /c so PATHEXT rules apply
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


def _local_venv_python() -> Path | None:
    venv_root = REPO_ROOT / ".venv"
    candidate = venv_root / ("Scripts" if os.name == "nt" else "bin") / (
        "python.exe" if os.name == "nt" else "python"
    )
    return candidate if candidate.exists() else None


def _ensure_uv_environment() -> None:
    """Ensure we run inside the repo's uv environment when available."""
    if os.environ.get("LANGFLOW_START_SERVICE_REEXEC") == "1":
        return

    # If we already run from .venv, keep going.
    exe = Path(sys.executable).resolve()
    if ".venv" in exe.parts:
        return

    # Prefer local .venv when it exists so the script uses the project's venv.
    venv_python = _local_venv_python()
    if venv_python is not None:
        env = os.environ.copy()
        env["LANGFLOW_START_SERVICE_REEXEC"] = "1"
        cmd = [str(venv_python), str(Path(__file__).resolve()), *sys.argv[1:]]
        subprocess.run(cmd, cwd=REPO_ROOT, env=env, check=True)
        raise SystemExit(0)

    # If uv is available, re-exec via uv so dependencies resolve consistently.
    if shutil.which("uv"):
        env = os.environ.copy()
        env["LANGFLOW_START_SERVICE_REEXEC"] = "1"
        cmd = ["uv", "run", "python", str(Path(__file__).resolve()), *sys.argv[1:]]
        subprocess.run(_resolve_command(cmd), cwd=REPO_ROOT, env=env, check=True)
        raise SystemExit(0)


def _ensure_python_dependencies() -> None:
    """Make sure Python deps are installed before starting the backend.

    This repo uses uv workspaces. If a developer has a .venv but hasn't run `uv sync`,
    imports can fail at runtime (e.g. `from jose import JWTError`).
    """
    if os.environ.get("LANGFLOW_SKIP_UV_SYNC") == "1":
        return

    # If uv isn't available, we can't auto-install; let the backend fail with a clear import error.
    if not shutil.which("uv"):
        return

    # `uv sync` is idempotent and fast when already up-to-date.
    run(["uv", "sync"], cwd=REPO_ROOT)


def _ensure_frontend_built(env: dict[str, str]) -> None:
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
        FRONTEND_DIR / "vite.config.ts",
        FRONTEND_DIR / "vite.config.js",
        FRONTEND_DIR / "package.json",
        FRONTEND_DIR / "package-lock.json",
    ]
    source_mtime = newest_mtime(frontend_sources)

    # Build if build output is missing, or source is newer than the build output.
    if not FRONTEND_BUILD_DIR.exists():
        run(["npm", "run", "build"], cwd=FRONTEND_DIR, env=env)
    else:
        build_mtime = newest_mtime([FRONTEND_BUILD_DIR])
        if source_mtime > build_mtime:
            run(["npm", "run", "build"], cwd=FRONTEND_DIR, env=env)

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
    print("1) clean caches  2) ensure python deps  3) ensure frontend  4) set env  5) run service")

    print("\n[1/5] Cleaning caches and component index...")
    clear_component_index_cache(verbose=True)
    for target in CACHE_TARGETS:
        remove_path(target)

    print("\n[2/5] Ensuring Python dependencies (uv sync)...")
    _ensure_python_dependencies()

    env = build_env()
    print("\n[3/5] Ensuring frontend dependencies + build...")
    _ensure_frontend_built(env)

    print("\n[4/5] Environment summary:")
    print(f"   LANGFLOW_COMPONENTS_PATH={env['LANGFLOW_COMPONENTS_PATH']}")
    print(f"   PYTHONPATH={env['PYTHONPATH']}")
    print(f"   LFX_DEV={env['LFX_DEV']}")

    print("\n[5/5] Starting LangFlow (Ctrl+C to stop)...")
    host = "0.0.0.0"
    port = _resolve_port(host)
    print(f"   URL: http://localhost:{port}")

    env_file = REPO_ROOT / ".env"
    env_file_args: list[str] = ["--env-file", str(env_file)] if env_file.exists() else []

    run(
        [sys.executable, "-m", "langflow", "run", "--host", host, "--port", str(port), *env_file_args],
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
