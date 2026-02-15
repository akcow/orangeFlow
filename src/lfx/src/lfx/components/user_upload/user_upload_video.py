from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4
from pathlib import Path

from lfx.custom.custom_component.component import Component
from lfx.inputs.inputs import FileInput
from lfx.schema.data import Data
from lfx.template.field.base import Output

from lfx.components.user_upload.shared import (
    build_public_file_url,
    extract_file_path,
    infer_extension,
    stable_in_app_file_url,
)


class UserUploadVideo(Component):
    display_name = "用户上传视频"
    description = ""
    icon = "Video"
    name = "UserUploadVideo"
    category = "user_upload"

    inputs = [
        FileInput(
            name="file",
            display_name="视频",
            is_list=False,
            file_types=["mp4", "mov", "webm"],
            input_types=["Data"],
            required=False,
            show=False,
        )
    ]

    outputs = [
        Output(
            name="video",
            display_name="视频",
            method="emit",
            types=["Data"],
        )
    ]

    def emit(self) -> Data:
        file_input = None
        try:
            file_input = getattr(self, "_inputs", {}).get("file")
        except Exception:
            file_input = None

        file_path = extract_file_path(getattr(file_input, "file_path", None)) or extract_file_path(
            getattr(self, "file", None)
        )
        generated_at = datetime.now(timezone.utc).isoformat()

        if (not file_path) and isinstance(getattr(self, "file", None), str):
            name = str(getattr(self, "file") or "").strip()
            if name and "/" not in name and "\\" not in name:
                try:
                    flow_id = str(getattr(self, "flow_id", "") or "").strip()
                    if flow_id:
                        candidate = f"{flow_id}/{name}"
                        try:  # pragma: no cover - runtime dependency
                            from langflow.services.deps import get_storage_service

                            storage_svc = get_storage_service()
                            full = storage_svc.build_full_path(flow_id, name)
                            if Path(full).exists():
                                file_path = candidate
                        except Exception:
                            file_path = candidate
                except Exception:
                    pass

        if not file_path:
            preview = {
                "token": f"user_upload_video-{uuid4().hex[:8]}",
                "kind": "video",
                "available": False,
                "generated_at": generated_at,
                "payload": {},
            }
            self.status = "未上传视频"
            return Data(data={"file_path": "", "doubao_preview": preview}, text_key="file_path")

        stable_url = stable_in_app_file_url(file_path, kind="video")
        public_url = build_public_file_url(file_path, ttl_seconds=3600)
        token = f"user_upload_video-{uuid4().hex[:8]}"
        preview = {
            "token": token,
            "kind": "video",
            "available": True,
            "generated_at": generated_at,
            "payload": {
                "video_url": stable_url or public_url or file_path,
                "public_url": public_url,
                "file_path": file_path,
            },
        }

        self.status = "已上传视频"
        return Data(
            data={
                "file_path": file_path,
                "video_url": stable_url,
                "public_url": public_url,
                "extension": infer_extension(file_path),
                "doubao_preview": preview,
            },
            text_key="file_path",
        )
