# Router for base api
from fastapi import APIRouter

from langflow.api.v1 import (
    api_key_router,
    canvas_assistant_router,
    chat_router,
    community_router,
    endpoints_router,
    files_router,
    flows_router,
    folders_router,
    knowledge_bases_router,
    login_router,
    mcp_projects_router,
    mcp_router,
    monitor_router,
    openai_responses_router,
    provider_credentials_router,
    projects_router,
    starter_projects_router,
    store_router,
    users_router,
    validate_router,
    variables_router,
)
from langflow.api.v1.voice_mode import router as voice_mode_router
from langflow.api.v2 import files_router as files_router_v2
from langflow.api.v2 import kling_elements_router as kling_elements_router_v2
from langflow.api.v2 import library_router as library_router_v2
from langflow.api.v2 import mcp_router as mcp_router_v2

router_v1 = APIRouter(
    prefix="/v1",
)

router_v2 = APIRouter(
    prefix="/v2",
)

router_v1.include_router(chat_router)
router_v1.include_router(canvas_assistant_router)
router_v1.include_router(community_router)
router_v1.include_router(endpoints_router)
router_v1.include_router(validate_router)
router_v1.include_router(store_router)
router_v1.include_router(flows_router)
router_v1.include_router(users_router)
router_v1.include_router(api_key_router)
router_v1.include_router(login_router)
router_v1.include_router(variables_router)
router_v1.include_router(files_router)
router_v1.include_router(monitor_router)
router_v1.include_router(folders_router)
router_v1.include_router(projects_router)
router_v1.include_router(starter_projects_router)
router_v1.include_router(knowledge_bases_router)
router_v1.include_router(mcp_router)
router_v1.include_router(voice_mode_router)
router_v1.include_router(mcp_projects_router)
router_v1.include_router(openai_responses_router)
router_v1.include_router(provider_credentials_router)

router_v2.include_router(files_router_v2)
router_v2.include_router(kling_elements_router_v2)
router_v2.include_router(library_router_v2)
router_v2.include_router(mcp_router_v2)

router = APIRouter(
    prefix="/api",
)
router.include_router(router_v1)
router.include_router(router_v2)
