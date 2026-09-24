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
        # More real threat phrasings not covered by the single-verb keywords
        # above - acid attacks are a specific, well-documented form of caste/
        # gender-based violence in India, and "finish you off"/"won't let
        # you live" are common real threat idioms that don't contain any of
        # the existing keywords. English + Hindi only for this addition.
        "throw acid", "throwing acid", "acid attack", "stab you", "shoot you", "burn you alive",
        "burn alive", "finish you off", "won't let you live", "wont let you live",
        "dhamki", "jaan se maar", "maar denge", "धमकी", "जान से मार",
        "एसिड फेंकेंगे", "जिंदा जला देंगे", "गोली मार देंगे",  # Hindi
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
        # Common real intimidation idioms - a witness/complainant is often
        # warned this way rather than with an explicit "consequences"-style
        # phrase. English + Hindi only for this addition.
        "teach you a lesson", "teach him a lesson", "teach her a lesson",
        "teach me a lesson", "teach us a lesson",
        "show you your place", "put you in your place", "make an example of you",
        "badla", "बदला", "अंजाम देंगे",
        "सबक सिखाएंगे", "औकात दिखाएंगे",  # Hindi
    ],
    "fear": [
        "afraid", "scared", "terrified", "fear", "frightened", "panic", "unsafe", "dare not", "cannot sleep",
        # Stress/anxiety-symptom vocabulary added alongside acute fear -
        # these feed fear_score, which in turn drives emotion_engine's
        # anxiety/distress outputs (see emotion_engine.py: anxiety = 0.5 *
        # fear_score + ...), so this is where "stress"-adjacent narrative
        # language should live rather than a brand-new lexicon dimension.
        # English + Hindi only for this addition (grow-as-reviewed, same
        # narrower scope already applied to this session's other additions),
        # even though "fear" itself is one of the original eight-language
        # categories.
        "anxious", "anxiety", "panic attack", "trembling", "shaking", "can't sleep", "cannot fall asleep",
        "restless", "heart racing", "paranoid", "hypervigilant", "jumpy", "on edge", "startled easily",
        "overwhelmed", "can't cope", "cannot cope", "constant worry", "worried all the time", "can't calm down",
        "darr", "dari", "darta", "darte", "ghabra", "डर", "डरा", "भय",  # Hindi
        "चिंता", "घबराहट", "बेचैनी", "तनाव में",  # Hindi (anxiety/restlessness/stress)
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
        # Stress/burnout-adjacent despair language - distinct from acute
        # fear (above) and from the suicidal-ideation patterns (below): this
        # is chronic exhaustion and depletion talk, still real hopelessness
        # signal. English + Hindi only for this addition.
        "exhausted", "drained", "worn out", "mentally exhausted", "burned out", "burnt out",
        "breaking down", "can't take it anymore", "cant take it anymore", "can't take this anymore",
        "cannot take it anymore", "cannot take this anymore",

        "umeed nahi", "उम्मीद नहीं", "बेबस", "थक चुकी हूं", "थक चुका हूं",  # Hindi
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
        # Specific, real caste-based untouchability practices (kept in
        # isolation, not caste_targeting, since these ARE the social-
        # exclusion mechanism, not just a caste identifier) - separate
        # utensils/seating is one of the most commonly reported forms of
        # everyday discrimination against Dalit households. English + Hindi
        # only for this addition.
        "separate utensils", "separate plates", "separate glass", "separate cups",
        "not allowed to sit with them", "made to sit separately", "treated as untouchable",
        "excommunicated", "cut off from the village",
        "akela", "अकेला", "बहिष्कार",
        "अलग बर्तन", "अलग थाली", "साथ बैठने नहीं दिया", "अछूत माना",  # Hindi
        "एकटा", "एकटी", "बहिष्कार",  # Marathi
        "একা", "বয়কট",  # Bengali
        "ఒంటరిగా", "వెలివేత",  # Telugu
        "தனியாக", "புறக்கணிப்பு",  # Tamil
        "ಒಂಟಿ", "ಬಹಿಷ್ಕಾರ",  # Kannada
        "ଏକୁଟିଆ", "ବହିଷ୍କାର",  # Odia
    ],
    "vulnerability": [
        "children", "alone at home", "elderly", "disabled", "pregnant", "widow", "single mother",
        # More compounding-vulnerability factors not covered above. English
        # + Hindi only for this addition.
        "newborn", "infant", "mentally ill", "orphan", "blind", "deaf and mute", "chronically ill",
        "bachche", "बच्चे",
        "नवजात", "अनाथ", "मानसिक रूप से बीमार",  # Hindi
        "मुले", "वृद्ध",  # Marathi
        "শিশু", "বৃদ্ধ",  # Bengali
        "పిల్లలు", "వృద్ధులు",  # Telugu
        "குழந்தைகள்", "முதியவர்",  # Tamil
        "ಮಕ್ಕಳು", "ವೃದ್ಧ",  # Kannada
        "ପିଲାମାନେ", "ବୃଦ୍ଧ",  # Odia
    ],
    "physical_harm": [
        "hit", "struck", "beaten", "injured", "wound", "bleeding", "hospital", "unconscious", "assault",
        # More severe physical-assault evidence not covered by the terms
        # above - acid attacks and burning are specific, well-documented
        # forms of caste/gender-based violence. English + Hindi only for
        # this addition.
        "acid attack", "threw acid on me", "burned alive", "set on fire", "stabbed", "shot",
        "broken bones", "fracture", "disfigured",
        # Classic post-traumatic symptom language - distinct from the
        # physical-assault evidence above, but folds into the same
        # trauma_score composite (see analyze()'s trauma_score formula) since
        # this dimension is what feeds trauma_score directly, not because
        # these words describe a physical injury themselves. English + Hindi
        # only for this addition.
        "traumatized", "trauma", "ptsd", "post-traumatic stress", "flashbacks", "flashback",
        "nightmares about it", "haunted by", "haunts me", "keeps replaying in my head",
        "relive it every day", "can't forget what happened", "cant forget what happened",
        "maara", "मारा", "चोट", "सदमा", "मानसिक आघात",
        "जला दिया", "आग लगा दी", "गोली मारी", "चाकू मारा",  # Hindi
        "मारहाण", "जखम",  # Marathi
        "মারধর", "আঘাত",  # Bengali
        "కొట్టారు", "గాయం",  # Telugu
        "அடித்தார்கள்", "காயம்",  # Tamil
        "ಹೊಡೆದರು", "ಗಾಯ",  # Kannada
        "ମାଡ଼", "ଆଘାତ",  # Odia
    ],
    "caste_targeting": [
        "caste", "sc/st", "dalit", "untouchab", "land dispute", "do not belong", "temple",
        # More specific, real caste-identity/targeting language not covered
        # by the terms above. English + Hindi only for this addition.
        "scheduled caste", "scheduled tribe", "backward caste", "upper caste", "lower caste",
        "caste slur", "casteist remark", "caste-based discrimination", "because of my caste",
        "because we are dalit",
        "jaati", "जाति",
        "अनुसूचित जाति", "अनुसूचित जनजाति", "जातिसूचक", "जाति के आधार पर",  # Hindi
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
        # Gang rape and attempted rape are legally and narratively distinct
        # from the terms above (aggravated offence / inchoate offence under
        # IPC) and complainants frequently use this exact phrasing.
        "gang rape", "gang raped", "gang-raped", "attempted rape", "tried to rape",
        "बलात्कार", "छेड़छाड़", "यौन उत्पीड़न",
        "सामूहिक बलात्कार", "बलात्कार की कोशिश",  # Hindi
    ],
    "custodial_abuse": [
        "custodial death", "died in custody", "custodial torture", "beaten in custody", "police custody",
        "third degree", "custody death",
        "हिरासत में मौत", "हिरासत में मारपीट", "थाने में मारपीट",  # Hindi
    ],
    # Two more atrocity-specific categories, same English+Hindi-only,
    # grow-as-reviewed scope as sexual_violence/custodial_abuse above -
    # chronic/structural harms (not immediate-emergency-tier), so unlike
    # those two, these feed the SVI directly via svi_engine.WEIGHTS rather
    # than a safety floor.
    "bonded_labor": [
        "bonded labor", "bonded labour", "forced labor", "forced labour", "unpaid labor", "unpaid labour",
        "denied wages", "wages denied", "debt bondage", "forced to work without pay",
        "बंधुआ मजदूरी", "मजदूरी नहीं दी", "जबरन मजदूरी",  # Hindi
    ],
    "land_displacement": [
        "land grab", "illegally occupied our land", "evicted from our land", "forced eviction",
        "encroached our land", "took our land", "grabbed our land",
        "जमीन कब्जा", "जमीन से बेदखल",  # Hindi
    ],
    # child_marriage is treated as immediate-emergency tier (same as
    # sexual_violence/custodial_abuse - gets the SVI safety floor below,
    # not just a diluted weight): forcing a minor into marriage is itself
    # grave, ongoing exploitation of a child, not a one-time historical harm.
    "child_marriage": [
        "child marriage", "underage marriage", "married off", "forced marriage", "married before 18",
        "बाल विवाह", "जबरन शादी", "नाबालिग विवाह",  # Hindi
    ],
    # digital_harassment is chronic/structural tier (same as bonded_labor/
    # land_displacement - a weighted SVI input, not a floor).
    "digital_harassment": [
        "morphed photo", "morphed image", "cyberbullying", "cyber bullying", "online harassment",
        "leaked my photo", "blackmail", "doxxed", "doxxing", "fake profile", "obscene messages",
        # More specific, real forms of online abuse not covered above.
        # English only for this addition - these are recent internet-slang
        # terms without an established, reliable Hindi equivalent yet;
        # inventing one would carry more mistranslation risk than leaving
        # the gap, consistent with this lexicon's grow-as-reviewed policy.
        "revenge porn", "sextortion", "catfished", "hacked my account", "impersonating me online",
        "फर्जी फोटो", "साइबर उत्पीड़न", "अश्लील संदेश",  # Hindi
    ],
    # manual_scavenging is chronic/structural tier (same as bonded_labor/
    # land_displacement/digital_harassment - a weighted SVI input, not a
    # floor): a specific, well-documented SC atrocity distinct from generic
    # bonded_labor - forced manual handling of human excreta/waste, banned
    # outright by the Prohibition of Employment as Manual Scavengers Act,
    # 2013, and still coerced onto Dalit communities in practice.
    "manual_scavenging": [
        "manual scavenging", "manual scavenger", "forced to clean human waste", "forced to clean excreta",
        "cleaning sewers by hand", "cleaning gutters by hand", "forced into the sewer", "clean the toilets by hand",
        "cleaning dry latrines", "carrying human waste on his head", "carrying human waste on her head",
        "cleaning septic tanks by hand",
        "मैला ढोना", "सिर पर मैला", "हाथ से मैला",  # Hindi
    ],
    # public_humiliation is immediate-emergency tier (same as sexual_violence/
    # custodial_abuse/child_marriage - joins the SVI safety floor below): a
    # specific, recurring form of caste atrocity under Section 3(1) of the
    # SC/ST (Prevention of Atrocities) Act - parading a victim naked,
    # garlanding with footwear, forced consumption of human excreta/urine, or
    # public tonsuring/face-blackening. This is deliberate public degradation
    # designed to humiliate on the basis of caste, not a lesser harm than the
    # other severe-tier categories, and deserves the same hard floor rather
    # than being left to a diluted composite.
    "public_humiliation": [
        "paraded naked", "parading naked", "paraded him naked", "paraded her naked",
        "garlanded with footwear", "garlanded with shoes", "garlanded with slippers",
        "forced to eat human excreta", "forced to eat excreta", "forced to drink urine",
        "tonsured his head", "tonsured her head", "blackened his face", "blackened her face",
        # More real forms of public degradation not covered above -
        # beatings with footwear (a deliberate caste insult distinct from
        # ordinary physical assault) and forced removal of footwear/spitting
        # are commonly reported alongside the terms above.
        "beaten with shoes", "beaten with slippers", "beaten with footwear",
        "forced to remove his footwear", "forced to remove her footwear", "made to walk barefoot",
        "spat on him", "spat on her",
        "नंगा घुमाया", "जूतों की माला", "मुंह काला किया",
        "जूतों से पीटा",  # Hindi
    ],
    # public_access_denial is chronic/structural tier (same as bonded_labor/
    # land_displacement/digital_harassment/manual_scavenging - a weighted
    # SVI input, not a floor): denying a Dalit/Adivasi person access to a
    # shared water source, temple, or other public place on the basis of
    # caste is one of the most commonly cited, specifically enumerated forms
    # of atrocity under Section 3(1) of the SC/ST (Prevention of Atrocities)
    # Act - distinct from the generic "denied entry"/"not allowed to enter"
    # phrasing already in the isolation category (which covers social
    # exclusion broadly, not this specific, legally-named harm).
    "public_access_denial": [
        "denied access to the well", "denied access to the water", "not allowed to draw water",
        "not allowed to fetch water", "barred from the temple", "denied entry to the temple",
        "not allowed to enter the temple", "denied access to the pond", "not allowed to use the common well",
        # Denial of ordinary commercial/public services on the basis of
        # caste is just as commonly reported as the water/temple-specific
        # forms above.
        "denied service", "refused service", "not served at the shop", "denied entry to the shop",
        "not allowed on the bus",
        "पानी नहीं लेने दिया", "मंदिर में प्रवेश नहीं", "कुएं से पानी नहीं भरने दिया",
        "दुकान में सामान नहीं दिया", "बस में बैठने नहीं दिया",  # Hindi
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
    # Direct 1:1 fields (like vulnerability/caste_targeting), not folded
    # into trauma_score/threat_score - these are chronic/structural harms
    # that feed the SVI directly via svi_engine.WEIGHTS instead.
    bonded_labor_score: float = 0.0
    land_displacement_score: float = 0.0
    # child_marriage feeds the SVI safety floor (immediate-emergency tier,
    # like sexual_violence/custodial_abuse); digital_harassment feeds a
    # direct SVI weight (chronic tier, like bonded_labor/land_displacement).
    child_marriage_score: float = 0.0
    digital_harassment_score: float = 0.0
    # manual_scavenging: chronic tier, direct SVI weight (like bonded_labor/
    # land_displacement/digital_harassment). public_humiliation: immediate-
    # emergency tier, joins the SVI safety floor (like sexual_violence/
    # custodial_abuse/child_marriage).
    manual_scavenging_score: float = 0.0
    public_humiliation_score: float = 0.0
    # public_access_denial: chronic tier, direct SVI weight (like
    # bonded_labor/land_displacement/digital_harassment/manual_scavenging).
    public_access_denial_score: float = 0.0
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
    # True when at least one keyword match was discounted because it fell
    # inside a detected negation's scope (see negation_engine.py) - a
    # transparency flag, same "flag, don't silently trust" philosophy as
    # native_review_recommended above. Negation scoping is a heuristic, not
    # certainty, so any case where it actually changed something gets
    # flagged for human review rather than trusted outright - see main.py's
    # requires_priority_review.
    negation_scoping_applied: bool = False
    negation_discounted_terms: list[str] = field(default_factory=list)


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
_THREAT_FUTURE_VIOLENCE_RE = re.compile(r"\b(?:will|gonna|going to)\b(?:\s+\w+){0,3}\s+(?:kill|beat|burn|hurt|harm|attack|rape|stab|shoot)\b")

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

# Generalizes "bonded_labor" beyond the literal phrase list - "forced to
# work for months without any pay", "forced to work and never got wages",
# etc. share this structure without one fixed substring.
_BONDED_LABOR_FORCED_WORK_RE = re.compile(r"\bforced\s+to\s+work\b(?:\s+\w+){0,6}\s+(?:without|no)\b(?:\s+\w+){0,2}\s+(?:pay|wages|payment|money)\b")

# Generalizes "land_displacement" beyond the literal phrase list - "forced
# us to leave our land", "forced them out of their home", etc.
_LAND_DISPLACEMENT_FORCED_RE = re.compile(r"\bforced\s+(?:us|me|them|him|her)\b(?:\s+\w+){0,4}\s+(?:leave|off|out of)\b(?:\s+\w+){0,3}\s+(?:land|home|house)\b")

# Generalizes "child_marriage" beyond the literal phrase list - "married at
# the age of 13", "married off at 14", "married at 9", etc. share a
# "married ... at ... [age under 18]" structure. Ages 1-17 only, deliberately
# (an adult marriage mentioning an age isn't this signal).
_CHILD_MARRIAGE_AGE_RE = re.compile(r"\bmarried\s+(?:off\s+)?at\s+(?:the\s+age\s+of\s+)?(?:1[0-7]|[1-9])\b")
# "forced her/him/me/them to marry" - a common real phrasing for a forced
# marriage that doesn't always use the literal word "marriage".
_CHILD_MARRIAGE_FORCED_RE = re.compile(r"\bforced\s+(?:her|him|me|us|them)\s+to\s+marry\b")

# Generalizes "digital_harassment" beyond the literal phrase list -
# "posted my photos online without my consent", "shared her pictures
# without permission", etc.
_DIGITAL_HARASSMENT_POSTED_RE = re.compile(
    r"\b(?:posted|shared|uploaded)\b(?:\s+\w+){0,4}\s+(?:photo|photos|video|videos|image|images|picture|pictures)\b(?:\s+\w+){0,10}\s+(?:without|no)\b(?:\s+\w+){0,2}\s+(?:consent|permission)\b",
)

# Generalizes "manual_scavenging" beyond the literal phrase list - "forced to
# clean the drains with his bare hands", "made to clear human waste from the
# gutters", etc. share a "forced/made ... to clean ... (waste/excreta/sewer/
# gutter/drain)" structure without one fixed substring.
_MANUAL_SCAVENGING_FORCED_RE = re.compile(
    r"\b(?:forced|made)\b(?:\s+\w+){0,4}\s+(?:clean|clear|remove)\b(?:\s+\w+){0,6}\s+(?:waste|excreta|sewer|sewers|gutter|gutters|drain|drains|toilet|toilets)\b",
)

# Generalizes "public_humiliation" beyond the literal phrase list - "made him
# eat human waste in front of the whole village", "forced her to drink his
# urine while everyone watched", etc.
_PUBLIC_HUMILIATION_FORCED_RE = re.compile(
    r"\b(?:forced|made)\b(?:\s+\w+){0,4}\s+(?:eat|drink|consume)\b(?:\s+\w+){0,6}\s+(?:excreta|urine|waste|faeces|feces)\b",
)
# "paraded ... naked" - a common real phrasing not always adjacent
# ("paraded him through the village naked").
_PUBLIC_HUMILIATION_PARADED_RE = re.compile(r"\bparaded\b(?:\s+\w+){0,6}\s+naked\b")

# Generalizes the footwear-removal humiliation phrasing beyond the literal
# "forced to remove his/her footwear" - "made them take off their shoes",
# "forced him to take off his slippers", etc.
_PUBLIC_HUMILIATION_FOOTWEAR_RE = re.compile(
    r"\b(?:forced|made)\b(?:\s+\w+){0,4}\s+(?:remove|take off)\b(?:\s+\w+){0,4}\s+(?:footwear|shoes|slippers|chappal)\b",
)

# Generalizes "public_access_denial" beyond the literal phrase list - "we
# were not allowed to take water from the village well", "they refused to
# let us enter the temple", etc. share a "not allowed/refused ... to
# draw/enter/use ... water/well/temple/pond" structure without one fixed
# substring covering all word orders.
_PUBLIC_ACCESS_DENIAL_RE = re.compile(
    r"\b(?:not\s+allowed|refused|forbidden|barred)\b(?:\s+\w+){0,6}\s+(?:draw|fetch|take|use|enter)\b"
    r"(?:\s+\w+){0,4}\s+(?:water|well|temple|pond)\b",
)

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


# A discounted (negated) occurrence still counts for something - negation
# scoping is a heuristic, not certainty (see negation_engine.py's module
# docstring on scope-termination being imperfect), so a wrongly-negated real
# threat isn't fully erased, only heavily discounted. Same "discount, never
# zero out" philosophy as every other soft signal in this pipeline.
_NEGATED_OCCURRENCE_WEIGHT = 0.15


def _find_occurrences(text_lower: str, terms: list[str]) -> list[tuple[str, int, int]]:
    """Every (term, start, end) character-span match for `terms` in
    `text_lower` - the position data _category_score used to discard by
    only keeping a count. Needed so negation scoping (which operates on
    exact spans, not term identity) can be checked per-occurrence."""
    occurrences: list[tuple[str, int, int]] = []
    for term in terms:
        term_l = term.lower()
        for m in _term_pattern(term_l).finditer(text_lower):
            occurrences.append((term, m.start(), m.end()))
    return occurrences


def _category_score(
    occurrences: list[tuple[str, int, int]],
    negated_spans: frozenset[tuple[int, int]] = frozenset(),
) -> tuple[CategoryHit, list[str]]:
    """Builds a CategoryHit from pre-found occurrences (see
    _find_occurrences), discounting any occurrence whose exact span is in
    `negated_spans` (see negation_engine.find_negated_spans) instead of the
    old whole-text negation penalty. Returns (hit, discounted_term_names)
    so the caller can report which terms were affected, for transparency.

    Diminishing returns are preserved within each group (active vs.
    negated) separately - first hit in a group counts fully, later ones
    less - then the negated group's contribution is scaled down by
    _NEGATED_OCCURRENCE_WEIGHT before combining, rather than treating every
    occurrence as equally "the i-th hit overall" regardless of whether it
    was negated.
    """
    active = [o for o in occurrences if (o[1], o[2]) not in negated_spans]
    negated = [o for o in occurrences if (o[1], o[2]) in negated_spans]

    raw = sum(1 / (i + 1) for i in range(len(active)))
    raw += _NEGATED_OCCURRENCE_WEIGHT * sum(1 / (i + 1) for i in range(len(negated)))
    score = float(min(100.0, raw * 45))

    matched = sorted({o[0] for o in occurrences})
    discounted_terms = sorted({o[0] for o in negated})
    return CategoryHit(category="", matched_terms=matched, raw_count=len(occurrences), score=score), discounted_terms


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

    occurrences_by_cat: dict[str, list[tuple[str, int, int]]] = {
        category: _find_occurrences(text_lower, terms) for category, terms in LEXICON.items()
    }

    # Scoped negation (see negation_engine.py) replaces the old whole-text
    # penalty when the optional dependency is available - one spaCy pass
    # over the whole narrative, checking every category's occurrences at
    # once, rather than per-category. Falls back to "nothing negated here"
    # (empty set) on any failure - the legacy whole-text penalty further
    # below is the safety net for exactly that case.
    negation_available = False
    negated_spans: frozenset[tuple[int, int]] = frozenset()
    from app.config import get_settings

    if not get_settings().disable_negation_scoping:
        from app.engines import negation_engine

        all_spans = [(start, end) for occs in occurrences_by_cat.values() for (_, start, end) in occs]
        negation_result = negation_engine.find_negated_spans(text_lower, all_spans)
        negation_available = negation_result.available
        negated_spans = frozenset(negation_result.negated_spans)

    hits: list[CategoryHit] = []
    negation_discounted_terms: set[str] = set()
    for category, occurrences in occurrences_by_cat.items():
        hit, discounted = _category_score(occurrences, negated_spans)
        hit.category = category
        if discounted:
            hit.matched_terms.extend(f"(negated) {t}" for t in discounted)
            negation_discounted_terms.update(discounted)
        hits.append(hit)

    by_cat = {h.category: h for h in hits}
    _apply_structural_pattern(by_cat["threat"], _THREAT_FUTURE_VIOLENCE_RE, text_lower, "future violence threat")
    _apply_structural_pattern(by_cat["sexual_violence"], _SEXUAL_VIOLENCE_FORCED_RE, text_lower, "forced ... on/upon")
    _apply_structural_pattern(by_cat["custodial_abuse"], _CUSTODIAL_DEATH_RE, text_lower, "died/death ... custody")
    _apply_structural_pattern(by_cat["bonded_labor"], _BONDED_LABOR_FORCED_WORK_RE, text_lower, "forced to work ... without pay")
    _apply_structural_pattern(by_cat["land_displacement"], _LAND_DISPLACEMENT_FORCED_RE, text_lower, "forced ... off/out of land/home")
    _apply_structural_pattern(by_cat["child_marriage"], _CHILD_MARRIAGE_AGE_RE, text_lower, "married ... at [age under 18]")
    _apply_structural_pattern(by_cat["child_marriage"], _CHILD_MARRIAGE_FORCED_RE, text_lower, "forced ... to marry")
    _apply_structural_pattern(by_cat["digital_harassment"], _DIGITAL_HARASSMENT_POSTED_RE, text_lower, "posted/shared ... photo ... without consent")
    _apply_structural_pattern(by_cat["manual_scavenging"], _MANUAL_SCAVENGING_FORCED_RE, text_lower, "forced/made ... to clean ... waste/sewer")
    _apply_structural_pattern(by_cat["public_humiliation"], _PUBLIC_HUMILIATION_FORCED_RE, text_lower, "forced/made ... to eat/drink ... excreta/urine")
    _apply_structural_pattern(by_cat["public_humiliation"], _PUBLIC_HUMILIATION_PARADED_RE, text_lower, "paraded ... naked")
    _apply_structural_pattern(by_cat["public_humiliation"], _PUBLIC_HUMILIATION_FOOTWEAR_RE, text_lower, "forced/made ... to remove/take off ... footwear")
    _apply_structural_pattern(by_cat["public_access_denial"], _PUBLIC_ACCESS_DENIAL_RE, text_lower, "not allowed/refused ... water/well/temple/pond")
    intensifier_boost = 1.0 + 0.1 * sum(1 for i in INTENSIFIERS if i in text_lower)
    if negation_available:
        # Scoped, per-occurrence negation already applied inside
        # _category_score above (see occurrences_by_cat/negated_spans) -
        # the old whole-text penalty below would double-penalize the exact
        # same negation words a second time, so it's skipped entirely here.
        negation_penalty = 1.0
    else:
        # Fallback for when negation_engine's optional dependency isn't
        # installed (or failed to build) - the original whole-text penalty,
        # unchanged, so nothing regresses for a deployment that hasn't
        # opted in. Negation is scanned on the text with matched multi-word
        # lexicon phrases blanked out first - otherwise a phrase that
        # itself contains a negation word (e.g. "do not belong", the
        # caste-targeting trigger phrase) gets wrongly discounted as if
        # something else nearby had been negated, instead of being
        # recognized as the very signal it's supposed to be.
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
    # (0.3 + 0.25 + 0.25 + 0.2 + 0.35 + 0.3 + 0.3 = 1.95) - same reasoning
    # svi_engine.py's own module docstring gives for its weights: a single
    # severe, specific signal (sexual violence, custodial abuse, public
    # humiliation) should be able to push trauma_score up substantially on
    # its own, not be diluted into a fixed-proportion average with four
    # unrelated dimensions. Every new weight is a disclosed policy
    # calibration, not derived from any dataset - same caveat as every other
    # weight in this pipeline, pending review by someone with real domain
    # expertise.
    trauma_score = round(
        min(
            100.0,
            0.3 * threat_score
            + 0.25 * scaled("physical_harm")
            + 0.25 * scaled("fear")
            + 0.2 * scaled("hopelessness")
            + 0.35 * scaled("sexual_violence")
            + 0.3 * scaled("custodial_abuse")
            + 0.3 * scaled("public_humiliation"),
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

    # HONESTY NOTE: this is NOT a measure of how certain the model is about
    # the severity it computed - it is a proxy for how much text there was
    # to analyze (more words -> a higher number, capped at 95%). A one-line
    # narrative and a ten-paragraph one describing the same severity would
    # score this very differently even though the underlying category
    # scores could be equally well-supported. Surfaced to the UI as
    # "Confidence" with no qualifier before this comment existed - see the
    # frontend's own label for how that reads to staff. Kept as-is (not
    # renamed) to avoid a wider blast radius across every consumer of this
    # field; the UI label is what actually needed fixing.
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
        bonded_labor_score=scaled("bonded_labor"),
        land_displacement_score=scaled("land_displacement"),
        child_marriage_score=scaled("child_marriage"),
        digital_harassment_score=scaled("digital_harassment"),
        manual_scavenging_score=scaled("manual_scavenging"),
        public_humiliation_score=scaled("public_humiliation"),
        public_access_denial_score=scaled("public_access_denial"),
        confidence=round(confidence, 1),
        category_hits=hits,
        matched_keywords=matched_keywords,
        suicidal_ideation_flag=suicidal_flag,
        word_count=word_count,
        authority_context_detected=authority_context_detected,
        victim_testimony_detected=victim_testimony_detected,
        native_review_recommended=native_review_recommended,
        native_review_matched_terms=native_review_matched_terms,
        negation_scoping_applied=bool(negation_discounted_terms),
        negation_discounted_terms=sorted(negation_discounted_terms),
    )
