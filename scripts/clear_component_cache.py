"""Utility helpers to clear cached LangFlow component indexes.

LangFlow stores a serialized component index under the OS cache directory
(`platformdirs.user_cache_dir("lfx", "langflow")/component_index.json`). When
switching repositories or iterating on built-in components, this cached file can
go stale and prevent new component code from showing up in the UI. Importing
and calling :func:`clear_component_index_cache` ensures we always rebuild the
index from the local source.
"""

from __future__ import annotations

from pathlib import Path

from platformdirs import user_cache_dir


def _cache_targets() -> list[Path]:
    cache_dir = Path(user_cache_dir("lfx", "langflow"))
    return [
        cache_dir / "component_index.json",
        cache_dir / "component_index.json.backup",
    ]


def clear_component_index_cache(*, verbose: bool = True) -> list[Path]:
    """Delete cached component index files and return the removed paths."""

    removed: list[Path] = []
    for target in _cache_targets():
        try:
            if target.exists():
                target.unlink()
                removed.append(target)
        except OSError:
            # Do not fail hard on permission issues; keep going.
            continue

    if verbose:
        if removed:
            formatted = "\n  ".join(str(path) for path in removed)
            print("Cleared cached component index files:\n  " + formatted)
        else:
            print("No cached component index files detected; nothing to clear.")

    return removed


if __name__ == "__main__":
    try:
        clear_component_index_cache()
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to clear LangFlow component cache: {exc}")
        raise
