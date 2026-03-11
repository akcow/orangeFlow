import hashlib
import mimetypes
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from http import HTTPStatus
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, Request
from fastapi.responses import StreamingResponse, Response
from lfx.services.settings.service import SettingsService
from lfx.utils.helpers import build_content_type_from_extension
from lfx.utils.public_files import verify_public_file_token
from pydantic import BaseModel, Field

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.api.v1.schemas import UploadFileResponse
from langflow.services.database.models.flow.model import Flow
from langflow.services.deps import get_settings_service, get_storage_service
from langflow.services.storage.service import StorageService

router = APIRouter(tags=["Files"], prefix="/files")

def _sanitize_filename(name: str) -> str:
    # Prevent path traversal / nested paths / Windows-invalid filenames.
    safe = Path(str(name or "")).name
    safe = re.sub(r'[<>:"/\\\\|?*\\x00-\\x1F]', "_", safe).strip().strip(".")
    return safe


# Create dep that gets the flow_id from the request
# then finds it in the database and returns it while
# using the current user as the owner
async def get_flow(
    flow_id: UUID,
    current_user: CurrentActiveUser,
    session: DbSession,
):
    # AttributeError: 'SelectOfScalar' object has no attribute 'first'
    flow = await session.get(Flow, flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    if flow.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't have access to this flow")
    return flow


@router.post("/upload/{flow_id}", status_code=HTTPStatus.CREATED)
async def upload_file(
    *,
    file: UploadFile,
    flow: Annotated[Flow, Depends(get_flow)],
    current_user: CurrentActiveUser,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    settings_service: Annotated[SettingsService, Depends(get_settings_service)],
) -> UploadFileResponse:
    try:
        max_file_size_upload = settings_service.settings.max_file_size_upload
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    if flow.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't have access to this flow")

    try:
        file_content = await file.read()

        # Some FastAPI/Starlette versions don't expose UploadFile.size reliably; fall back to len(bytes).
        file_size = getattr(file, "size", None)
        if file_size is None:
            file_size = len(file_content)

        if file_size > max_file_size_upload * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail=f"File size is larger than the maximum file size {max_file_size_upload}MB.",
            )

        timestamp = datetime.now(tz=timezone.utc).astimezone().strftime("%Y-%m-%d_%H-%M-%S")
        file_name = file.filename or hashlib.sha256(file_content).hexdigest()
        # Prevent path traversal / nested paths / Windows-invalid filenames.
        file_name = _sanitize_filename(file_name)
        if not file_name:
            file_name = hashlib.sha256(file_content).hexdigest()

        # Repair broken/unknown extensions (e.g. ".mp_") using the upload's Content-Type.
        # Otherwise, preview endpoints that infer type from the extension may fail.
        suffix = Path(file_name).suffix  # includes leading "."
        ext = suffix[1:].lower() if suffix.startswith(".") else ""
        is_ext_suspicious = (
            not ext
            or not re.match(r"^[a-z0-9]{1,6}$", ext)
            or build_content_type_from_extension(ext) == "application/octet-stream"
        )
        upload_content_type = (getattr(file, "content_type", None) or "").split(";", 1)[0].strip().lower()
        if is_ext_suspicious and upload_content_type:
            guessed = mimetypes.guess_extension(upload_content_type)  # e.g. ".mp4"
            if guessed:
                base = file_name[: -len(suffix)] if suffix else file_name
                file_name = f"{base}{guessed}"
        full_file_name = f"{timestamp}_{file_name}"
        folder = str(flow.id)
        await storage_service.save_file(flow_id=folder, file_name=full_file_name, data=file_content)
        return UploadFileResponse(flow_id=str(flow.id), file_path=f"{folder}/{full_file_name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


class TrimVideoRequest(BaseModel):
    """Trim a user video and persist it as a new flow file."""

    file_path: str = Field(..., description="Flow-scoped file path, e.g. '{flow_id}/xxx.mp4'")
    start_s: float = Field(..., ge=0)
    end_s: float = Field(..., gt=0)


@router.post("/trim-video/{flow_id}", response_model=UploadFileResponse, status_code=HTTPStatus.OK)
async def trim_video(
    *,
    flow: Annotated[Flow, Depends(get_flow)],
    payload: TrimVideoRequest,
    current_user: CurrentActiveUser,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
):
    """Trim a video stored in the current flow and save the result as a new MP4 file.

    Notes:
    - No duration restriction is applied.
    - Uses ffmpeg for accurate trimming (re-encodes to H.264/AAC).
    """

    if flow.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't have access to this flow")

    start_s = float(payload.start_s)
    end_s = float(payload.end_s)
    if end_s <= start_s:
        raise HTTPException(status_code=400, detail="end_s must be greater than start_s")

    flow_id_str = str(flow.id)
    raw_path = str(payload.file_path or "").replace("\\", "/").lstrip("/").strip()
    if not raw_path:
        raise HTTPException(status_code=400, detail="file_path is required")

    # Ensure the user can only trim files within this flow.
    if not raw_path.startswith(f"{flow_id_str}/"):
        raise HTTPException(status_code=400, detail="file_path must belong to the current flow")

    file_name = raw_path.split("/", 1)[1]
    if not file_name:
        raise HTTPException(status_code=400, detail="Invalid file_path")

    # Guardrail: avoid reading extremely large blobs into memory.
    max_bytes = 600 * 1024 * 1024  # 600MB

    try:
        src_bytes = await storage_service.get_file(flow_id=flow_id_str, file_name=file_name)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found: {file_name}") from e

    if src_bytes is None:
        raise HTTPException(status_code=404, detail="File not found")
    if len(src_bytes) > max_bytes:
        raise HTTPException(status_code=413, detail="File too large to trim")

    base = _sanitize_filename(Path(file_name).name) or "video"
    stem = Path(base).stem or "video"
    start_ms = int(round(start_s * 1000))
    end_ms = int(round(end_s * 1000))
    timestamp = datetime.now(tz=timezone.utc).astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    out_file_name = (
        _sanitize_filename(f"{timestamp}_trim_{stem}_{start_ms}-{end_ms}.mp4")
        or f"{timestamp}_trim.mp4"
    )

    with tempfile.TemporaryDirectory(prefix="lf-trim-") as td:
        # Preserve input extension so ffmpeg can probe properly (some uploads may have masked extensions).
        in_ext = Path(file_name).suffix or ".mp4"
        in_path = os.path.join(td, "input" + in_ext)
        out_path = os.path.join(td, "output.mp4")
        with open(in_path, "wb") as f:
            f.write(src_bytes)

        cmd = [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            str(start_s),
            "-to",
            str(end_s),
            "-i",
            in_path,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            out_path,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as exc:
            msg = (exc.stderr or exc.stdout or str(exc)).strip()
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST, detail=f"Trim failed: {msg}"
            ) from exc

        try:
            with open(out_path, "rb") as f:
                out_bytes = f.read()
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"Failed to read trimmed output: {exc}"
            ) from exc

    try:
        await storage_service.save_file(flow_id=flow_id_str, file_name=out_file_name, data=out_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to save trimmed file: {exc}"
        ) from exc

    return UploadFileResponse(flow_id=flow_id_str, file_path=f"{flow_id_str}/{out_file_name}")


def _sniff_media_content_type(data: bytes) -> str | None:
    if not data:
        return None

    # WebM/Matroska: EBML header 1A 45 DF A3
    if len(data) >= 4 and data[:4] == b"\x1A\x45\xDF\xA3":
        return "video/webm"

    # MP4/MOV: "ftyp" box typically at offset 4
    if len(data) >= 12 and data[4:8] == b"ftyp":
        major_brand = data[8:12]
        if major_brand == b"qt  ":
            return "video/quicktime"
        return "video/mp4"

    # WAV: "RIFF....WAVE"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "audio/wav"

    # MP3: "ID3" tag or frame sync 0xFFEx
    if len(data) >= 3 and data[:3] == b"ID3":
        return "audio/mpeg"
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return "audio/mpeg"

    return None


def _resolve_content_type(file_name: str, file_content: bytes | None = None) -> str:
    extension = file_name.rsplit(".", 1)[1].lower() if "." in file_name else ""
    content_type = build_content_type_from_extension(extension) if extension else "application/octet-stream"
    if (not content_type or content_type == "application/octet-stream") and file_content:
        sniffed = _sniff_media_content_type(file_content)
        if sniffed:
            content_type = sniffed
    if not content_type:
        raise HTTPException(status_code=500, detail=f"Content type not found for file {file_name}")
    return content_type


def _build_inline_response(
    *,
    file_name: str,
    file_content: bytes,
    content_type: str,
    request: Request | None = None,
):
    file_size = len(file_content)
    base_headers = {
        "Content-Disposition": f"inline; filename={file_name} filename*=UTF-8''{file_name}",
        "Content-Length": str(file_size),
    }

    if request and (content_type.startswith("video") or content_type.startswith("audio")):
        base_headers["Accept-Ranges"] = "bytes"
        range_header = request.headers.get("range")
        if range_header:
            match = re.match(r"^bytes=(\d*)-(\d*)$", range_header.strip())
            if match:
                start_str, end_str = match.groups()
                if start_str == "" and end_str == "":
                    match = None
                else:
                    if start_str == "":
                        suffix_len = int(end_str)
                        if suffix_len <= 0:
                            raise HTTPException(status_code=416, detail="Invalid range")
                        start = max(file_size - suffix_len, 0)
                        end = file_size - 1
                    else:
                        start = int(start_str)
                        end = int(end_str) if end_str != "" else file_size - 1

                    if start >= file_size:
                        raise HTTPException(status_code=416, detail="Range not satisfiable")
                    end = min(end, file_size - 1)
                    if end < start:
                        raise HTTPException(status_code=416, detail="Range not satisfiable")

                    chunk = file_content[start : end + 1]
                    headers = {
                        **base_headers,
                        "Content-Range": f"bytes {start}-{end}/{file_size}",
                        "Content-Length": str(len(chunk)),
                    }
                    return Response(
                        content=chunk,
                        media_type=content_type,
                        headers=headers,
                        status_code=HTTPStatus.PARTIAL_CONTENT,
                    )

    return Response(content=file_content, media_type=content_type, headers=base_headers)


@router.get("/download/{flow_id}/{file_name:path}")
async def download_file(
    file_name: str, flow_id: UUID, storage_service: Annotated[StorageService, Depends(get_storage_service)]
):
    flow_id_str = str(flow_id)

    try:
        file_content = await storage_service.get_file(flow_id=flow_id_str, file_name=file_name)
        content_type = _resolve_content_type(file_name, file_content)
        headers = {
            "Content-Disposition": f"attachment; filename={file_name} filename*=UTF-8''{file_name}",
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(file_content)),
        }
        return StreamingResponse(BytesIO(file_content), media_type=content_type, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/media/{flow_id}/{file_name:path}")
async def media_file(
    file_name: str,
    flow_id: UUID,
    request: Request,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
):
    """Serve media (video/audio) inline for in-app preview.

    NOTE: `/download/...` forces `Content-Disposition: attachment` and `Content-Type: application/octet-stream`,
    which breaks `<video>` preview in browsers. This endpoint keeps the correct media type and uses `inline`.
    """
    flow_id_str = str(flow_id)

    try:
        file_content = await storage_service.get_file(flow_id=flow_id_str, file_name=file_name)
        content_type = _resolve_content_type(file_name, file_content)
        if not (content_type.startswith("video") or content_type.startswith("audio")):
            raise HTTPException(status_code=400, detail=f"Content type {content_type} is not previewable media")
        return _build_inline_response(
            file_name=file_name,
            file_content=file_content,
            content_type=content_type,
            request=request,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/public/{flow_id}/{file_name:path}")
async def download_public_file(
    file_name: str,
    flow_id: UUID,
    token: str,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    settings_service: Annotated[SettingsService, Depends(get_settings_service)],
):
    secret_key = settings_service.auth_settings.SECRET_KEY.get_secret_value()
    if not secret_key:
        raise HTTPException(status_code=500, detail="Public file access is not configured.")

    if not verify_public_file_token(
        secret_key=secret_key,
        token=token,
        flow_id=str(flow_id),
        file_name=file_name,
    ):
        raise HTTPException(status_code=403, detail="Invalid or expired token.")

    try:
        file_content = await storage_service.get_file(flow_id=str(flow_id), file_name=file_name)
        content_type = _resolve_content_type(file_name, file_content)
        headers = {
            "Content-Disposition": f"attachment; filename={file_name} filename*=UTF-8''{file_name}",
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(file_content)),
        }
        return StreamingResponse(BytesIO(file_content), media_type=content_type, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/public-inline/{flow_id}/{file_name:path}")
async def download_public_inline_file(
    file_name: str,
    flow_id: UUID,
    token: str,
    request: Request,
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    settings_service: Annotated[SettingsService, Depends(get_settings_service)],
):
    secret_key = settings_service.auth_settings.SECRET_KEY.get_secret_value()
    if not secret_key:
        raise HTTPException(status_code=500, detail="Public file access is not configured.")

    if not verify_public_file_token(
        secret_key=secret_key,
        token=token,
        flow_id=str(flow_id),
        file_name=file_name,
    ):
        raise HTTPException(status_code=403, detail="Invalid or expired token.")

    try:
        file_content = await storage_service.get_file(flow_id=str(flow_id), file_name=file_name)
        content_type = _resolve_content_type(file_name, file_content)
        return _build_inline_response(
            file_name=file_name,
            file_content=file_content,
            content_type=content_type,
            request=request,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/images/{flow_id}/{file_name:path}")
async def download_image(file_name: str, flow_id: UUID, request: Request):
    storage_service = get_storage_service()
    flow_id_str = str(flow_id)

    try:
        file_content = await storage_service.get_file(flow_id=flow_id_str, file_name=file_name)
        content_type = _resolve_content_type(file_name, file_content)
        if not content_type.startswith("image"):
            raise HTTPException(
                status_code=HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                detail=f"Content type {content_type} is not an image",
            )
        return _build_inline_response(
            file_name=file_name,
            file_content=file_content,
            content_type=content_type,
            request=request,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/profile_pictures/{folder_name}/{file_name}")
async def download_profile_picture(
    folder_name: str,
    file_name: str,
):
    try:
        storage_service = get_storage_service()
        extension = file_name.split(".")[-1]
        config_dir = storage_service.settings_service.settings.config_dir
        config_path = Path(config_dir)  # type: ignore[arg-type]
        folder_path = config_path / "profile_pictures" / folder_name
        content_type = build_content_type_from_extension(extension)
        file_content = await storage_service.get_file(flow_id=folder_path, file_name=file_name)  # type: ignore[arg-type]
        return StreamingResponse(BytesIO(file_content), media_type=content_type)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/profile_pictures/list")
async def list_profile_pictures():
    try:
        storage_service = get_storage_service()
        config_dir = storage_service.settings_service.settings.config_dir
        config_path = Path(config_dir)  # type: ignore[arg-type]

        people_path = config_path / "profile_pictures/People"
        space_path = config_path / "profile_pictures/Space"

        people = await storage_service.list_files(flow_id=people_path)  # type: ignore[arg-type]
        space = await storage_service.list_files(flow_id=space_path)  # type: ignore[arg-type]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    files = [f"People/{i}" for i in people]
    files += [f"Space/{i}" for i in space]

    return {"files": files}


@router.get("/list/{flow_id}")
async def list_files(
    flow: Annotated[Flow, Depends(get_flow)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
):
    try:
        files = await storage_service.list_files(flow_id=str(flow.id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {"files": files}


@router.delete("/delete/{flow_id}/{file_name:path}")
async def delete_file(
    file_name: str,
    flow: Annotated[Flow, Depends(get_flow)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
):
    try:
        await storage_service.delete_file(flow_id=str(flow.id), file_name=file_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {"message": f"File {file_name} deleted successfully"}
