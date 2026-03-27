from pathlib import Path

from langflow import main


def test_resolve_repo_frontend_build_returns_repo_build_when_present(tmp_path):
    frontend_path = tmp_path / "repo" / "src" / "backend" / "base" / "langflow"
    repo_build = tmp_path / "repo" / "src" / "frontend" / "build"
    repo_build.mkdir(parents=True)
    (repo_build / "index.html").write_text("<html></html>", encoding="utf-8")

    assert main._resolve_repo_frontend_build(frontend_path) == repo_build


def test_resolve_repo_frontend_build_returns_none_when_index_missing(tmp_path):
    frontend_path = tmp_path / "repo" / "src" / "backend" / "base" / "langflow"
    (tmp_path / "repo" / "src" / "frontend" / "build").mkdir(parents=True)

    assert main._resolve_repo_frontend_build(frontend_path) is None


def test_get_static_files_dir_prefers_newer_repo_build(monkeypatch, tmp_path):
    frontend_path = tmp_path / "repo" / "src" / "backend" / "base" / "langflow"
    bundled_frontend = frontend_path / "frontend"
    repo_build = tmp_path / "repo" / "src" / "frontend" / "build"

    bundled_frontend.mkdir(parents=True)
    repo_build.mkdir(parents=True)

    (bundled_frontend / "index.html").write_text("bundled", encoding="utf-8")
    (repo_build / "index.html").write_text("repo", encoding="utf-8")
    (bundled_frontend / "old.js").write_text("old", encoding="utf-8")
    (repo_build / "new.js").write_text("new", encoding="utf-8")

    monkeypatch.setattr(main, "__file__", str(frontend_path / "main.py"))
    monkeypatch.setattr(main, "_frontend_dir_mtime", lambda path: 1 if path == bundled_frontend else 2)

    assert main.get_static_files_dir() == repo_build


def test_get_static_files_dir_falls_back_to_bundled_when_repo_build_not_newer(monkeypatch, tmp_path):
    frontend_path = tmp_path / "repo" / "src" / "backend" / "base" / "langflow"
    bundled_frontend = frontend_path / "frontend"
    repo_build = tmp_path / "repo" / "src" / "frontend" / "build"

    bundled_frontend.mkdir(parents=True)
    repo_build.mkdir(parents=True)

    (bundled_frontend / "index.html").write_text("bundled", encoding="utf-8")
    (repo_build / "index.html").write_text("repo", encoding="utf-8")

    monkeypatch.setattr(main, "__file__", str(frontend_path / "main.py"))
    monkeypatch.setattr(main, "_frontend_dir_mtime", lambda path: 2 if path == bundled_frontend else 1)

    assert main.get_static_files_dir() == bundled_frontend
