from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: Union[str, List[Dict[str, Any]]]  # Support text or multimodal content
    name: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    stream: bool = False
    temperature: Optional[float] = 1.0
    top_p: Optional[float] = 1.0
    n: Optional[int] = 1
    stop: Optional[Union[str, List[str]]] = None
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = 0
    frequency_penalty: Optional[float] = 0
    logit_bias: Optional[Dict[str, float]] = None
    user: Optional[str] = None
    response_format: Optional[Dict[str, Any]] = None  # { "type": "json_object" }
    tools: Optional[List[Dict[str, Any]]] = None
    tool_choice: Optional[Union[str, Dict[str, Any]]] = None
    # Provider-specific knobs/passthrough fields.
    extra_body: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ImageGenerationRequest(BaseModel):
    model: str
    prompt: str
    n: int = 1
    size: str = "1024x1024"
    quality: Optional[str] = "standard"
    style: Optional[str] = "vivid"
    response_format: str = "url"  # url or b64_json
    user: Optional[str] = None
    # Provider-specific knobs/passthrough fields (e.g. reference images, seed, negative_prompt).
    extra_body: Optional[Dict[str, Any]] = Field(default_factory=dict)


class VideoGenerationRequest(BaseModel):
    model: str
    prompt: str
    ratio: Optional[str] = "16:9"
    duration: Optional[int] = 5
    quality: Optional[str] = "standard"
    user: Optional[str] = None
    # Extensions for specific providers (Sora, etc.)
    extra_body: Optional[Dict[str, Any]] = Field(default_factory=dict)


class AudioSpeechRequest(BaseModel):
    model: str
    input: str
    voice: str
    response_format: str = "mp3"
    speed: float = 1.0
    # Provider-specific knobs/passthrough fields.
    extra_body: Optional[Dict[str, Any]] = Field(default_factory=dict)


class GatewayErrorResponse(BaseModel):
    code: str
    message: str
    provider: Optional[str] = None
    request_id: str


# --- Compatibility Schemas (Huobao Canvas) ---

class ModelRecord(BaseModel):
    id: str  # e.g. "sora-2"
    fullName: str # e.g. "Sora 2"
    type: str # e.g. "video"
    status: int = 1 # 1=enable
    desc: Optional[str] = None
    tags: Optional[str] = None

class ModelPageResponse(BaseModel):
    code: int = 200
    msg: str = "success"
    data: Dict[str, Any] # { "records": [...], "total": ... }

class ModelTypesResponse(BaseModel):
    code: int = 200
    msg: str = "success"
    data: List[Dict[str, str]] # [{ "label": "视频", "value": "video" }, ...]
