import hashlib
import mimetypes
import re
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

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.api.v1.schemas import UploadFileResponse
from langflow.services.database.models.flow.model import Flow
from langflow.services.deps import get_settings_service, get_storage_service
from langflow.services.storage.service import StorageService

router = APIRouter(tags=["Files"], prefix="/files")


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
        file_name = Path(file_name).name
        file_name = re.sub(r'[<>:"/\\\\|?*\\x00-\\x1F]', "_", file_name).strip().strip(".")
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


@router.get("/download/{flow_id}/{file_name}")
async def download_file(
    file_name: str, flow_id: UUID, storage_service: Annotated[StorageService, Depends(get_storage_service)]
):
    flow_id_str = str(flow_id)
    extension = file_name.split(".")[-1]

    if not extension:
        raise HTTPException(status_code=500, detail=f"Extension not found for file {file_name}")
    try:
        content_type = build_content_type_from_extension(extension)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    if not content_type:
        raise HTTPException(status_code=500, detail=f"Content type not found for extension {extension}")

    try:
        file_content = await storage_service.get_file(flow_id=flow_id_str, file_name=file_name)
        headers = {
            "Content-Disposition": f"attachment; filename={file_name} filename*=UTF-8''{file_name}",
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(file_content)),
        }
        return StreamingResponse(BytesIO(file_content), media_type=content_type, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/media/{flow_id}/{file_name}")
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
    extension = file_name.rsplit(".", 1)[1].lower() if "." in file_name else ""
    content_type = build_content_type_from_extension(extension) if extension else "application/octet-stream"

    try:
        file_content = await storage_service.get_file(flow_id=flow_id_str, file_name=file_name)

        if not content_type or content_type == "application/octet-stream":
            sniffed = _sniff_media_content_type(file_content)
            if sniffed:
                content_type = sniffed

        if not content_type:
            raise HTTPException(status_code=500, detail=f"Content type not found for file {file_name}")
        if not (content_type.startswith("video") or content_type.startswith("audio")):
            raise HTTPException(status_code=400, detail=f"Content type {content_type} is not previewable media")
        file_size = len(file_content)

        base_headers = {
            "Content-Disposition": f"inline; filename={file_name} filename*=UTF-8''{file_name}",
            "Accept-Ranges": "bytes",
        }

        range_header = request.headers.get("range")
        if range_header:
            # Support a single byte range: "bytes=start-end"
            match = re.match(r"^bytes=(\d*)-(\d*)$", range_header.strip())
            if match:
                start_str, end_str = match.groups()
                if start_str == "" and end_str == "":
                    match = None
                else:
                    if start_str == "":
                        # suffix range: bytes=-N
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
                    # Use a plain Response to avoid Windows Proactor transport "connection reset"
                    # errors from streaming when the browser cancels range probes.
                    return Response(
                        content=chunk,
                        media_type=content_type,
                        headers=headers,
                        status_code=HTTPStatus.PARTIAL_CONTENT,
                    )

        headers = {**base_headers, "Content-Length": str(file_size)}
        return Response(content=file_content, media_type=content_type, headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/public/{flow_id}/{file_name}")
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

    extension = file_name.split(".")[-1]
    if not extension:
        raise HTTPException(status_code=500, detail=f"Extension not found for file {file_name}")
    try:
        content_type = build_content_type_from_extension(extension)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    if not content_type:
        raise HTTPException(status_code=500, detail=f"Content type not found for extension {extension}")

    try:
        file_content = await storage_service.get_file(flow_id=str(flow_id), file_name=file_name)
        headers = {
            "Content-Disposition": f"attachment; filename={file_name} filename*=UTF-8''{file_name}",
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(file_content)),
        }
        return StreamingResponse(BytesIO(file_content), media_type=content_type, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/images/{flow_id}/{file_name}")
async def download_image(file_name: str, flow_id: UUID):
    storage_service = get_storage_service()
    extension = file_name.split(".")[-1]
    flow_id_str = str(flow_id)

    if not extension:
        raise HTTPException(status_code=500, detail=f"Extension not found for file {file_name}")
    try:
        content_type = build_content_type_from_extension(extension)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    if not content_type:
        raise HTTPException(status_code=500, detail=f"Content type not found for extension {extension}")
    if not content_type.startswith("image"):
        raise HTTPException(
            status_code=HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
            detail=f"Content type {content_type} is not an image",
        )

    try:
        file_content = await storage_service.get_file(flow_id=flow_id_str, file_name=file_name)
        return StreamingResponse(BytesIO(file_content), media_type=content_type)
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


@router.delete("/delete/{flow_id}/{file_name}")
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
