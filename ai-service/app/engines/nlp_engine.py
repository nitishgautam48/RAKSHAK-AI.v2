"""NLP Trauma Engine - transparent lexicon + linguistic-feature scorer.

There is no ethically-sourced, labeled dataset of SC/ST atrocity victim
narratives with ground-truth trauma scores to train RoBERTa/ClinicalBERT/
Llama against (and no reachable host to fetch those weights from even if
one existed - see README.md). Rather than fabricate a "trained model", this
engine does real computation over the real input text: weighted keyword-
category matching across English and Hindi (Devanagari + common Latin
transliteration), plus linguistic features (negation, intensifiers,
first-person distress framing). Every category score traces back to the
exact keywords that fired, which is what the explainability engine surfaces
as reason codes and feature contributions.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Keyword lexicons per trauma dimension. English + Hindi (Devanagari script,
# the language survivors most commonly narrate in per the platform's stated
# audience) are both included; more Indian languages are a direct extension
# of this same table, not an architecture change.
LEXICON: dict[str, list[str]] = {
    "threat": [
        "threat", "threaten", "kill", "murder", "beat", "burn", "attack", "weapon", "gun", "knife", "armed",
        "dhamki", "jaan se maar", "maar denge", "धमकी", "जान से मार",
    ],
    "retaliation": [
        "retaliat", "revenge", "payback", "again if", "will suffer", "consequences", "warn",
        "worse will happen", "something worse",
        "badla", "बदला", "अंजाम देंगे",
    ],
    "fear": [
        "afraid", "scared", "terrified", "fear", "frightened", "panic", "unsafe", "dare not", "cannot sleep",
        "darr", "dari", "darta", "darte", "ghabra", "डर", "डरा", "भय",
    ],
    "hopelessness": [
        "no hope", "give up", "hopeless", "no point", "nothing left", "cannot go on", "helpless",
        "no way out", "any way out", "don't know what to do", "no solution", "kuch nahi bacha",
        "umeed nahi", "उम्मीद नहीं", "बेबस",
    ],
    "isolation": [
        "alone", "no one helps", "no one will", "no one to", "will speak to us", "excluded", "boycott",
        "abandoned", "isolated", "shunned", "no way out", "no support", "on our own",
        "denied entry", "not allowed to enter", "humiliat", "koi baat nahi",
        "akela", "अकेला", "बहिष्कार",
    ],
    "vulnerability": [
        "children", "alone at home", "elderly", "disabled", "pregnant", "widow", "single mother",
        "bachche", "बच्चे",
    ],
    "physical_harm": [
        "hit", "struck", "beaten", "injured", "wound", "bleeding", "hospital", "unconscious", "assault",
        "maara", "मारा", "चोट",
    ],
    "caste_targeting": [
        "caste", "sc/st", "dalit", "untouchab", "land dispute", "do not belong", "temple",
        "jaati", "जाति",
    ],
}

INTENSIFIERS = {"very", "extremely", "repeatedly", "every night", "every day", "again and again", "baar baar"}
NEGATIONS = {"not", "never", "no longer", "nahi", "nahin"}

# Abuse by someone in a position of power/trust over the narrator (a teacher,
# employer, landlord, custodial officer, doctor, etc.) is a recognized
# aggravating factor - it reflects the victim's reduced ability to resist or
# safely report, not just an incidental detail of the account. The SC/ST
# (Prevention of Atrocities) Act itself treats offences by a public servant
# separately and more severely (Section 3(2)(vii)) for the same reason. Only
# meaningful alongside an actual matched abuse category below - the mere
# presence of the word "teacher" in an unrelated sentence should not move
# anything.
AUTHORITY_CONTEXT = [
    "teacher", "employer", "landlord", "warden", "priest", "guardian", "doctor",
    "supervisor", "boss", "principal", "government official", "police officer",
    "in-law", "custodial officer", "forest officer",
    "शिक्षक", "मालिक", "पुलिस अधिकारी",
]

# First-person pronouns distinguish "I was beaten by the police" (a direct
# account) from "a woman was allegedly beaten by police" (third-party/news-
# style reporting about someone else) - a triage signal for routing a case to
# a human reviewer fast, separate from and never a substitute for severity
# itself. Kept short/common-word-only and matched with BOTH word boundaries
# (see _pronoun_pattern) - pronouns are too short and too common as substrings
# of unrelated words for the lexicon's left-boundary-only stemming match to
# be safe here.
FIRST_PERSON_MARKERS = [
    "i", "me", "my", "myself", "we", "us", "our",
    "मुझे", "मेरा", "मेरी", "मेरे", "मैं", "हम", "हमें", "हमारा",
]

WORD_RE = re.compile(r"[\wऀ-ॿ]+", re.UNICODE)


@dataclass
class CategoryHit:
    category: str
    matched_terms: list[str]
    raw_count: int
    score: float  # 0-100, normalized for this category


@dataclass
class NlpIndicators:
    trauma_score: float
    fear_score: float
    isolation_score: float
    threat_score: float
    hopelessness_score: float
    vulnerability_score: float
    caste_targeting_score: float
    confidence: float
    category_hits: list[CategoryHit] = field(default_factory=list)
    matched_keywords: list[str] = field(default_factory=list)
    suicidal_ideation_flag: bool = False
    word_count: int = 0
    authority_context_detected: bool = False
    victim_testimony_detected: bool = False


SUICIDAL_PATTERNS = [
    "end my life", "want to die", "kill myself", "no reason to live",
    "khudkushi", "आत्महत्या",
]


def _normalize(text: str) -> str:
    return text.lower()


# A bare, single ASCII word (e.g. "hit") needs boundary-anchored matching, or
# it false-positive-matches inside unrelated words ("white" contains "hit").
# Several lexicon entries are deliberate stems ("retaliat" for retaliate/
# retaliation/retaliated), so the match anchors a word boundary on the LEFT
# only and allows trailing word characters - "hit" still won't match inside
# "white" (no boundary before the "h" there), but "retaliat" still matches
# "retaliation". Multi-word phrases and Devanagari-script terms don't have
# the single-short-word collision risk, so they keep plain substring matching.
_ASCII_SINGLE_WORD_RE = re.compile(r"^[a-zA-Z]+$")


def _term_pattern(term_l: str) -> re.Pattern[str]:
    if _ASCII_SINGLE_WORD_RE.match(term_l):
        return re.compile(r"\b" + re.escape(term_l) + r"\w*")
    return re.compile(re.escape(term_l))


# Pronouns need BOTH word boundaries, not the lexicon's left-boundary-plus-
# stem match above - "i" with only a left boundary would match inside "is",
# "in", "into", etc. No stemming is wanted for a pronoun either.
def _pronoun_pattern(term_l: str) -> re.Pattern[str]:
    if _ASCII_SINGLE_WORD_RE.match(term_l):
        return re.compile(r"\b" + re.escape(term_l) + r"\b")
    return re.compile(re.escape(term_l))


def _category_score(text_lower: str, terms: list[str]) -> CategoryHit:
    matched: list[str] = []
    count = 0
    for term in terms:
        term_l = term.lower()
        occurrences = len(_term_pattern(term_l).findall(text_lower))
        if occurrences:
            matched.append(term)
            count += occurrences
    # Diminishing returns: first hit counts fully, later ones less, so one
    # very repetitive keyword can't single-handedly saturate the score.
    raw = sum(1 / (i + 1) for i in range(count)) if count else 0.0
    score = float(min(100.0, raw * 45))
    return CategoryHit(category="", matched_terms=matched, raw_count=count, score=score)


def analyze(text: str) -> NlpIndicators:
    text = text or ""
    text_lower = _normalize(text)
    words = WORD_RE.findall(text)
    word_count = len(words)

    hits: list[CategoryHit] = []
    for category, terms in LEXICON.items():
        hit = _category_score(text_lower, terms)
        hit.category = category
        hits.append(hit)

    by_cat = {h.category: h for h in hits}
    intensifier_boost = 1.0 + 0.1 * sum(1 for i in INTENSIFIERS if i in text_lower)
    # Negation is scanned on the text with matched multi-word lexicon phrases
    # blanked out first - otherwise a phrase that itself contains a negation
    # word (e.g. "do not belong", the caste-targeting trigger phrase) gets
    # wrongly discounted as if something else nearby had been negated,
    # instead of being recognized as the very signal it's supposed to be.
    matched_phrases = sorted({t for h in hits for t in h.matched_terms if " " in t}, key=len, reverse=True)
    text_for_negation_scan = text_lower
    for phrase in matched_phrases:
        text_for_negation_scan = text_for_negation_scan.replace(phrase.lower(), " ")
    negation_penalty = 1.0 - 0.15 * sum(1 for n in NEGATIONS if f" {n} " in f" {text_for_negation_scan} ")
    modifier = max(0.5, min(1.5, intensifier_boost * negation_penalty))

    def scaled(cat: str) -> float:
        return round(min(100.0, by_cat[cat].score * modifier), 1)

    # "retaliation" (warn/consequences/worse-will-happen/badla language) is a
    # real signal but conceptually a form of implicit/conditional threat, so
    # it blends into threat_score at half-weight rather than sitting inert -
    # a real bug found while expanding the evaluation set: this category was
    # being scored but never actually used anywhere.
    threat_score = round(min(100.0, scaled("threat") + 0.5 * scaled("retaliation")), 1)

    trauma_score = round(
        min(100.0, 0.3 * threat_score + 0.25 * scaled("physical_harm") + 0.25 * scaled("fear") + 0.2 * scaled("hopelessness")),
        1,
    )

    suicidal_flag = any(p in text_lower for p in SUICIDAL_PATTERNS)
    matched_keywords = sorted({t for h in hits for t in h.matched_terms})

    # Both signals below only count alongside real matched-category evidence
    # (has_category_evidence) - an authority word or a stray pronoun in
    # otherwise-neutral text should not, on its own, flag anything.
    has_category_evidence = any(h.matched_terms for h in hits)
    authority_context_detected = has_category_evidence and any(
        _term_pattern(term.lower()).search(text_lower) for term in AUTHORITY_CONTEXT
    )
    first_person_count = sum(1 for term in FIRST_PERSON_MARKERS if _pronoun_pattern(term.lower()).search(text_lower))
    # Requiring 2+ distinct first-person markers (rather than 1) avoids
    # flagging a third-party account that merely quotes the victim once
    # ("she told police 'I was scared'").
    victim_testimony_detected = has_category_evidence and first_person_count >= 2

    confidence = float(min(95.0, 55 + min(30, word_count / 3)))

    return NlpIndicators(
        trauma_score=trauma_score,
        fear_score=scaled("fear"),
        isolation_score=scaled("isolation"),
        threat_score=threat_score,
        hopelessness_score=scaled("hopelessness"),
        vulnerability_score=scaled("vulnerability"),
        caste_targeting_score=scaled("caste_targeting"),
        confidence=round(confidence, 1),
        category_hits=hits,
        matched_keywords=matched_keywords,
        suicidal_ideation_flag=suicidal_flag,
        word_count=word_count,
        authority_context_detected=authority_context_detected,
        victim_testimony_detected=victim_testimony_detected,
    )
