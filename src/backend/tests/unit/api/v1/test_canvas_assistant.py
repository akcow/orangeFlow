from langflow.api.v1.canvas_assistant import (
    _extract_gemini_text,
    _extract_json_codeblock_or_raw,
    _is_public_http_url,
    _normalize_key,
)


def test_normalize_key_strips_bearer_and_whitespace():
    assert _normalize_key("  Bearer  abc  def \n") == "abcdef"


def test_normalize_key_returns_none_for_masked_key():
    assert _normalize_key("****") is None
    assert _normalize_key("  ****123 ") is None


def test_extract_gemini_text_joins_parts_and_skips_thought_parts():
    payload = {
        "candidates": [
            {
                "content": {
                    "role": "model",
                    "parts": [
                        {"thought": True, "text": "should not appear"},
                        {"text": "Hello"},
                        {"text": "world"},
                        {"text": "  "},
                    ],
                }
            }
        ]
    }

    assert _extract_gemini_text(payload) == "Hello\nworld"


def test_extract_json_codeblock_or_raw_prefers_json_fence():
    text = "hello\n```json\n{\"a\": 1}\n```\nbye"
    assert _extract_json_codeblock_or_raw(text) == "{\"a\": 1}"


def test_extract_json_codeblock_or_raw_accepts_raw_object():
    assert _extract_json_codeblock_or_raw("{\"ok\":true}") == "{\"ok\":true}"


def test_is_public_http_url_blocks_localhost_and_private_ips():
    assert _is_public_http_url("http://localhost/x.png") is False
    assert _is_public_http_url("http://127.0.0.1/x.png") is False
    assert _is_public_http_url("http://10.0.0.2/x.png") is False


def test_is_public_http_url_allows_public_ip_host():
    assert _is_public_http_url("https://8.8.8.8/x.png") is True
