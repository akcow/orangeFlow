from langflow.api.v1.canvas_assistant import _extract_gemini_text, _normalize_key


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

