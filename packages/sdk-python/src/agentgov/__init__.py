"""
agentgov Python SDK
===================

Enable Python developers to route OpenAI / Anthropic SDK requests through the
agentgov governance proxy with a single call::

    import agentgov
    from openai import OpenAI

    client = agentgov.wrap(OpenAI(), proxy_url="http://localhost:8787", agent_id="my-agent")
    # All subsequent requests are intercepted and cost-enforced.

Exceptions
----------
- ``BudgetExceeded`` — raised when the proxy blocks a request due to budget exhaustion
- ``HitlPending``    — raised when the proxy pauses a request for human approval
- ``AgentError``     — raised when the proxy reports a terminal agent error

Alternative (recommended for production)
-----------------------------------------
Construct the SDK client directly with the agentgov proxy URL::

    from openai import OpenAI
    client = OpenAI(
        base_url="http://localhost:8787/v1",
        default_headers={"X-Agent-Id": "my-agent"},
    )

This avoids private-attribute mutation entirely.
"""
from __future__ import annotations

from typing import Any

import httpx

from ._exceptions import AgentError, BudgetExceeded, HitlPending
from ._transport import AgentgovTransport
from ._async_transport import AsyncAgentgovTransport

__all__ = [
    "wrap",
    "wrap_async",
    "BudgetExceeded",
    "HitlPending",
    "AgentError",
    "AgentgovTransport",
    "AsyncAgentgovTransport",
]


def wrap(client: Any, *, proxy_url: str, agent_id: str) -> Any:
    """
    Patch *client* so that all HTTP requests are routed through the agentgov
    governance proxy at *proxy_url* with *agent_id* injected as ``X-Agent-Id``.

    Both ``openai.OpenAI`` and ``anthropic.Anthropic`` store their httpx client
    as ``client._client`` — this function replaces that attribute in-place and
    returns the mutated client for convenience::

        client = agentgov.wrap(OpenAI(), proxy_url="http://localhost:8787", agent_id="bot-1")

    .. note::
        This uses private-attribute mutation. For production use, prefer
        constructing the client with ``http_client=httpx.Client(transport=...)``
        or by setting ``base_url`` directly.

    Parameters
    ----------
    client:
        An ``openai.OpenAI`` or ``anthropic.Anthropic`` (or compatible) client
        instance.
    proxy_url:
        Base URL of the agentgov proxy.
    agent_id:
        Identifier for the agent making requests.

    Returns
    -------
    The same *client* object, mutated in-place.
    """
    transport = AgentgovTransport(proxy_url=proxy_url, agent_id=agent_id)
    http_client = httpx.Client(transport=transport)
    client._client = http_client
    return client


def wrap_async(client: Any, *, proxy_url: str, agent_id: str) -> Any:
    """
    Patch *client* so that all async HTTP requests are routed through the
    agentgov governance proxy at *proxy_url* with *agent_id* injected as
    ``X-Agent-Id``.

    Both ``openai.AsyncOpenAI`` and ``anthropic.AsyncAnthropic`` store their
    httpx async client as ``client._client`` — this function replaces that
    attribute in-place and returns the mutated client for convenience::

        client = agentgov.wrap_async(
            AsyncOpenAI(), proxy_url="http://localhost:8787", agent_id="bot-1"
        )

    .. note::
        This uses private-attribute mutation. For production use, prefer
        constructing the client with ``http_client=httpx.AsyncClient(transport=...)``
        or by setting ``base_url`` directly.

        Never use ``asyncio.run()`` inside the async transport — it will crash
        in any running async context. This function is safe to call synchronously
        during client setup (before any async calls begin).

    Parameters
    ----------
    client:
        An ``openai.AsyncOpenAI`` or ``anthropic.AsyncAnthropic`` (or compatible)
        async client instance.
    proxy_url:
        Base URL of the agentgov proxy.
    agent_id:
        Identifier for the agent making requests.

    Returns
    -------
    The same *client* object, mutated in-place.
    """
    transport = AsyncAgentgovTransport(proxy_url=proxy_url, agent_id=agent_id)
    http_client = httpx.AsyncClient(transport=transport)
    client._client = http_client
    return client
