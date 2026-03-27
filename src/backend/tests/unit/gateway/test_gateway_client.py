from langflow.gateway.client import chat_completions, images_generations


class _DummyProvider:
    async def chat_completion(self, req):
        return {
            "id": "chatcmpl-test",
            "model": req.model,
            "choices": [{"message": {"role": "assistant", "content": "ok"}}],
        }

    async def image_generation(self, req):
        return {
            "created": 123,
            "model": req.model,
            "data": [{"url": f"https://example.com/{req.prompt}.png"}],
        }


def test_chat_completions_does_not_require_hosted_gateway_key(monkeypatch):
    monkeypatch.delenv("HOSTED_GATEWAY_KEY", raising=False)
    monkeypatch.setattr("langflow.gateway.client.resolve_provider", lambda model: ("dummy", _DummyProvider()))

    result = chat_completions(
        model="gpt-test",
        messages=[{"role": "user", "content": "hello"}],
    )

    assert result["id"] == "chatcmpl-test"
    assert result["choices"][0]["message"]["content"] == "ok"


def test_images_generations_does_not_require_hosted_gateway_key(monkeypatch):
    monkeypatch.delenv("HOSTED_GATEWAY_KEY", raising=False)
    monkeypatch.setattr("langflow.gateway.client.resolve_provider", lambda model: ("dummy", _DummyProvider()))

    result = images_generations(
        model="image-test",
        prompt="demo",
    )

    assert result["model"] == "image-test"
    assert result["data"][0]["url"] == "https://example.com/demo.png"
