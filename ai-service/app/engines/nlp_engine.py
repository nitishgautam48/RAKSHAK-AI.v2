"""NLP Trauma Engine - transparent lexicon + linguistic-feature scorer.

There is no ethically-sourced, labeled dataset of SC/ST atrocity victim
narratives with ground-truth trauma scores to train RoBERTa/ClinicalBERT/
Llama against (and no reachable host to fetch those weights from even if
one existed - see README.md). Rather than fabricate a "trained model", this
engine does real computation over the real input text: weighted keyword-
category matching across English, Hindi, and six other major Indian
languages (Bengali, Marathi, Telugu, Tamil, Kannada, Odia - chosen as the
languages with the largest speaker populations among SC/ST-majority states
after Hindi), plus linguistic features (negation, intensifiers, first-person
distress framing). Every category score traces back to the exact keywords
that fired, which is what the explainability engine surfaces as reason
codes and feature contributions.

CAVEAT: the Bengali, Marathi, Telugu, Tamil, Kannada, and Odia entries below
were compiled by the AI system building this platform, not by a native or
fluent speaker of those languages. They cover common, high-confidence
vocabulary for each category but have NOT been reviewed by a native speaker
for correctness, register (e.g. accidentally using a form of a word that
sounds odd or overly formal in real distressed speech), dialectal variation,
or missed common phrasings. The same caveat already applied to the Hindi
entries below; treat all non-English lexicon entries as a starting point
that needs native-speaker review before the platform relies on them
operationally, and expand coverage (script + terms) for any other language
actually seen in submitted narratives.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Keyword lexicons per trauma dimension. English, Hindi (Devanagari script,
# the language survivors most commonly narrate in per the platform's stated
# audience), and six more major Indian languages are included; any further
# language is a direct extension of this same table, not an architecture
# change. See the module-level CAVEAT above re: non-English/Hindi entries
# needing native-speaker review.
LEXICON: dict[str, list[str]] = {
    "threat": [
        "threat", "threaten", "kill", "murder", "beat", "burn", "attack", "weapon", "gun", "knife", "armed",
        "dhamki", "jaan se maar", "maar denge", "धमकी", "जान से मार",  # Hindi
        "जीवे मारण्याची धमकी", "मारून टाकू",  # Marathi
        "হুমকি", "মেরে ফেলব",  # Bengali
        "బెదిరింపు", "చంపేస్తాను", "కొడతాను",  # Telugu
        "மிரட்டல்", "கொல்வோம்",  # Tamil
        "ಬೆದರಿಕೆ", "ಕೊಲ್ಲುತ್ತೇವೆ",  # Kannada
        "ଧମକ", "ମାରି ଦେବୁ",  # Odia
    ],
    "retaliation": [
        "retaliat", "revenge", "payback", "again if", "will suffer", "consequences", "warn",
        "worse will happen", "something worse",
        "badla", "बदला", "अंजाम देंगे",  # Hindi
    ],
    "fear": [
        "afraid", "scared", "terrified", "fear", "frightened", "panic", "unsafe", "dare not", "cannot sleep",
        "darr", "dari", "darta", "darte", "ghabra", "डर", "डरा", "भय",  # Hindi
        "भीती", "घाबरलो",  # Marathi
        "ভয়", "ভয় পেয়েছি",  # Bengali
        "భయం", "భయపడ్డాను",  # Telugu
        "பயம்", "பயந்தேன்",  # Tamil
        "ಭಯ", "ಹೆದರಿದೆ",  # Kannada
        "ଭୟ", "ଡରିଗଲି",  # Odia
    ],
    "hopelessness": [
        "no hope", "give up", "hopeless", "no point", "nothing left", "cannot go on", "helpless",
        "no way out", "any way out", "don't know what to do", "no solution", "kuch nahi bacha",
        # "don't want to live" was a real gap found via live testing (a real
        # narrative - "i don't want to live this life anymore" - scored zero
        # hopelessness despite being a textbook example of it). "dont" and
        # "do not" variants included since apostrophe handling isn't
        # normalized elsewhere in this matcher.
        "don't want to live", "dont want to live", "do not want to live",
        "no reason to live", "don't want to be alive", "dont want to be alive",

        "umeed nahi", "उम्मीद नहीं", "बेबस",  # Hindi
        "आशा नाही",  # Marathi
        "আশা নেই",  # Bengali
        "ఆశ లేదు",  # Telugu
        "நம்பிக்கை இல்லை",  # Tamil
        "ಭರವಸೆ ಇಲ್ಲ",  # Kannada
        "ଆଶା ନାହିଁ",  # Odia
    ],
    "isolation": [
        "alone", "no one helps", "no one will", "no one to", "will speak to us", "excluded", "boycott",
        "abandoned", "isolated", "shunned", "no way out", "no support", "on our own",
        "denied entry", "not allowed to enter", "humiliat", "koi baat nahi",
        # "nobody" is an extremely common real-world phrasing this lexicon
        # missed entirely (only had "no one ___" variants) until a real
        # test narrative ("nobody is there for me...") scored zero on
        # isolation because of this exact gap.
        "nobody", "no one cares", "nobody cares", "nobody helps", "no one to turn to",
        "akela", "अकेला", "बहिष्कार",  # Hindi
        "एकटा", "एकटी", "बहिष्कार",  # Marathi
        "একা", "বয়কট",  # Bengali
        "ఒంటరిగా", "వెలివేత",  # Telugu
        "தனியாக", "புறக்கணிப்பு",  # Tamil
        "ಒಂಟಿ", "ಬಹಿಷ್ಕಾರ",  # Kannada
        "ଏକୁଟିଆ", "ବହିଷ୍କାର",  # Odia
    ],
    "vulnerability": [
        "children", "alone at home", "elderly", "disabled", "pregnant", "widow", "single mother",
        "bachche", "बच्चे",  # Hindi
        "मुले", "वृद्ध",  # Marathi
        "শিশু", "বৃদ্ধ",  # Bengali
        "పిల్లలు", "వృద్ధులు",  # Telugu
        "குழந்தைகள்", "முதியவர்",  # Tamil
        "ಮಕ್ಕಳು", "ವೃದ್ಧ",  # Kannada
        "ପିଲାମାନେ", "ବୃଦ୍ଧ",  # Odia
    ],
    "physical_harm": [
        "hit", "struck", "beaten", "injured", "wound", "bleeding", "hospital", "unconscious", "assault",
        "maara", "मारा", "चोट",  # Hindi
        "मारहाण", "जखम",  # Marathi
        "মারধর", "আঘাত",  # Bengali
        "కొట్టారు", "గాయం",  # Telugu
        "அடித்தார்கள்", "காயம்",  # Tamil
        "ಹೊಡೆದರು", "ಗಾಯ",  # Kannada
        "ମାଡ଼", "ଆଘାତ",  # Odia
    ],
    "caste_targeting": [
        "caste", "sc/st", "dalit", "untouchab", "land dispute", "do not belong", "temple",
        "jaati", "जाति",  # Hindi
        "जात", "दलित",  # Marathi
        "জাতি", "দলিত",  # Bengali
        "కులం", "దళిత్",  # Telugu
        "சாதி", "தலித்",  # Tamil
        "ಜಾತಿ", "ದಲಿತ",  # Kannada
        "ଜାତି", "ଦଳିତ",  # Odia
    ],
    # Two new categories (task: "expand the NLP lexicon" - atrocity-specific
    # categories direction). English + Hindi only for now, deliberately -
    # unlike the other categories' six-more-language rollout (task #118),
    # generating unreviewed terms for SEXUAL violence terminology
    # specifically carries a higher mistranslation/misuse risk than most
    # other categories, so this starts narrower and should only grow "for
    # any other language actually seen in submitted narratives" (the module
    # docstring's own stated expansion principle), reviewed as it's added,
    # not mass-generated up front.
    "sexual_violence": [
        "rape", "raped", "molest", "molested", "molestation", "sexual assault", "sexually assaulted",
        "outraged her modesty", "outrage her modesty",  # IPC Section 354 terminology, real complaint language
        "inappropriately touched", "touched inappropriately",
        "बलात्कार", "छेड़छाड़", "यौन उत्पीड़न",  # Hindi
    ],
    "custodial_abuse": [
        "custodial death", "died in custody", "custodial torture", "beaten in custody", "police custody",
        "third degree", "custody death",
        "हिरासत में मौत", "हिरासत में मारपीट", "थाने में मारपीट",  # Hindi
    ],
}

# Every term added by task #118 for the six languages the module docstring's
# CAVEAT applies to (Bengali, Marathi, Telugu, Tamil, Kannada, Odia) - used
# to flag when a score actually depended on unreviewed vocabulary, so staff
# know to treat that specific read with more caution than an English/Hindi
# one. Covers the two signals this directly and visibly drives (matched
# category keywords, suicidal-ideation phrases) - intensifiers/negations/
# authority-context/first-person markers are secondary modifiers not
# covered here, to keep this list's maintenance burden bounded. IMPORTANT:
# any future non-English/Hindi lexicon addition must be added here too, or
# it will silently score without ever surfacing the review flag. A term
# identical to an existing Hindi entry (e.g. "आत्महत्या", shared with
# Marathi) is deliberately left out - it's indistinguishable from the
# already-established Hindi term at the string level.
UNREVIEWED_LANGUAGE_TERMS: frozenset[str] = frozenset({
    # threat
    "जीवे मारण्याची धमकी", "मारून टाकू", "হুমকি", "মেরে ফেলব",
    "బెదిరింపు", "చంపేస్తాను", "కొడతాను", "மிரட்டல்", "கொல்வோம்",
    "ಬೆದರಿಕೆ", "ಕೊಲ್ಲುತ್ತೇವೆ", "ଧମକ", "ମାରି ଦେବୁ",
    # fear
    "भीती", "घाबरलो", "ভয়", "ভয় পেয়েছি", "భయం", "భయపడ్డాను",
    "பயம்", "பயந்தேன்", "ಭಯ", "ಹೆದರಿದೆ", "ଭୟ", "ଡରିଗଲି",
    # hopelessness
    "आशा नाही", "আশা নেই", "ఆశ లేదు", "நம்பிக்கை இல்லை", "ಭರವಸೆ ಇಲ್ಲ", "ଆଶା ନାହିଁ",
    # isolation
    "एकटा", "एकटी", "একা", "বয়কট", "ఒంటరిగా", "వెలివేత",
    "தனியாக", "புறக்கணிப்பு", "ಒಂಟಿ", "ಬಹಿಷ್ಕಾರ", "ଏକୁଟିଆ", "ବହିଷ୍କାର",
    # vulnerability
    "मुले", "वृद्ध", "শিশু", "বৃদ্ধ", "పిల్లలు", "వృద్ధులు",
    "குழந்தைகள்", "முதியவர்", "ಮಕ್ಕಳು", "ವೃದ್ಧ", "ପିଲାମାନେ", "ବୃଦ୍ଧ",
    # physical_harm
    "मारहाण", "जखम", "মারধর", "আঘাত", "కొట్టారు", "గాయం",
    "அடித்தார்கள்", "காயம்", "ಹೊಡೆದರು", "ಗಾಯ", "ମାଡ଼", "ଆଘାତ",
    # caste_targeting
    "जात", "दलित", "জাতি", "দলিত", "కులం", "దళిత్",
    "சாதி", "தலித்", "ಜಾತಿ", "ದಲಿತ", "ଜାତି", "ଦଳିତ",
    # suicidal-ideation patterns (see SUICIDAL_PATTERNS below)
    "मरावेसे वाटते", "আত্মহত্যা", "చావాలని అనిపిస్తోంది",
    "செத்துவிட வேண்டும்", "ಆತ್ಮಹತ್ಯೆ", "ଆତ୍ମହତ୍ୟା",
})

INTENSIFIERS = {
    "very", "extremely", "repeatedly", "every night", "every day", "again and again", "baar baar",
    "खूप",  # Marathi (very)
    "খুব",  # Bengali (very)
    "చాలా",  # Telugu (very)
    "மிகவும்",  # Tamil (very)
    "ತುಂಬಾ",  # Kannada (very)
    "ବହୁତ",  # Odia (very)
}
NEGATIONS = {
    "not", "never", "no longer", "nahi", "nahin",
    "नाही",  # Marathi
    "না", "নেই",  # Bengali
    "లేదు", "కాదు",  # Telugu
    "இல்லை",  # Tamil
    "ಇಲ್ಲ",  # Kannada
    "ନାହିଁ",  # Odia
}

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
    "शिक्षक", "मालिक", "पुलिस अधिकारी",  # Hindi
    "पोलीस अधिकारी",  # Marathi (शिक्षक is shared with Hindi)
    "পুলিশ অফিসার", "শিক্ষক",  # Bengali
    "పోలీసు అధికారి", "ఉపాధ్యాయుడు",  # Telugu
    "போலீஸ் அதிகாரி", "ஆசிரியர்",  # Tamil
    "ಪೊಲೀಸ್ ಅಧಿಕಾರಿ", "ಶಿಕ್ಷಕ",  # Kannada
    "ପୋଲିସ ଅଧିକାରୀ", "ଶିକ୍ଷକ",  # Odia
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
    "मुझे", "मेरा", "मेरी", "मेरे", "मैं", "हम", "हमें", "हमारा",  # Hindi
    "मी", "मला", "आम्ही", "आमचे",  # Marathi
    "আমি", "আমাকে", "আমরা", "আমাদের",  # Bengali
    "నేను", "నాకు", "మాకు", "మా",  # Telugu
    "நான்", "எனக்கு", "எங்களுக்கு", "எங்கள்",  # Tamil
    "ನಾನು", "ನನಗೆ", "ನಾವು", "ನಮ್ಮ",  # Kannada
    "ମୁଁ", "ମୋତେ", "ଆମେ", "ଆମର",  # Odia
]

# Devanagari (Hindi, Marathi), Bengali, Odia, Tamil, Telugu, and Kannada
# Unicode script blocks, so word/word-count detection isn't limited to
# Latin + Devanagari text.
WORD_RE = re.compile(r"[\wऀ-ॿঀ-৿଀-୿஀-௿ఀ-౿ಀ-೿]+", re.UNICODE)


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
    # Own dedicated fields (unlike physical_harm/retaliation, which fold
    # silently into trauma_score/threat_score below) - these two are severe
    # and specific enough that staff should see the number directly, not
    # just its contribution buried inside a composite.
    sexual_violence_score: float = 0.0
    custodial_abuse_score: float = 0.0
    category_hits: list[CategoryHit] = field(default_factory=list)
    matched_keywords: list[str] = field(default_factory=list)
    suicidal_ideation_flag: bool = False
    word_count: int = 0
    authority_context_detected: bool = False
    victim_testimony_detected: bool = False
    # True when the score actually depended on a matched term from one of
    # the six languages the module docstring's CAVEAT applies to - those
    # entries haven't been reviewed by a native/fluent speaker. This is a
    # transparency flag for staff, not a confidence adjustment: it never
    # changes any score, only whether this particular read should get
    # extra scrutiny before being relied on.
    native_review_recommended: bool = False
    native_review_matched_terms: list[str] = field(default_factory=list)


SUICIDAL_PATTERNS = [
    "end my life", "want to die", "kill myself", "no reason to live",
    # Added after a real test narrative ("...i should end up my life right
    # now") scored zero: plain substring matching against "end my life"
    # doesn't catch "end UP my life" - one extra word breaks it entirely.
    # These are additional literal phrasings, not a fix to the matching
    # mechanism itself (see _SUICIDAL_END_LIFE_RE below for that).
    "end it all", "ending my life", "ending it all", "wish i was dead",
    "wish i were dead", "better off dead", "not worth living",
    "no point in living", "take my own life", "take my life",
    "hurt myself", "harm myself",
    "khudkushi", "आत्महत्या",  # Hindi
    "आत्महत्या", "मरावेसे वाटते",  # Marathi (आत्महत्या shared with Hindi)
    "আত্মহত্যা",  # Bengali
    "చావాలని అనిపిస్తోంది",  # Telugu
    "செத்துவிட வேண்டும்",  # Tamil
    "ಆತ್ಮಹತ್ಯೆ",  # Kannada
    "ଆତ୍ମହତ୍ୟା",  # Odia
]

# A literal phrase list can never keep up with real phrasing variance -
# "end up my life", "put an end to my own life", "end our life together"
# all express the same thing but none contain the exact substring
# "end my life". This structural pattern catches "end ... life" with the
# word "end" and the word "life" separated by up to a few words, rather
# than requiring an exact phrase. Deliberately generous (this only ever
# adds a review flag - see native_review_recommended's docstring for the
# same "flag, don't suppress" philosophy - never suppresses or lowers
# anything), at the cost of occasionally matching non-suicidal uses of
# "end" and "life" in the same sentence (e.g. "this is the end of my life
# as a student") - an acceptable false-positive rate for a human-review
# trigger, not an auto-action.
_SUICIDAL_END_LIFE_RE = re.compile(r"\bend\b(?:\s+\w+){0,4}\s+life\b")

# Same structural-pattern reasoning as _SUICIDAL_END_LIFE_RE above, for a
# different real phrasing family: a real narrative ("i don't want to live
# this life anymore") scored zero suicidal-ideation despite being a direct
# statement of it, because "don't want to live" wasn't in SUICIDAL_PATTERNS
# and no structural pattern covered it either. Catches a negation ("don't"/
# "dont"/"do not"/"no longer"/"can't"/"won't") within a few words of "want
# to live" or "go on living" - covers "don't want to live", "no longer want
# to live", "can't go on living", etc. without needing an exact phrase for
# every negation/apostrophe variant.
_SUICIDAL_DONT_WANT_TO_LIVE_RE = re.compile(
    r"\b(?:don'?t|do\s+not|no\s+longer|can'?t|won'?t)\b(?:\s+\w+){0,3}\s+(?:want(?:s)?\s+to\s+live|go\s+on\s+living)\b",
)

# Structural patterns for other categories, same "generalize beyond an exact
# phrase list, only ever RAISE a score, never suppress" philosophy as the
# two suicidal-ideation patterns above. Each is applied in analyze() via
# _apply_structural_pattern() - a match sets that category's raw score to at
# least _STRUCTURAL_PATTERN_FLOOR (equivalent to one real keyword hit) if it
# wasn't already there, and the match is recorded in matched_keywords like a
# real hit, so it's visible in the explainability breakdown, not a silent
# nudge to a number nobody can trace.

# Generalizes the "threat" category beyond fixed violence-verb keywords -
# catches an explicit future-tense threat construction ("will kill", "gonna
# beat", "going to burn") regardless of which specific violence verb is
# used, rather than requiring every verb to be pre-listed.
_THREAT_FUTURE_VIOLENCE_RE = re.compile(r"\b(?:will|gonna|going to)\b(?:\s+\w+){0,3}\s+(?:kill|beat|burn|hurt|harm|attack|rape)\b")

# Generalizes "sexual_violence" beyond the literal phrase list - "forced
# himself on her", "forced herself upon him", etc. are common real phrasings
# that don't all share one exact substring.
_SEXUAL_VIOLENCE_FORCED_RE = re.compile(r"\bforced\s+(?:himself|herself|themselves)\b(?:\s+\w+){0,3}\s+(?:on|upon)\b")

# Generalizes "custodial_abuse" beyond the literal phrase list - "died in
# police custody", "death while in custody", "the death occurred while he
# was held in judicial custody", etc. share the "died/death ... custody"
# structure without a single fixed substring covering all word orders. A
# wider gap than the other structural patterns here (0-10 words, not 0-3/4)
# because real sentences describing a custodial death are often long
# ("the death occurred while he was being held in..."), not terse.
_CUSTODIAL_DEATH_RE = re.compile(r"\b(?:died|death)\b(?:\s+\w+){0,10}\s+custody\b")

_STRUCTURAL_PATTERN_FLOOR = 45.0  # matches one un-diminished keyword hit (see _category_score)


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


def _apply_structural_pattern(hit: CategoryHit, pattern: re.Pattern[str], text_lower: str, label: str) -> None:
    """Raises `hit`'s score to _STRUCTURAL_PATTERN_FLOOR if `pattern` matches
    and the keyword-only score wasn't already at least that high - never
    lowers it. The matched pattern is recorded in matched_terms exactly like
    a real keyword hit, so it shows up in the explainability breakdown."""
    if pattern.search(text_lower) and hit.score < _STRUCTURAL_PATTERN_FLOOR:
        hit.score = _STRUCTURAL_PATTERN_FLOOR
        hit.matched_terms.append(f"(pattern) {label}")


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
    _apply_structural_pattern(by_cat["threat"], _THREAT_FUTURE_VIOLENCE_RE, text_lower, "future violence threat")
    _apply_structural_pattern(by_cat["sexual_violence"], _SEXUAL_VIOLENCE_FORCED_RE, text_lower, "forced ... on/upon")
    _apply_structural_pattern(by_cat["custodial_abuse"], _CUSTODIAL_DEATH_RE, text_lower, "died/death ... custody")
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
    # being scored but never actually used anywhere. "custodial_abuse" is
    # folded in too, at a similar weight: abuse committed by the very
    # authority meant to protect someone is itself an active threat
    # pattern, not just a historical trauma fact.
    threat_score = round(min(100.0, scaled("threat") + 0.5 * scaled("retaliation") + 0.4 * scaled("custodial_abuse")), 1)

    # trauma_score's weights below deliberately do NOT sum to 1.0 anymore
    # (0.3 + 0.25 + 0.25 + 0.2 + 0.35 + 0.3 = 1.65) - same reasoning
    # svi_engine.py's own module docstring gives for its weights: a single
    # severe, specific signal (sexual violence, custodial abuse) should be
    # able to push trauma_score up substantially on its own, not be diluted
    # into a fixed-proportion average with four unrelated dimensions. Both
    # new weights are disclosed policy calibrations, not derived from any
    # dataset - same caveat as every other weight in this pipeline, pending
    # review by someone with real domain expertise.
    trauma_score = round(
        min(
            100.0,
            0.3 * threat_score
            + 0.25 * scaled("physical_harm")
            + 0.25 * scaled("fear")
            + 0.2 * scaled("hopelessness")
            + 0.35 * scaled("sexual_violence")
            + 0.3 * scaled("custodial_abuse"),
        ),
        1,
    )

    matched_suicidal_patterns = [p for p in SUICIDAL_PATTERNS if p in text_lower]
    suicidal_flag = (
        bool(matched_suicidal_patterns)
        or bool(_SUICIDAL_END_LIFE_RE.search(text_lower))
        or bool(_SUICIDAL_DONT_WANT_TO_LIVE_RE.search(text_lower))
    )
    matched_keywords = sorted({t for h in hits for t in h.matched_terms})

    # Transparency flag, not a confidence adjustment (see NlpIndicators'
    # docstring comment) - covers both the category keywords that drove the
    # scores above and any suicidal-ideation pattern that fired, since a
    # false positive/negative there is the highest-stakes failure mode.
    native_review_matched_terms = sorted(
        UNREVIEWED_LANGUAGE_TERMS.intersection(matched_keywords)
        | UNREVIEWED_LANGUAGE_TERMS.intersection(matched_suicidal_patterns)
    )
    native_review_recommended = bool(native_review_matched_terms)

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
        sexual_violence_score=scaled("sexual_violence"),
        custodial_abuse_score=scaled("custodial_abuse"),
        confidence=round(confidence, 1),
        category_hits=hits,
        matched_keywords=matched_keywords,
        suicidal_ideation_flag=suicidal_flag,
        word_count=word_count,
        authority_context_detected=authority_context_detected,
        victim_testimony_detected=victim_testimony_detected,
        native_review_recommended=native_review_recommended,
        native_review_matched_terms=native_review_matched_terms,
    )
