"""Unit tests for the optional LLM narrative-understanding engine.

No live Anthropic API key exists in this development sandbox for this
application to use (see llm_engine.py's honesty notes), so every "success"
path here mocks the Anthropic client's response shape rather than hitting
the real API. This verifies the code that's actually ours - schema
correctness, response parsing, score clamping, and every degradation path -
not the model's real judgment, which only a live key can exercise.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.engines import llm_engine


def _mock_tool_response(data: dict):
    tool_block = SimpleNamespace(type="tool_use", input=data)
    return SimpleNamespace(content=[tool_block])


def test_analyze_with_no_api_key_is_unavailable():
    with patch("app.engines.llm_engine.get_settings") as mock_settings:
        mock_settings.return_value = SimpleNamespace(anthropic_api_key=None, narrative_llm_model="x")
        result = llm_engine.analyze("something happened")
    assert result.available is False
    assert result.error == "no_api_key_configured"


def test_analyze_with_empty_text_is_unavailable():
    result = llm_engine.analyze("")
    assert result.available is False
    assert result.error == "empty_text"
    result = llm_engine.analyze("   ")
    assert result.available is False


def test_analyze_success_parses_and_clamps_scores():
    good_data = {cat: 40 for cat in llm_engine.CATEGORIES}
    good_data["threat"] = 999  # out-of-range high, must clamp to 100
    good_data["trauma"] = -5  # out-of-range low, must clamp to 0
    good_data["rationale"] = "Test rationale."

    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_tool_response(good_data)

    with patch("app.engines.llm_engine._client", return_value=mock_client), \
         patch("app.engines.llm_engine.get_settings") as mock_settings:
        mock_settings.return_value = SimpleNamespace(anthropic_api_key="fake-key", narrative_llm_model="claude-haiku-4-5-20251001")
        result = llm_engine.analyze("a real narrative")

    assert result.available is True
    assert result.scores["threat"] == 100.0
    assert result.scores["trauma"] == 0.0
    assert result.scores["fear"] == 40.0
    assert result.rationale == "Test rationale."
    assert result.model == "claude-haiku-4-5-20251001"


def test_analyze_degrades_on_api_exception():
    mock_client = MagicMock()
    mock_client.messages.create.side_effect = RuntimeError("network unreachable")

    with patch("app.engines.llm_engine._client", return_value=mock_client), \
         patch("app.engines.llm_engine.get_settings") as mock_settings:
        mock_settings.return_value = SimpleNamespace(anthropic_api_key="fake-key", narrative_llm_model="x")
        result = llm_engine.analyze("a real narrative")

    assert result.available is False
    assert "api_error" in result.error


def test_analyze_degrades_when_response_has_no_tool_use():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = SimpleNamespace(content=[SimpleNamespace(type="text", text="oops")])

    with patch("app.engines.llm_engine._client", return_value=mock_client), \
         patch("app.engines.llm_engine.get_settings") as mock_settings:
        mock_settings.return_value = SimpleNamespace(anthropic_api_key="fake-key", narrative_llm_model="x")
        result = llm_engine.analyze("a real narrative")

    assert result.available is False
    assert result.error == "no_tool_use_in_response"


def test_analyze_degrades_on_malformed_response_missing_category():
    incomplete_data = {cat: 10 for cat in llm_engine.CATEGORIES[:-1]}  # missing one required category
    incomplete_data["rationale"] = "incomplete"

    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_tool_response(incomplete_data)

    with patch("app.engines.llm_engine._client", return_value=mock_client), \
         patch("app.engines.llm_engine.get_settings") as mock_settings:
        mock_settings.return_value = SimpleNamespace(anthropic_api_key="fake-key", narrative_llm_model="x")
        result = llm_engine.analyze("a real narrative")

    assert result.available is False
    assert "malformed_response" in result.error


def test_client_is_none_without_api_key():
    with patch("app.engines.llm_engine.get_settings") as mock_settings:
        mock_settings.return_value = SimpleNamespace(anthropic_api_key=None)
        assert llm_engine._client() is None
