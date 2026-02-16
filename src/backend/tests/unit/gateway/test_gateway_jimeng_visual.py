import pytest


@pytest.mark.asyncio
async def test_jimeng_visual_enhance_polls_until_done(monkeypatch):
    # Import inside test so monkeypatching works reliably on the module attribute.
    from langflow.gateway.providers import jimeng_visual as jimeng_mod
    from langflow.gateway.providers.jimeng_visual import JimengVisualProvider
    from langflow.gateway.schemas import ImageGenerationRequest

    calls: list[tuple[str, str, str]] = []
    poll_count = {"n": 0}

    class FakeResponse:
        def __init__(self, status_code: int, json_data: dict, text: str = ""):
            self.status_code = status_code
            self._json_data = json_data
            self.text = text

        def json(self):
            return self._json_data

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, params=None, headers=None, content=None, json=None):
            action = (params or {}).get("Action") if isinstance(params, dict) else None
            calls.append(("post", str(url), str(action or "")))

            if action == "CVSync2AsyncSubmitTask":
                return FakeResponse(
                    200,
                    {"code": 10000, "data": {"task_id": "task_1"}, "message": "Success"},
                )

            if action == "CVSync2AsyncGetResult":
                poll_count["n"] += 1
                if poll_count["n"] == 1:
                    return FakeResponse(
                        200,
                        {"code": 10000, "data": {"status": "generating"}, "message": "Success"},
                    )
                return FakeResponse(
                    200,
                    {
                        "code": 10000,
                        "data": {"status": "done", "image_urls": ["https://example.com/out.jpg"]},
                        "message": "Success",
                    },
                )

            return FakeResponse(400, {"code": 400, "message": "Bad Request"}, text="bad")

    async def _noop_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(jimeng_mod.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(jimeng_mod, "asyncio_sleep", _noop_sleep)

    provider = JimengVisualProvider(access_key="ak-test", secret_key="sk-test", base_url="https://visual.volcengineapi.com")
    req = ImageGenerationRequest(
        model="jimeng-smart-hd",
        prompt="",
        n=1,
        extra_body={
            "binary_data_base64": ["dGVzdA=="],
            "resolution": "4k",
            "scale": 50,
            "poll_interval_s": 0,
        },
    )
    out = await provider.image_generation(req)
    assert out["data"][0]["url"] == "https://example.com/out.jpg"
    assert [c[2] for c in calls].count("CVSync2AsyncSubmitTask") == 1
    assert [c[2] for c in calls].count("CVSync2AsyncGetResult") >= 1

