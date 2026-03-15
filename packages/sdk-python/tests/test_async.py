"""
Tests for agentgov Python async SDK.

Covers:
- AsyncAgentgovTransport: URL rewriting, header injection, governance exception raising
- Pass-through behavior for non-governance status codes
- aclose() lifecycle
- wrap_async() patches async client's httpx attribute

All async tests use asyncio_mode = "auto" (no @pytest.mark.asyncio needed).
"""
import json
import pytest
import httpx

from agentgov import BudgetExceeded, HitlPending, AgentError
from agentgov._async_transport import AsyncAgentgovTransport


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class AsyncMockTransport(httpx.AsyncBaseTransport):
    """Minimal async transport that returns a pre-built response."""

    def __init__(self, status_code: int, body: dict | None = None, headers: dict | None = None):
        self.status_code = status_code
        self.body = body or {}
        self.headers = headers or {}
        self.last_request: httpx.Request | None = None

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.last_request = request
        content = json.dumps(self.body).encode()
        return httpx.Response(
            status_code=self.status_code,
            headers={"content-type": "application/json", **self.headers},
            content=content,
        )

    async def aclose(self) -> None:
        pass


def make_async_transport(
    status_code: int,
    body: dict | None = None,
    proxy_url: str = "http://proxy.example.com",
    agent_id: str = "agent-test-01",
) -> tuple[AsyncAgentgovTransport, AsyncMockTransport]:
    """Return (AsyncAgentgovTransport, inner AsyncMockTransport) pair."""
    inner = AsyncMockTransport(status_code=status_code, body=body)
    transport = AsyncAgentgovTransport(proxy_url=proxy_url, agent_id=agent_id, _inner=inner)
    return transport, inner


# ---------------------------------------------------------------------------
# URL rewriting
# ---------------------------------------------------------------------------

async def test_async_transport_rewrites_url():
    """AsyncAgentgovTransport rewrites scheme+host+port to proxy_url, preserves path."""
    transport, inner = make_async_transport(200, {"id": "chatcmpl-1"})
    async with httpx.AsyncClient(transport=transport) as client:
        await client.post("https://api.openai.com/v1/chat/completions", content=b"{}")
    assert inner.last_request is not None
    url = str(inner.last_request.url)
    assert url.startswith("http://proxy.example.com")
    assert "/v1/chat/completions" in url


async def test_async_transport_preserves_path_and_query():
    """Path and query string are preserved after rewriting."""
    transport, inner = make_async_transport(200, {})
    async with httpx.AsyncClient(transport=transport) as client:
        await client.post("https://api.openai.com/v1/chat/completions?foo=bar", content=b"{}")
    assert inner.last_request is not None
    url = str(inner.last_request.url)
    assert "/v1/chat/completions" in url
    assert "foo=bar" in url


# ---------------------------------------------------------------------------
# Header injection
# ---------------------------------------------------------------------------

async def test_async_transport_injects_agent_id():
    """x-agent-id header is injected into the rewritten request."""
    transport, inner = make_async_transport(200, {}, agent_id="my-async-agent")
    async with httpx.AsyncClient(transport=transport) as client:
        await client.post("https://api.openai.com/v1/chat/completions", content=b"{}")
    assert inner.last_request is not None
    assert inner.last_request.headers.get("x-agent-id") == "my-async-agent"


# ---------------------------------------------------------------------------
# Governance exception raising
# ---------------------------------------------------------------------------

async def test_async_transport_raises_budget_exceeded():
    """HTTP 429 + BUDGET_EXCEEDED code raises BudgetExceeded with correct fields."""
    body = {
        "error": {
            "code": "BUDGET_EXCEEDED",
            "message": "Budget exceeded",
            "budgetId": "agent-abc",
            "spent": 12.50,
            "limit": 10.00,
        }
    }
    transport, _ = make_async_transport(429, body)
    with pytest.raises(BudgetExceeded) as exc_info:
        async with httpx.AsyncClient(transport=transport) as client:
            await client.post("https://api.openai.com/v1/chat/completions", content=b"{}")
    exc = exc_info.value
    assert exc.code == "BUDGET_EXCEEDED"
    assert exc.spent == 12.50
    assert exc.limit == 10.00
    assert exc.budget_id == "agent-abc"


async def test_async_transport_raises_hitl_pending():
    """HTTP 202 + HITL_PENDING code raises HitlPending with correct fields."""
    body = {
        "error": {
            "code": "HITL_PENDING",
            "message": "Approval required",
            "approvalId": "appr-xyz",
            "agentId": "agent-abc",
            "expiresAt": 1700000000000,
        }
    }
    transport, _ = make_async_transport(202, body)
    with pytest.raises(HitlPending) as exc_info:
        async with httpx.AsyncClient(transport=transport) as client:
            await client.post("https://api.openai.com/v1/messages", content=b"{}")
    exc = exc_info.value
    assert exc.code == "HITL_PENDING"
    assert exc.approval_id == "appr-xyz"
    assert exc.agent_id == "agent-abc"
    assert exc.expires_at == 1700000000000


async def test_async_transport_raises_agent_error():
    """HTTP 502 + AGENT_ERROR code raises AgentError with correct fields."""
    body = {
        "error": {
            "code": "AGENT_ERROR",
            "message": "Retry exhausted",
            "type": "retry_exhausted",
            "agentId": "agent-abc",
            "timestamp": 1700000000,
            "suggestedRemediation": "Try again later",
            "context": {"originalStatus": 503},
        }
    }
    transport, _ = make_async_transport(502, body)
    with pytest.raises(AgentError) as exc_info:
        async with httpx.AsyncClient(transport=transport) as client:
            await client.post("https://api.openai.com/v1/chat/completions", content=b"{}")
    exc = exc_info.value
    assert exc.code == "AGENT_ERROR"
    assert exc.type == "retry_exhausted"
    assert exc.agent_id == "agent-abc"
    assert exc.timestamp == 1700000000
    assert exc.suggested_remediation == "Try again later"
    assert exc.context == {"originalStatus": 503}


# ---------------------------------------------------------------------------
# Pass-through for non-governance codes
# ---------------------------------------------------------------------------

async def test_async_transport_passes_normal_429():
    """Non-governance 429 (RATE_LIMIT_EXCEEDED) passes through without exception."""
    body = {"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests"}}
    transport, _ = make_async_transport(429, body)
    async with httpx.AsyncClient(transport=transport) as client:
        response = await client.post("https://api.openai.com/v1/chat/completions", content=b"{}")
    assert response.status_code == 429


async def test_async_transport_passes_normal_202():
    """Non-governance 202 passes through without exception."""
    body = {"status": "accepted", "id": "job-123"}
    transport, _ = make_async_transport(202, body)
    async with httpx.AsyncClient(transport=transport) as client:
        response = await client.post("https://api.openai.com/v1/chat/completions", content=b"{}")
    assert response.status_code == 202


async def test_async_transport_passes_normal_502():
    """Non-governance 502 passes through without exception."""
    body = {"error": "Bad Gateway"}
    transport, _ = make_async_transport(502, body)
    async with httpx.AsyncClient(transport=transport) as client:
        response = await client.post("https://api.openai.com/v1/chat/completions", content=b"{}")
    assert response.status_code == 502


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

async def test_async_transport_aclose():
    """aclose() does not raise."""
    transport, _ = make_async_transport(200, {})
    await transport.aclose()  # should not raise


# ---------------------------------------------------------------------------
# wrap_async
# ---------------------------------------------------------------------------

async def test_wrap_async_patches_client():
    """wrap_async() sets client._client to an AsyncClient with AsyncAgentgovTransport."""
    from agentgov import wrap_async

    class FakeAsyncClient:
        _client = None

    fake = FakeAsyncClient()
    result = wrap_async(fake, proxy_url="http://proxy.example.com", agent_id="agent-007")

    assert result is fake
    assert isinstance(result._client, httpx.AsyncClient)
    # Verify the transport inside the AsyncClient is our AsyncAgentgovTransport
    assert isinstance(result._client._transport, AsyncAgentgovTransport)
