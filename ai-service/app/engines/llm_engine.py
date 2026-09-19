"""LLM-based narrative understanding - an optional, additive signal for the
one structural gap the keyword/lexicon engine (nlp_engine.py) cannot close by
adding more keywords: a narrative that describes something severe without
ever using a trigger word or phrase ("they came back after everyone else had
gone home and made sure of it" contains no lexicon term at all). A keyword
matcher cannot infer meaning from context, sentence structure, or an implied
rather than stated event - a real language model reading the narrative can.

HONESTY NOTES (read before trusting or enabling this):

1. This is genuinely disabled by default and stays that way until whoever
   deploys this service sets a real ANTHROPIC_API_KEY (see config.py) - not
   something silently switched on. Every call costs real money and adds a
   real external dependency and a real (if usually small) point of failure;
   that is a deployment decision, not a default.

2. This module has NOT been exercised against a live Anthropic API call as
   part of building it: this development sandbox has no legitimate API key
   for this application to use (its own operator credentials are for running
   Claude Code itself, not for embedding in a deployed product). What IS
   verified, with mocked API responses, in tests/test_llm_engine.py: the tool
   schema is well-formed, response parsing is correct, scores are clamped to
   [0, 100], and every failure mode (no key, empty text, API error, malformed
   response, missing tool_use block) degrades to `available=False` rather
   than raising - the pipeline never breaks because this optional signal is
   unavailable. Whoever adds a real key should treat the first real calls as
   the actual first test of the prompt/schema against the live model.

3. Exactly like the semantic/ML signals discussed for the "Rakshak AI"
   predecessor, and like this codebase's own suicidal-ideation floor and
   authority-power-imbalance escalation: this can only RAISE a category
   score (blended via max() in main.py), never lower one below what the
   keyword engine already found. A model output being wrong should never be
   able to hide a real keyword hit.

4. This is still not a clinical instrument. It is a better reader than a
   keyword list, not a validated psychological assessment.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.config import get_settings

# Mirrors nlp_engine.NlpIndicators' category fields exactly (minus
# confidence/word_count/flags, which aren't meaningful for an LLM read) so
# main.py can blend by simple attribute name.
CATEGORIES = ["trauma", "fear", "threat", "hopelessness", "isolation", "vulnerability", "caste_targeting"]

SYSTEM_PROMPT = """You are assisting a government helpline (India's National Helpline Against Atrocities, 14566) that supports SC/ST victims of caste-based violence and discrimination. You will read one survivor/complainant narrative and score it, 0-100, on each dimension below. This score feeds a triage system that helps route urgent cases to human staff faster - it does not replace a human, and no automated action is taken solely on your output.

Score based on what is described or credibly implied, not on tone, calmness, grammar, or how explicitly upsetting language is used. A calm, brief, or indirectly-worded account of something severe must still score as severe - trauma survivors very commonly under-state or flatly narrate what happened. Conversely, do not invent or assume an event the text does not describe or reasonably imply; score 0 on a dimension with no real signal for it, including for entirely benign text.

Dimensions (0 = no signal, 100 = severe/extreme):
- trauma: physical or sexual violence, injury, or a severely distressing event, experienced or witnessed
- fear: the narrator's current fear, dread, or feeling unsafe
- threat: explicit or implied threats of harm, retaliation, or violence by another party
- hopelessness: despair, giving up, no way out, suicidal ideation (score 100 if suicidal ideation is present)
- isolation: social exclusion, boycott, being cut off from support, no one to turn to
- vulnerability: compounding factors like being a child, elderly, disabled, pregnant, or otherwise especially at-risk
- caste_targeting: the narrative indicates the events are motivated by or connected to the narrator's caste/tribal identity

Call report_narrative_severity exactly once with your scores and a one-to-two-sentence rationale citing what in the text drove them (or explaining why scores are low/zero) - this rationale is shown to the human reviewer, so it must be honest and specific, not generic."""

_TOOL_SCHEMA = {
    "name": "report_narrative_severity",
    "description": "Report severity scores (0-100) for a survivor narrative across fixed dimensions, with a brief rationale.",
    "input_schema": {
        "type": "object",
        "properties": {
            **{cat: {"type": "number", "minimum": 0, "maximum": 100} for cat in CATEGORIES},
            "rationale": {"type": "string", "description": "1-2 sentences: what in the text drove these scores."},
        },
        "required": [*CATEGORIES, "rationale"],
    },
}


@dataclass
class LlmIndicators:
    available: bool
    scores: dict[str, float] = field(default_factory=dict)  # 0-100 per CATEGORIES entry, only present if available
    rationale: str = ""
    model: str = ""
    error: str | None = None  # set (available=False) on any failure - never raises


def _client():
    settings = get_settings()
    if not settings.anthropic_api_key:
        return None
    try:
        from anthropic import Anthropic
    except ImportError:
        return None
    return Anthropic(api_key=settings.anthropic_api_key)


def analyze(text: str) -> LlmIndicators:
    if not text or not text.strip():
        return LlmIndicators(available=False, error="empty_text")

    client = _client()
    if client is None:
        return LlmIndicators(available=False, error="no_api_key_configured")

    settings = get_settings()
    try:
        response = client.messages.create(
            model=settings.narrative_llm_model,
            max_tokens=512,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": text}],
            tools=[_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": "report_narrative_severity"},
        )
    except Exception as e:  # noqa: BLE001 - any API/network failure degrades, never breaks the pipeline
        return LlmIndicators(available=False, error=f"api_error: {e}")

    tool_use = next((block for block in response.content if getattr(block, "type", None) == "tool_use"), None)
    if tool_use is None:
        return LlmIndicators(available=False, error="no_tool_use_in_response")

    data = tool_use.input
    try:
        scores = {cat: float(max(0.0, min(100.0, float(data[cat])))) for cat in CATEGORIES}
    except (KeyError, TypeError, ValueError) as e:
        return LlmIndicators(available=False, error=f"malformed_response: {e}")

    return LlmIndicators(
        available=True,
        scores=scores,
        rationale=str(data.get("rationale", "")),
        model=settings.narrative_llm_model,
    )
