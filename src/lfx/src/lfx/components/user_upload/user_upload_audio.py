from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

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


class UserUploadAudio(Component):
    display_name = "用户上传音频"
    description = ""
    icon = "Music"
    name = "UserUploadAudio"
    category = "user_upload"

    inputs = [
        FileInput(
            name="file",
            display_name="音频",
            is_list=False,
            file_types=["mp3", "wav", "m4a", "aac", "ogg", "flac"],
            input_types=["Data"],
            required=False,
            show=False,
        )
    ]

    outputs = [
        Output(
            name="audio",
            display_name="音频",
            method="emit",
            types=["Data"],
        )
    ]

    def emit(self) -> Data:
        file_path = extract_file_path(getattr(self, "file", None))
        generated_at = datetime.now(timezone.utc).isoformat()

        if not file_path:
            preview = {
                "token": f"user_upload_audio-{uuid4().hex[:8]}",
                "kind": "audio",
                "available": False,
                "generated_at": generated_at,
                "payload": {},
            }
            self.status = "未上传音频"
            return Data(data={"file_path": "", "doubao_preview": preview}, text_key="file_path")

        stable_url = stable_in_app_file_url(file_path, kind="audio")
        public_url = build_public_file_url(file_path, ttl_seconds=3600)
        ext = infer_extension(file_path) or "mp3"
        token = f"user_upload_audio-{uuid4().hex[:8]}"
        preview = {
            "token": token,
            "kind": "audio",
            "available": True,
            "generated_at": generated_at,
            "payload": {
                "audio_url": stable_url or public_url or file_path,
                "audio_type": ext,
                "public_url": public_url,
                "file_path": file_path,
            },
        }

        self.status = "已上传音频"
        return Data(
            data={
                "file_path": file_path,
                "audio_url": stable_url,
                "public_url": public_url,
                "audio_type": ext,
                "doubao_preview": preview,
            },
            text_key="file_path",
        )
