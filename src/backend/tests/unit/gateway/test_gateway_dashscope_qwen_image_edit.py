import pytest


@pytest.mark.asyncio
async def test_dashscope_qwen_image_edit_uses_multimodal_sync_and_image_first(monkeypatch):
    from langflow.gateway.providers import dashscope as dashscope_mod
    from langflow.gateway.providers.dashscope import DashScopeProvider
    from langflow.gateway.schemas import ImageGenerationRequest

    calls: list[tuple[str, str, dict]] = []

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
            calls.append(("post", url, json or {}))
            return FakeResponse(
                200,
                {
                    "output": {
                        "choices": [
                            {
                                "message": {
                                    "content": [
                                        {"image": "https://example.com/1.png"},
                                        {"image": "https://example.com/2.png"},
                                    ]
                                }
                            }
                        ]
                    }
                },
            )

        async def get(self, url, headers=None, timeout=None):
            raise AssertionError("qwen-image-edit should not use async polling in this test")

    monkeypatch.setattr(dashscope_mod.httpx, "AsyncClient", FakeAsyncClient)

    provider = DashScopeProvider(api_key="sk-test", base_url="https://dashscope.aliyuncs.com")
    req = ImageGenerationRequest(
        model="qwen-image-edit-max",
        prompt="do edit",
        n=2,
        extra_body={"images": ["data:image/png;base64,AAA", "data:image/png;base64,BBB"]},
    )
    out = await provider.image_generation(req)

    assert out["data"][0]["url"] == "https://example.com/1.png"
    assert out["data"][1]["url"] == "https://example.com/2.png"
    assert len([c for c in calls if c[0] == "post"]) == 1

    _method, url, body = calls[0]
    assert url.endswith("/api/v1/services/aigc/multimodal-generation/generation")
    assert body["model"] == "qwen-image-edit-max"

    content = body["input"]["messages"][0]["content"]
    assert content[0] == {"image": "data:image/png;base64,AAA"}
    assert content[1] == {"image": "data:image/png;base64,BBB"}
    assert content[2] == {"text": "do edit"}

    params = body["parameters"]
    assert params["n"] == 2
    assert "enable_interleave" not in params

