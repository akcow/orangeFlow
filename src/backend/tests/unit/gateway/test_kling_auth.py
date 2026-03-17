from jose import jwt


def test_build_kling_bearer_token_uses_official_claims():
    from langflow.gateway.kling_auth import build_kling_bearer_token

    token = build_kling_bearer_token(access_key="ak-unit", secret_key="sk-unit", now_ts=1_700_000_000)
    header = jwt.get_unverified_header(token)
    claims = jwt.get_unverified_claims(token)

    assert header == {"alg": "HS256", "typ": "JWT"}
    assert claims["iss"] == "ak-unit"
    assert claims["exp"] == 1_700_001_800
    assert claims["nbf"] == 1_699_999_995


def test_build_kling_bearer_token_from_value_supports_json_pair():
    from langflow.gateway.kling_auth import build_kling_bearer_token_from_value

    token = build_kling_bearer_token_from_value(
        '{"access_key":"ak-json","secret_key":"sk-json"}',
        now_ts=1_700_000_000,
    )

    claims = jwt.get_unverified_claims(token)
    assert claims["iss"] == "ak-json"


def test_build_kling_bearer_token_from_value_supports_multiline_pair():
    from langflow.gateway.kling_auth import build_kling_bearer_token_from_value

    token = build_kling_bearer_token_from_value(
        "AccessKey=ak-lines\nSecretKey=sk-lines",
        now_ts=1_700_000_000,
    )

    claims = jwt.get_unverified_claims(token)
    assert claims["iss"] == "ak-lines"
