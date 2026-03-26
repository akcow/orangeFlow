#!/usr/bin/env python3
"""Set up a Langflow load-test environment without the removed API-key endpoint.

This helper authenticates with the standard login API, selects a starter
project, uploads it as a test flow, and saves a JWT access token for the
downstream load-test scripts.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time


async def get_starter_projects_from_api(host: str, access_token: str) -> list[dict]:
    """Return starter projects from the Langflow API."""
    import httpx

    url = f"{host.rstrip('/')}/api/v1/starter-projects/"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {access_token}"})
        if response.status_code == 401:
            response = await client.get(url)
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, list) else []


async def list_available_flows(host: str, access_token: str) -> list[tuple[str, str, str]]:
    """Return starter flow metadata."""
    projects = await get_starter_projects_from_api(host, access_token)
    known_projects = [
        ("Basic Prompting", "Basic Prompting", "A simple chat flow that is suitable for load testing."),
        ("Blog Writer", "Blog Writer", "Generates blog posts using referenced content."),
        ("Document Q&A", "Document Q&A", "Question and answer flow for uploaded documents."),
        ("Memory Chatbot", "Memory Chatbot", "Chat flow with conversation memory."),
        ("Vector Store RAG", "Vector Store RAG", "Retrieval-augmented generation starter flow."),
    ]
    if len(projects) == len(known_projects):
        return known_projects

    flows: list[tuple[str, str, str]] = []
    for index, _project in enumerate(projects):
        if index < len(known_projects):
            flows.append(known_projects[index])
        else:
            name = f"Starter Project {index + 1}"
            flows.append((name, name, "Starter project flow"))
    return flows


async def get_flow_data_by_name(host: str, access_token: str, flow_name: str) -> dict | None:
    """Look up one starter project by name."""
    projects = await get_starter_projects_from_api(host, access_token)
    flows = await list_available_flows(host, access_token)
    for index, (_flow_name, display_name, description) in enumerate(flows):
        if display_name.lower() == flow_name.lower() and index < len(projects):
            project = dict(projects[index])
            project["name"] = display_name
            project["description"] = description
            return project
    return None


async def select_flow_interactive(host: str, access_token: str) -> str | None:
    """Interactively select a starter flow."""
    flows = await list_available_flows(host, access_token)
    if not flows:
        print("No starter project flows found.")
        return None

    print("\nAvailable starter project flows")
    print("=" * 80)
    for index, (_flow_name, display_name, description) in enumerate(flows, 1):
        print(f"{index:2d}. {display_name}")
        print(f"    {description}")

    while True:
        try:
            choice = input(f"Select a flow (1-{len(flows)}) or 'q' to quit: ").strip()
            if choice.lower() == "q":
                return None
            selected = int(choice)
            if 1 <= selected <= len(flows):
                return flows[selected - 1][1]
        except ValueError:
            pass
        print("Please enter a valid number or 'q'.")


async def login_to_langflow(host: str, *, username: str = "langflow", password: str = "langflow") -> dict:
    """Authenticate and return the token payload."""
    import httpx

    async with httpx.AsyncClient(base_url=host, timeout=60.0) as client:
        health_response = await client.get("/health")
        if health_response.status_code != 200:
            raise RuntimeError(f"Health check failed: {health_response.status_code}")

        login_response = await client.post(
            "/api/v1/login",
            data={"username": username, "password": password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if login_response.status_code != 200:
            raise RuntimeError(f"Login failed: {login_response.status_code} - {login_response.text}")

        return login_response.json()


async def setup_langflow_environment(host: str, flow_name: str | None = None, interactive: bool = False) -> dict:
    """Authenticate, select a starter flow, and upload it for load testing."""
    try:
        import httpx
    except ImportError:
        print("Missing dependency: httpx")
        print("Install with: pip install httpx")
        sys.exit(1)

    username = "langflow"
    password = "langflow"
    setup_state = {
        "host": host,
        "username": username,
        "password": password,
        "access_token": None,
        "refresh_token": None,
        "flow_id": None,
        "flow_name": None,
        "flow_data": None,
    }

    tokens = await login_to_langflow(host, username=username, password=password)
    async with httpx.AsyncClient(base_url=host, timeout=60.0) as client:
        setup_state["access_token"] = tokens["access_token"]
        setup_state["refresh_token"] = tokens.get("refresh_token")

        if interactive:
            selected_flow_name = await select_flow_interactive(host, setup_state["access_token"])
            if not selected_flow_name:
                raise SystemExit(0)
        else:
            selected_flow_name = flow_name or "Basic Prompting"

        flow_data = await get_flow_data_by_name(host, setup_state["access_token"], selected_flow_name)
        if not flow_data:
            flows = await list_available_flows(host, setup_state["access_token"])
            available = ", ".join(name for _, name, _ in flows) or "none"
            raise RuntimeError(f"Flow '{selected_flow_name}' not found. Available flows: {available}")

        setup_state["flow_name"] = flow_data.get("name", selected_flow_name)
        setup_state["flow_data"] = flow_data

        upload_data = dict(flow_data)
        upload_data.pop("id", None)

        import re

        sanitized_name = re.sub(r"[^a-zA-Z0-9_-]", "_", setup_state["flow_name"].lower())
        upload_data["endpoint_name"] = f"loadtest_{int(time.time())}_{sanitized_name}"

        headers = {"Authorization": f"Bearer {setup_state['access_token']}"}
        flow_response = await client.post("/api/v1/flows/", json=upload_data, headers=headers)
        if flow_response.status_code != 201:
            raise RuntimeError(f"Flow upload failed: {flow_response.status_code} - {flow_response.text}")

        flow_info = flow_response.json()
        setup_state["flow_id"] = flow_info["id"]

    return setup_state


def print_setup_results(setup_state: dict):
    """Print setup results."""
    print("\n" + "=" * 80)
    print("SETUP COMPLETE - LOAD TEST CREDENTIALS")
    print("=" * 80)
    print(f"Host:         {setup_state['host']}")
    print(f"Username:     {setup_state['username']}")
    print(f"Password:     {setup_state['password']}")
    if setup_state.get("access_token"):
        print(f"Access Token: {setup_state['access_token'][:50]}...")
    print(f"Flow ID:      {setup_state['flow_id']}")
    print(f"Flow Name:    {setup_state['flow_name']}")
    print("=" * 80)

    print("\nSet environment variables:")
    print(f"export LANGFLOW_HOST='{setup_state['host']}'")
    print(f"export ACCESS_TOKEN='{setup_state['access_token']}'")
    print(f"export FLOW_ID='{setup_state['flow_id']}'")


def save_credentials(setup_state: dict, output_file: str):
    """Persist credentials for downstream scripts."""
    credentials = {
        "host": setup_state["host"],
        "flow_id": setup_state["flow_id"],
        "flow_name": setup_state["flow_name"],
        "username": setup_state["username"],
        "password": setup_state["password"],
        "access_token": setup_state["access_token"],
        "refresh_token": setup_state.get("refresh_token"),
        "created_at": time.time(),
    }
    with open(output_file, "w", encoding="utf-8") as file_handle:
        json.dump(credentials, file_handle, indent=2)
    print(f"\nCredentials saved to: {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Set up Langflow load test environment")
    parser.add_argument(
        "--host",
        default="http://localhost:7860",
        help="Langflow host URL (default: http://localhost:7860)",
    )
    parser.add_argument("--flow", help="Name of the starter project flow to use")
    parser.add_argument("--interactive", action="store_true", help="Interactive flow selection")
    parser.add_argument("--list-flows", action="store_true", help="List available starter project flows and exit")
    parser.add_argument("--save-credentials", metavar="FILE", help="Save credentials to a JSON file")
    args = parser.parse_args()

    try:
        if args.list_flows:
            async def list_flows_only():
                tokens = await login_to_langflow(args.host)
                flows = await list_available_flows(args.host, tokens["access_token"])
                print("\nAvailable starter project flows")
                print("=" * 80)
                for _flow_name, name, description in flows:
                    print(f"- {name}: {description}")

            asyncio.run(list_flows_only())
            return

        if not args.interactive and not args.flow:
            print("Either --interactive or --flow must be specified")
            sys.exit(1)

        setup_state = asyncio.run(
            setup_langflow_environment(host=args.host, flow_name=args.flow, interactive=args.interactive)
        )
        print_setup_results(setup_state)
        if args.save_credentials:
            save_credentials(setup_state, args.save_credentials)
    except KeyboardInterrupt:
        print("\nSetup cancelled by user")
        sys.exit(1)
    except SystemExit:
        raise
    except Exception as exc:
        print(f"\nSetup failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
