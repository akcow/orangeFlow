from __future__ import annotations

from typing import Any

from lfx.components._importing import import_mod

# Slimmed-down component registry: only ship the component categories used by this repo.
_dynamic_imports: dict[str, str] = {
    # Category modules
    "doubao": "__module__",
    "text": "__module__",
    "user_upload": "__module__",
    # Direct component access
    "DoubaoTTS": "doubao.doubao_tts_perfect",
    "DoubaoVideoGenerator": "doubao.doubao_video_generator",
    "DoubaoImageCreator": "doubao.doubao_image_creator",
    "TextCreation": "text.text_creation",
    "UserUploadImage": "user_upload.user_upload_image",
    "UserUploadVideo": "user_upload.user_upload_video",
    "UserUploadAudio": "user_upload.user_upload_audio",
}

__all__ = list(_dynamic_imports.keys())


def __getattr__(attr_name: str) -> Any:
    if attr_name not in _dynamic_imports:
        msg = f"module '{__name__}' has no attribute '{attr_name}'"
        raise AttributeError(msg)
    try:
        result = import_mod(attr_name, _dynamic_imports[attr_name], __spec__.parent)
    except (ModuleNotFoundError, ImportError, AttributeError) as e:
        msg = f"Could not import '{attr_name}' from '{__name__}': {e}"
        raise AttributeError(msg) from e
    globals()[attr_name] = result
    return result


def __dir__() -> list[str]:
    return list(__all__)
