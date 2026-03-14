"""
Tests for agentgov Python SDK.

Covers:
- Exception classes: BudgetExceeded, HitlPending, AgentError field contracts
- AgentgovTransport: URL rewriting, header injection, governance exception raising
- Pass-through behavior for non-governance status codes
"""
import json
import pytest
import httpx

from agentgov import BudgetExceeded, HitlPending, AgentError
from agentgov._transport import AgentgovTransport


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MockTransport(httpx.BaseTransport):
    """Minimal transport that returns a pre-built response."""

    def __init__(self, status_code: int, body: dict | None = None, headers: dict | None = None):
        self.status_code = status_code
        self.body = body or {}
        self.headers = headers or {}
        self.last_request: httpx.Request | None = None

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.last_request = request
        content = json.dumps(self.body).encode()
        return httpx.Response(
            status_code=self.status_code,
            headers={"content-type": "application/json", **self.headers},
            content=content,
        )


def make_transport(
    status_code: int,
    body: dict | None = None,
    proxy_url: str = "http://proxy.example.com",
    agent_id: str = "agent-test-01",
) -> tuple[AgentgovTransport, MockTransport]:
    """Return (AgentgovTransport, inner MockTransport) pair."""
    inner = MockTransport(status_code=status_code, body=body)
    transport = AgentgovTransport(proxy_url=proxy_url, agent_id=agent_id, _inner=inner)
    return transport, inner


def send(transport: AgentgovTransport, url: str = "https://api.openai.com/v1/chat/completions") -> httpx.Response:
    """Send a minimal POST request through the given transport."""
    request = httpx.Request("POST", url, content=b"{}")
    return transport.handle_request(request)


# ---------------------------------------------------------------------------
# Exception field tests
# ---------------------------------------------------------------------------

class TestBudgetExceeded:
    def test_budget_exceeded_fields(self):
        error_dict = {
            "code": "BUDGET_EXCEEDED",
            "message": "Budget exceeded",
            "budgetId": "agent-abc",
            "spent": 12.50,
            "limit": 10.00,
        }
        exc = BudgetExceeded(error_dict)
        assert exc.code == "BUDGET_EXCEEDED"
        assert exc.spent == 12.50
        assert exc.limit == 10.00
        assert exc.budget_id == "agent-abc"
        assert "Budget exceeded" in str(exc)

    def test_budget_exceeded_is_exception(self):
        exc = BudgetExceeded({"code": "BUDGET_EXCEEDED", "message": "x", "budgetId": "b", "spent": 1.0, "limit": 1.0})
        assert isinstance(exc, Exception)


class TestHitlPending:
    def test_hitl_pending_fields(self):
        error_dict = {
            "code": "HITL_PENDING",
            "message": "Approval required",
            "approvalId": "appr-xyz",
            "agentId": "agent-abc",
            "expiresAt": 1700000000000,
        }
        exc = HitlPending(error_dict)
        assert exc.code == "HITL_PENDING"
        assert exc.approval_id == "appr-xyz"
        assert exc.agent_id == "agent-abc"
        assert exc.expires_at == 1700000000000
        assert "Approval required" in str(exc)

    def test_hitl_pending_is_exception(self):
        exc = HitlPending({"code": "HITL_PENDING", "message": "x", "approvalId": "a", "agentId": "b", "expiresAt": 0})
        assert isinstance(exc, Exception)


class TestAgentError:
    def test_agent_error_fields(self):
        error_dict = {
            "code": "AGENT_ERROR",
            "message": "Retry exhausted",
            "type": "retry_exhausted",
            "agentId": "agent-abc",
            "timestamp": 1700000000,
            "suggestedRemediation": "Check your API key",
            "context": {"originalStatus": 503},
        }
        exc = AgentError(error_dict)
        assert exc.code == "AGENT_ERROR"
        assert exc.type == "retry_exhausted"
        assert exc.agent_id == "agent-abc"
        assert exc.timestamp == 1700000000
        assert exc.suggested_remediation == "Check your API key"
        assert exc.context == {"originalStatus": 503}
        assert "Retry exhausted" in str(exc)

    def test_agent_error_context_optional(self):
        error_dict = {
            "code": "AGENT_ERROR",
            "message": "err",
            "type": "permanent_error",
            "agentId": "a",
            "timestamp": 0,
            "suggestedRemediation": "none",
        }
        exc = AgentError(error_dict)
        assert exc.context is None

    def test_agent_error_is_exception(self):
        exc = AgentError({"code": "AGENT_ERROR", "message": "x", "type": "permanent_error", "agentId": "a", "timestamp": 0, "suggestedRemediation": ""})
        assert isinstance(exc, Exception)


# ---------------------------------------------------------------------------
# Transport URL rewriting
# ---------------------------------------------------------------------------

class TestTransportUrlRewrite:
    def test_transport_rewrites_url(self):
        transport, inner = make_transport(200, {"id": "chatcmpl-1"})
        send(transport, "https://api.openai.com/v1/chat/completions")
        assert inner.last_request is not None
        url = str(inner.last_request.url)
        assert url.startswith("http://proxy.example.com")
        assert "/v1/chat/completions" in url

    def test_transport_rewrites_host_part(self):
        transport, inner = make_transport(200, {})
        send(transport, "https://api.anthropic.com/v1/messages")
        url = str(inner.last_request.url)
        assert "api.anthropic.com" not in url
        assert "proxy.example.com" in url

    def test_transport_preserves_path_and_query(self):
        transport, inner = make_transport(200, {})
        send(transport, "https://api.openai.com/v1/chat/completions?foo=bar")
        url = str(inner.last_request.url)
        assert "/v1/chat/completions" in url
        assert "foo=bar" in url


# ---------------------------------------------------------------------------
# Transport header injection
# ---------------------------------------------------------------------------

class TestTransportHeaderInjection:
    def test_transport_injects_agent_id(self):
        transport, inner = make_transport(200, {}, agent_id="my-agent-007")
        send(transport)
        assert inner.last_request is not None
        assert inner.last_request.headers.get("x-agent-id") == "my-agent-007"


# ---------------------------------------------------------------------------
# Transport governance exception raising
# ---------------------------------------------------------------------------

class TestTransportGovernanceExceptions:
    def test_transport_raises_budget_exceeded(self):
        body = {
            "error": {
                "code": "BUDGET_EXCEEDED",
                "message": "Budget exceeded",
                "budgetId": "agent-abc",
                "spent": 12.50,
                "limit": 10.00,
            }
        }
        transport, _ = make_transport(429, body)
        with pytest.raises(BudgetExceeded) as exc_info:
            send(transport)
        exc = exc_info.value
        assert exc.code == "BUDGET_EXCEEDED"
        assert exc.spent == 12.50
        assert exc.limit == 10.00
        assert exc.budget_id == "agent-abc"

    def test_transport_passes_normal_429(self):
        """Non-governance 429 (rate limit) must pass through without raising."""
        body = {"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests"}}
        transport, _ = make_transport(429, body)
        response = send(transport)
        assert response.status_code == 429

    def test_transport_raises_hitl_pending(self):
        body = {
            "error": {
                "code": "HITL_PENDING",
                "message": "Approval required",
                "approvalId": "appr-xyz",
                "agentId": "agent-abc",
                "expiresAt": 1700000000000,
            }
        }
        transport, _ = make_transport(202, body)
        with pytest.raises(HitlPending) as exc_info:
            send(transport)
        exc = exc_info.value
        assert exc.code == "HITL_PENDING"
        assert exc.approval_id == "appr-xyz"
        assert exc.agent_id == "agent-abc"

    def test_transport_passes_normal_202(self):
        """202 without HITL_PENDING must pass through."""
        body = {"status": "accepted", "id": "job-123"}
        transport, _ = make_transport(202, body)
        response = send(transport)
        assert response.status_code == 202

    def test_transport_raises_agent_error(self):
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
        transport, _ = make_transport(502, body)
        with pytest.raises(AgentError) as exc_info:
            send(transport)
        exc = exc_info.value
        assert exc.code == "AGENT_ERROR"
        assert exc.type == "retry_exhausted"
        assert exc.suggested_remediation == "Try again later"

    def test_transport_passes_normal_502(self):
        """502 without AGENT_ERROR code must pass through."""
        body = {"error": "Bad Gateway"}
        transport, _ = make_transport(502, body)
        response = send(transport)
        assert response.status_code == 502


# ---------------------------------------------------------------------------
# Transport close
# ---------------------------------------------------------------------------

class TestTransportClose:
    def test_transport_close(self):
        """close() must not raise."""
        transport, _ = make_transport(200, {})
        transport.close()  # should not raise
