from __future__ import annotations

"""
Hotfix built frontend bundle(s) when local rebuild is blocked.

Patches applied:
1) Define `formatControlValue` to avoid ReferenceError at runtime.
2) Prevent Chinese labels in the image-creator top bar from wrapping vertically (add nowrap + shrink-0).
3) Fix Erase overlay "Clear" button label that renders as literal '\\u6e05...' (remove one escape layer).
4) Adjust Erase viewport zoom to 1.03 (103%).
5) While Erase editor is open, disable all ReactFlow handle pointer-events to avoid triggering IO handles.

This script edits the built asset in-place and writes a .bak file next to it (once).
"""

from pathlib import Path


ASSET_PATHS = [
    Path("src/frontend/build/assets/index-D_IDnEUs.js"),
    Path("src/backend/base/langflow/frontend/assets/index-D_IDnEUs.js"),
]


FORMAT_CONTROL_VALUE_FN = (
    "function formatControlValue(name,value){\n"
    "  if(value===void 0||value===null) return \"\";\n"
    "  if(name===\"model_name\"){\n"
    "    var main=String(value).split(\"(\")[0];\n"
    "    var cleaned=main"
    ".replaceAll(\"\\u65d7\\u8230\",\"\")"
    ".replaceAll(\"\\u7075\\u52a8\",\"\")"
    ".replace(/\\s+/g,\" \")"
    ".trim();\n"
    "    var display=cleaned.endsWith(\".\")?cleaned.slice(0,-1).trim():cleaned;\n"
    "    if(display.startsWith(\"Seedream\")&&display.length>0) display=display.slice(0,-1).trimEnd();\n"
    "    return display;\n"
    "  }\n"
    "  if(name===\"resolution\"){\n"
    "    var raw=String(value).trim();\n"
    "    if(!raw) return \"\";\n"
    "    if(raw.toLowerCase().startsWith(\"auto\")) return \"Auto\";\n"
    "    var m=raw.match(/^(1K|2K|4K)/i);\n"
    "    if(m) return m[1].toUpperCase();\n"
    "    if(/^\\d+p$/i.test(raw)) return raw.toUpperCase();\n"
    "    return raw;\n"
    "  }\n"
    "  if(name===\"aspect_ratio\"){\n"
    "    var r=String(value).trim();\n"
    "    if(!r) return \"\";\n"
    "    if(r.toLowerCase()===\"adaptive\") return \"\\u81ea\\u9002\\u5e94\";\n"
    "    return r;\n"
    "  }\n"
    "  if(name===\"image_count\") return String(value)+\"X\";\n"
    "  if(name===\"duration\") return String(value)+\"s\";\n"
    "  return String(value);\n"
    "}\n"
).encode("ascii")


# Top bar button class used by image-creator actions.
TOPBAR_CLASS_NEEDLE = (
    "flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition"
).encode("ascii")
TOPBAR_CLASS_REPL = (
    "flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition whitespace-nowrap"
).encode("ascii")


# Erase overlay clear button label is currently double-escaped, e.g. "\\u6e05\\u7a7a".
CLEAR_LONG_DOUBLE = b"\\\\u6e05\\\\u7a7a\\\\u6d82\\\\u62b9"
CLEAR_LONG_SINGLE = b"\\u6e05\\u7a7a\\u6d82\\u62b9"
CLEAR_SHORT_DOUBLE = b"\\\\u6e05\\\\u7a7a"
CLEAR_SHORT_SINGLE = b"\\u6e05\\u7a7a"


ERASE_WARN = b"Failed to animate viewport for erase mode:"


ERASE_HANDLE_DISABLE_ANCHOR = b"D.useEffect(()=>{Nr&&(Oi||no(!1))},[Oi,Nr]),"
ERASE_HANDLE_DISABLE_INSERT = (
    ERASE_HANDLE_DISABLE_ANCHOR
    + b'D.useEffect(()=>{if(typeof document>"u")return;const __eraseCls="doubao-erase-mode",__eraseStyleId="doubao-erase-mode-style";const __root=document.documentElement;if(Nr){__root.classList.add(__eraseCls);if(!document.getElementById(__eraseStyleId)){const __style=document.createElement("style");__style.id=__eraseStyleId;__style.textContent=".doubao-erase-mode .react-flow__handle{pointer-events:none !important;}";document.head.appendChild(__style)}}else __root.classList.remove(__eraseCls)},[Nr]),'
)


def patch_asset(path: Path) -> None:
    if not path.exists():
        print(f"[skip] missing: {path}")
        return

    bak = path.with_suffix(path.suffix + ".bak")
    if not bak.exists():
        bak.write_bytes(path.read_bytes())

    data = path.read_bytes()
    original = data
    changes: list[str] = []

    if b"function formatControlValue(" not in data:
        data = FORMAT_CONTROL_VALUE_FN + data
        changes.append("insert formatControlValue")

    if TOPBAR_CLASS_NEEDLE in data:
        n = data.count(TOPBAR_CLASS_NEEDLE)
        data = data.replace(TOPBAR_CLASS_NEEDLE, TOPBAR_CLASS_REPL)
        changes.append(f"topbar nowrap x{n}")

    # Fix clear label (\uXXXX literal) -> actual Chinese via JS unicode escapes.
    if CLEAR_LONG_DOUBLE in data:
        n = data.count(CLEAR_LONG_DOUBLE)
        data = data.replace(CLEAR_LONG_DOUBLE, CLEAR_LONG_SINGLE)
        changes.append(f"clear label long x{n}")
    if CLEAR_SHORT_DOUBLE in data:
        n = data.count(CLEAR_SHORT_DOUBLE)
        data = data.replace(CLEAR_SHORT_DOUBLE, CLEAR_SHORT_SINGLE)
        changes.append(f"clear label short x{n}")

    # Erase zoom: replace kn=1.35 -> kn=1.03 only in the erase-mode viewport animation block.
    warn_idx = data.find(ERASE_WARN)
    if warn_idx != -1:
        seg_start = max(0, warn_idx - 4000)
        seg = data[seg_start:warn_idx]
        pos = seg.rfind(b"kn=1.35")
        if pos != -1:
            seg = seg[:pos] + b"kn=1.03" + seg[pos + len(b"kn=1.35") :]
            data = data[:seg_start] + seg + data[warn_idx:]
            changes.append("erase zoom 1.35->1.03")

    # Disable all handles while erase editor is open.
    if b"doubao-erase-mode-style" not in data and ERASE_HANDLE_DISABLE_ANCHOR in data:
        data = data.replace(ERASE_HANDLE_DISABLE_ANCHOR, ERASE_HANDLE_DISABLE_INSERT, 1)
        changes.append("disable handles while erase open")

    if data != original:
        path.write_bytes(data)
        print(f"[patched] {path}: {', '.join(changes)}")
    else:
        print(f"[ok] {path}: no changes")


def main() -> None:
    for asset in ASSET_PATHS:
        patch_asset(asset)


if __name__ == "__main__":
    main()

