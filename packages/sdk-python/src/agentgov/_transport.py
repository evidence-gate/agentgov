"""
AgentgovTransport — httpx.BaseTransport subclass for agentgov governance proxy.

Responsibilities:
1. URL rewriting: replaces scheme+host+port of every outgoing request with
   ``proxy_url``, preserving path and query string.
2. Header injection: adds ``X-Agent-Id`` header to every proxied request.
3. Governance exception raising:
   - HTTP 429 + error.code == 'BUDGET_EXCEEDED' -> raises BudgetExceeded
   - HTTP 202 + error.code == 'HITL_PENDING'    -> raises HitlPending
   - HTTP 502 + error.code == 'AGENT_ERROR'     -> raises AgentError
4. Pass-through: all other responses returned as-is (including normal 429, 502).

Phase 4 MVP: SYNC only. AsyncBaseTransport is deferred.
"""
from __future__ import annotations

import json
from typing import Any, Optional

import httpx

from ._exceptions import AgentError, BudgetExceeded, HitlPending


class AgentgovTransport(httpx.BaseTransport):
    """
    httpx transport that routes requests through the agentgov proxy.

    Parameters
    ----------
    proxy_url:
        Base URL of the agentgov proxy (e.g. ``"http://localhost:8787"``).
        Trailing slashes are stripped.
    agent_id:
        Agent identifier injected as the ``X-Agent-Id`` header.
    _inner:
        Optional inner transport override for testing.  If not provided, an
        ``httpx.HTTPTransport`` is created automatically.
    **kwargs:
        Forwarded to ``httpx.HTTPTransport`` when ``_inner`` is not provided.
    """

    def __init__(
        self,
        proxy_url: str,
        agent_id: str,
        _inner: Optional[httpx.BaseTransport] = None,
        **kwargs: Any,
    ) -> None:
        self._proxy_url = proxy_url.rstrip("/")
        self._agent_id = agent_id
        self._inner: httpx.BaseTransport = _inner if _inner is not None else httpx.HTTPTransport(**kwargs)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        """Rewrite URL, inject header, forward, then inspect governance codes."""
        # --- 1. Rewrite URL ---
        original_url = request.url
        # Build new URL using proxy base, preserving path + raw query
        new_url = httpx.URL(
            scheme=httpx.URL(self._proxy_url).scheme,
            host=httpx.URL(self._proxy_url).host,
            port=httpx.URL(self._proxy_url).port,
            path=original_url.path,
            query=original_url.query if original_url.query else b"",
        )

        # --- 2. Inject X-Agent-Id header ---
        headers = dict(request.headers)
        headers["x-agent-id"] = self._agent_id

        rewritten = httpx.Request(
            method=request.method,
            url=new_url,
            headers=headers,
            content=request.content,
        )

        # --- 3. Forward request ---
        response = self._inner.handle_request(rewritten)

        # --- 4. Inspect response — must read body before checking ---
        # Read the entire body so we can inspect it; we reconstruct the
        # response object if we need to pass it through unchanged.
        response.read()
        content = response.content

        status = response.status_code

        if status in (202, 429, 502):
            try:
                body = json.loads(content)
                error_dict = body.get("error") if isinstance(body, dict) else None
                if isinstance(error_dict, dict):
                    code = error_dict.get("code")
                    if status == 429 and code == "BUDGET_EXCEEDED":
                        raise BudgetExceeded(error_dict)
                    if status == 202 and code == "HITL_PENDING":
                        raise HitlPending(error_dict)
                    if status == 502 and code == "AGENT_ERROR":
                        raise AgentError(error_dict)
            except (json.JSONDecodeError, KeyError):
                pass  # Non-JSON or missing fields — pass through

        # Reconstruct response with already-read content (stream is consumed)
        return httpx.Response(
            status_code=response.status_code,
            headers=response.headers,
            content=content,
        )

    def close(self) -> None:
        """Close the wrapped transport."""
        self._inner.close()
