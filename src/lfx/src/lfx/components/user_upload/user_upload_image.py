from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
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


class UserUploadImage(Component):
    display_name = "用户上传图片"
    description = ""
    icon = "Image"
    name = "UserUploadImage"
    category = "user_upload"

    inputs = [
        FileInput(
            name="file",
            display_name="图片",
            is_list=False,
            file_types=["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"],
            input_types=["Data"],
            required=False,
            show=False,
        )
    ]

    outputs = [
        Output(
            name="image",
            display_name="图片",
            method="emit",
            types=["Data"],
        )
    ]

    def emit(self) -> Data:
        file_path = extract_file_path(getattr(self, "file", None))
        generated_at = datetime.now(timezone.utc).isoformat()

        if not file_path:
            preview = {
                "token": f"user_upload_image-{uuid4().hex[:8]}",
                "kind": "image",
                "available": False,
                "generated_at": generated_at,
                "payload": {},
            }
            self.status = "未上传图片"
            return Data(data={"file_path": "", "doubao_preview": preview}, text_key="file_path")

        stable_url = stable_in_app_file_url(file_path, kind="image")
        public_url = build_public_file_url(file_path, ttl_seconds=3600)

        token = f"user_upload_image-{uuid4().hex[:8]}"
        preview = {
            "token": token,
            "kind": "image",
            "available": True,
            "generated_at": generated_at,
            "payload": {
                "image_url": stable_url or public_url or file_path,
                "public_url": public_url,
                "file_path": file_path,
            },
        }

        self.status = "已上传图片"
        return Data(
            data={
                "file_path": file_path,
                "url": stable_url,
                "public_url": public_url,
                "extension": infer_extension(file_path),
                "doubao_preview": preview,
            },
            text_key="file_path",
        )
