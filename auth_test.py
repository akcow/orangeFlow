
import os
import sys
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Verify path setup
sys.path.insert(0, r"c:\Users\wang\Desktop\新建文件夹 (2)\src\backend\base")

from langflow.gateway.router import router
from langflow.api.utils import DbSession

app = FastAPI()
app.include_router(router)

# Mock DbSession
async def mock_db_session():
    yield MagicMock()

app.dependency_overrides[DbSession] = mock_db_session

client = TestClient(app)

def test_db_key_auth():
    # 1. Setup Mock for crud.check_key
    # We need to patch where it is IMPORTED in auth.py, or the function itself
    with patch("langflow.gateway.auth.check_key", new_callable=AsyncMock) as mock_check:
        # Scenario 1: Valid DB Key
        mock_check.return_value = MagicMock(username="testuser") # Returns User object
        
        response = client.get("/v1/models", headers={"Authorization": "Bearer sk-valid-db-key"})
        print(f"Valid DB Key Response: {response.status_code}")
        assert response.status_code == 200
        
        # Verify check_key was called
        mock_check.assert_called_once()
        
    with patch("langflow.gateway.auth.check_key", new_callable=AsyncMock) as mock_check_fail:
        # Scenario 2: Invalid Key
        mock_check_fail.return_value = None
        
        response = client.get("/v1/models", headers={"Authorization": "Bearer sk-invalid-key"})
        print(f"Invalid Key Response: {response.status_code}")
        assert response.status_code == 401

if __name__ == "__main__":
    try:
        test_db_key_auth()
        print("AUTH TESTS PASSED")
    except Exception as e:
        print(f"TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
