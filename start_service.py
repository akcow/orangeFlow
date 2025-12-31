# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""One-stop LangFlow dev launcher (see start-langflow-dev.md)."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
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


def _ensure_uv_environment() -> None:
    """Ensure we run inside the repo's uv environment when available."""
    if os.environ.get("LANGFLOW_START_SERVICE_REEXEC") == "1":
        return

    # If we already run from .venv, keep going.
    exe = Path(sys.executable).resolve()
    if ".venv" in exe.parts:
        return

    # If uv is available, re-exec via uv so dependencies resolve consistently.
    if shutil.which("uv"):
        env = os.environ.copy()
        env["LANGFLOW_START_SERVICE_REEXEC"] = "1"
        cmd = ["uv", "run", "python", str(Path(__file__).resolve()), *sys.argv[1:]]
        subprocess.run(_resolve_command(cmd), cwd=REPO_ROOT, env=env, check=True)
        raise SystemExit(0)


def _ensure_frontend_built(env: dict[str, str]) -> None:
    """Build and sync the frontend only when needed."""
    package_json = FRONTEND_DIR / "package.json"
    if not package_json.exists():
        raise FileNotFoundError(f"Missing frontend package.json at {package_json}")

    node_modules = FRONTEND_DIR / "node_modules"
    lockfile = FRONTEND_DIR / "package-lock.json"

    if not node_modules.exists():
        if lockfile.exists():
            run(["npm", "ci"], cwd=FRONTEND_DIR, env=env)
        else:
            run(["npm", "install"], cwd=FRONTEND_DIR, env=env)

    # Build if build output is missing, or backend static folder is missing.
    if not FRONTEND_BUILD_DIR.exists() or not BACKEND_FRONTEND_DIR.exists():
        run(["npm", "run", "build"], cwd=FRONTEND_DIR, env=env)

    # Sync build into backend folder if missing or stale.
    if not BACKEND_FRONTEND_DIR.exists():
        copy_frontend_build()
        return

    try:
        build_mtime = max(p.stat().st_mtime for p in FRONTEND_BUILD_DIR.rglob("*") if p.is_file())
        backend_mtime = max(p.stat().st_mtime for p in BACKEND_FRONTEND_DIR.rglob("*") if p.is_file())
    except ValueError:
        copy_frontend_build()
        return

    if build_mtime >= backend_mtime:
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
    env.setdefault("LFX_DEV", "1")
    return env


def main() -> None:
    _ensure_uv_environment()

    print("LangFlow dev launcher")
    print("1) clean caches  2) ensure frontend  3) set env  4) run service")

    print("\n[1/4] Cleaning caches and component index...")
    clear_component_index_cache(verbose=True)
    for target in CACHE_TARGETS:
        remove_path(target)

    env = build_env()
    print("\n[2/4] Ensuring frontend dependencies + build...")
    _ensure_frontend_built(env)

    print("\n[3/4] Environment summary:")
    print(f"   LANGFLOW_COMPONENTS_PATH={env['LANGFLOW_COMPONENTS_PATH']}")
    print(f"   PYTHONPATH={env['PYTHONPATH']}")
    print(f"   LFX_DEV={env['LFX_DEV']}")

    print("\n[4/4] Starting LangFlow (Ctrl+C to stop)...")
    print("   URL: http://localhost:7860")

    run(
        [sys.executable, "-m", "langflow", "run", "--host", "0.0.0.0", "--port", "7860"],
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
