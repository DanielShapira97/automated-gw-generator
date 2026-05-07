"""
POST to the Jeenai-style completion API (same contract as completion-service.client.ts).

Request body matches the Nest client: { model, stream: false, messages } only.
Each message: { type: "message", role: "system"|"user", content: [{ type: "text", text: string }, ...] }.

Response: { outputText: string } (see generateAnswer in the TS client).
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

# Staging URL from your Swagger; override with COMPLETIONS_API_URL if needed.
DEFAULT_COMPLETIONS_API_URL = "https://completion.stg.jeenai.app/api/v1/completions"


def _parts_from_content(raw: Any) -> list[dict[str, Any]]:
    """Build content parts for the completion service (text + optional multimodal passthrough)."""
    if isinstance(raw, str):
        return [{"type": "text", "text": raw}]
    if isinstance(raw, list):
        parts: list[dict[str, Any]] = []
        for p in raw:
            if isinstance(p, str):
                parts.append({"type": "text", "text": p})
            elif isinstance(p, dict):
                if p.get("type") == "text" and "text" in p:
                    parts.append({"type": "text", "text": str(p["text"])})
                else:
                    # e.g. image_url blocks for vision — pass through if the API accepts them
                    parts.append(dict(p))
        return parts if parts else [{"type": "text", "text": ""}]
    if raw is None:
        return [{"type": "text", "text": ""}]
    return [{"type": "text", "text": str(raw)}]


def normalize_completion_service_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Match CompletionServiceMessage[] from completion-service.client.ts."""
    normalized: list[dict[str, Any]] = []
    for m in messages:
        if m.get("type") == "message" and isinstance(m.get("content"), list):
            role = m.get("role", "user")
            if role not in ("system", "user"):
                role = "user"
            normalized.append({"type": "message", "role": role, "content": m["content"]})
            continue

        role = m.get("role", "user")
        if role not in ("system", "user"):
            role = "user"
        parts = _parts_from_content(m.get("content"))
        normalized.append({"type": "message", "role": role, "content": parts})
    return normalized


def _extract_text(data: Any) -> str:
    if isinstance(data, str):
        return data
    if not isinstance(data, dict):
        return str(data)

    # Nest completion-service.client.ts: response.data.outputText
    out = data.get("outputText")
    if isinstance(out, str) and out.strip():
        return out

    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            msg = first.get("message")
            if isinstance(msg, dict) and msg.get("content"):
                return str(msg["content"])
            if first.get("text"):
                return str(first["text"])

    for key in ("output", "result", "text", "content", "response"):
        v = data.get(key)
        if isinstance(v, str) and v.strip():
            return v

    raise ValueError(
        "Could not parse completions JSON. Top-level keys: "
        + ", ".join(sorted(data.keys()))
    )


def complete_messages(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    max_output_tokens: int | None = None,
) -> str:
    """
    POST completions; body aligned with CompletionServiceClient (minimal fields).
    max_output_tokens is accepted for API compatibility but omitted unless
    COMPLETIONS_INCLUDE_OPTIONAL_FIELDS=1 (TS client does not send it).
    """
    url = os.getenv("COMPLETIONS_API_URL", "").strip() or DEFAULT_COMPLETIONS_API_URL
    resolved_model = model or os.getenv("COMPLETIONS_MODEL", "gpt-4o").strip()

    service_messages = normalize_completion_service_messages(messages)

    body: dict[str, Any] = {
        "model": resolved_model,
        "stream": False,
        "messages": service_messages,
    }

    if os.getenv("COMPLETIONS_INCLUDE_OPTIONAL_FIELDS", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        body["temperature"] = float(os.getenv("COMPLETIONS_TEMPERATURE", "0.7"))
        body["maxOutputTokens"] = max_output_tokens or int(
            os.getenv("COMPLETIONS_MAX_OUTPUT_TOKENS", "8192")
        )
        body["topP"] = float(os.getenv("COMPLETIONS_TOP_P", "1"))
        body["topK"] = int(os.getenv("COMPLETIONS_TOP_K", "40"))
        body["responseFormat"] = os.getenv("COMPLETIONS_RESPONSE_FORMAT", "text")

    extra = os.getenv("COMPLETIONS_EXTRA_JSON", "").strip()
    if extra:
        body.update(json.loads(extra))

    headers: dict[str, str] = {"Content-Type": "application/json"}
    bearer = os.getenv("COMPLETIONS_BEARER_TOKEN", "").strip()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"

    raw_headers = os.getenv("COMPLETIONS_EXTRA_HEADERS_JSON", "").strip()
    if raw_headers:
        headers.update(json.loads(raw_headers))

    timeout = float(os.getenv("COMPLETIONS_HTTP_TIMEOUT_SECONDS", "300"))

    with httpx.Client(timeout=timeout) as client:
        r = client.post(url, json=body, headers=headers)
        r.raise_for_status()
        payload = r.json()

    return _extract_text(payload)
