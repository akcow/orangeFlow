import pytest


@pytest.mark.asyncio
async def test_kling_image_generation_polls_until_succeed(monkeypatch):
    # Import inside test so monkeypatching works reliably on the module attribute.
    from langflow.gateway.providers import kling as kling_mod
    from langflow.gateway.providers.kling import KlingProvider
    from langflow.gateway.schemas import ImageGenerationRequest

    calls: list[tuple[str, str]] = []

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

        async def post(self, url, headers=None, json=None):
            calls.append(("post", url))
            assert url.endswith("/v1/images/omni-image")
            assert isinstance(json, dict)
            assert json.get("model_name") == "kling-image-o1"
            assert json.get("prompt") == "hello"
            return FakeResponse(200, {"code": 0, "data": {"task_id": "task_1"}})

        async def get(self, url, headers=None):
            calls.append(("get", url))
            assert url.endswith("/v1/images/omni-image/task_1")
            # First poll: processing; second: succeed.
            if len([c for c in calls if c[0] == "get"]) == 1:
                return FakeResponse(200, {"code": 0, "data": {"task_status": "processing"}})
            return FakeResponse(
                200,
                {
                    "code": 0,
                    "data": {
                        "task_status": "succeed",
                        "task_result": {"images": [{"index": 0, "url": "https://example.com/1.png"}]},
                    },
                },
            )

    monkeypatch.setattr(kling_mod.httpx, "AsyncClient", FakeAsyncClient)

    provider = KlingProvider(api_key="sk-test", base_url="https://api-beijing.klingai.com")
    req = ImageGenerationRequest(
        model="kling-image-o1",
        prompt="hello",
        n=1,
        extra_body={"poll_interval_s": 0},
    )
    out = await provider.image_generation(req)
    assert out["data"][0]["url"] == "https://example.com/1.png"
    assert [c[0] for c in calls].count("post") == 1
    assert [c[0] for c in calls].count("get") >= 1


@pytest.mark.asyncio
async def test_kling_image_generation_supports_series_images(monkeypatch):
    # Import inside test so monkeypatching works reliably on the module attribute.
    from langflow.gateway.providers import kling as kling_mod
    from langflow.gateway.providers.kling import KlingProvider
    from langflow.gateway.schemas import ImageGenerationRequest

    class FakeResponse:
        def __init__(self, status_code: int, json_data: dict, text: str = ""):
            self.status_code = status_code
            self._json_data = json_data
            self.text = text

        def json(self):
            return self._json_data

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            self._polls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, headers=None, json=None):
            assert url.endswith("/v1/images/omni-image")
            assert isinstance(json, dict)
            assert json.get("model_name") == "kling-v3-omni"
            assert json.get("prompt") == "hello"
            return FakeResponse(200, {"code": 0, "data": {"task_id": "task_series"}})

        async def get(self, url, headers=None):
            assert url.endswith("/v1/images/omni-image/task_series")
            self._polls += 1
            if self._polls == 1:
                return FakeResponse(200, {"code": 0, "data": {"task_status": "processing"}})
            return FakeResponse(
                200,
                {
                    "code": 0,
                    "data": {
                        "task_status": "succeed",
                        "task_result": {
                            "result_type": "series",
                            "series_images": [{"index": 0, "url": "https://example.com/series-1.png"}],
                        },
                    },
                },
            )

    monkeypatch.setattr(kling_mod.httpx, "AsyncClient", FakeAsyncClient)

    provider = KlingProvider(api_key="sk-test", base_url="https://api-beijing.klingai.com")
    req = ImageGenerationRequest(
        model="kling-v3-omni",
        prompt="hello",
        n=2,
        extra_body={"poll_interval_s": 0, "kling_payload": {"model_name": "kling-v3-omni", "prompt": "hello"}},
    )
    out = await provider.image_generation(req)
    assert out["data"][0]["url"] == "https://example.com/series-1.png"
