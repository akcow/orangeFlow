import pytest

# This file is an ad-hoc integration script (requires a running server at BASE_URL).
pytest.skip("integration script; requires running Langflow server", allow_module_level=True)

import httpx
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://localhost:7860"
# Use HOSTED_GATEWAY_KEY or a dummy one. 
# If auth is strictly checked against DB, we might fail if we don't have a valid key.
# But I can try to use a key that I know exists or passed in .env
API_KEY = os.getenv("HOSTED_GATEWAY_KEY", "sk-test-1234567890")

HEADERS = {
    "Authorization": f"Bearer {API_KEY}"
}

async def test_compat_endpoints():
    async with httpx.AsyncClient(timeout=10.0) as client:
        print(f"Testing Gateway at {BASE_URL} with Key: {API_KEY[:5]}***")

        # 1. Test /model/types
        try:
            resp = await client.get(f"{BASE_URL}/model/types", headers=HEADERS)
            print(f"GET /model/types: {resp.status_code}")
            if resp.status_code == 200:
                print("  Response:", resp.json())
            else:
                print("  Error:", resp.text)
        except Exception as e:
            print(f"  Request failed: {e}")

        # 2. Test /model/page
        try:
            resp = await client.get(f"{BASE_URL}/model/page", headers=HEADERS)
            print(f"GET /model/page: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                print(f"  Records found: {len(data['data']['records'])}")
                # print("  Data:", data)
            else:
                print("  Error:", resp.text)
        except Exception as e:
            print(f"  Request failed: {e}")

        # 3. Test /v1/videos with basic JSON (Standard)
        # Verify it still works? Or we only care about Form?
        # Let's test Form Data (Huobao Canvas Style)
        print("\nTesting /v1/videos (Form Data)...")
        try:
            # mimic form data
            form_data = {
                "model": "sora-2", 
                "prompt": "A beautiful sunset over the ocean",
                "ratio": "16:9",
                "duration": 5
            }
            # Attach an empty file to test multipart
            files = {
                # "image": ("test.png", b"fake_image_bytes", "image/png") 
            }
            # Note: client.post(..., data=form_data, files=files) sends multipart/form-data
            # If files is empty but data is present, httpx might use application/x-www-form-urlencoded
            # huobao-canvas uses FormData object which implies multipart if file is there?
            # Or just multipart always?
            # Let's force multipart by including a dummy file field even if None?
            # Or just rely on httpx handling.
            
            # To simulate exact frontend behavior with NO image (Text-to-Video):
            # It might send just fields.
            resp = await client.post(
                f"{BASE_URL}/v1/videos", 
                headers={"Authorization": f"Bearer {API_KEY}"}, # Do NOT set Content-Type manually for multipart
                data=form_data
            )
            print(f"POST /v1/videos (Form): {resp.status_code}")
            if resp.status_code == 200:
                print("  Response:", resp.json())
            else:
                print("  Error:", resp.text)
                
        except Exception as e:
            print(f"  Request failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_compat_endpoints())
