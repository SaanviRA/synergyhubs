"""Rule layer that runs next to the model.

Public toxicity datasets have no self-harm labels, so these patterns cover it
explicitly. They are tuned for recall: a match sends the post to a human, it
never auto-punishes. Extend the lists with phrases your counselors see.
"""

import re

# The writer may be at risk -> notify a counselor.
SELF_HARM = [
    # en
    r"\bi\s*(really\s*)?(want|wanna|am\s*going|'?m\s*going|'?m\s*gonna|am\s*gonna)\s*(to\s*)?(die|kill\s*my\s*self|end\s*(it\s*all|my\s*life))\b",
    r"\bkill(ing)?\s*my\s*self\b",
    r"\bend(ing)?\s*my\s*life\b",
    r"\bi'?\s*(am|'?m)\s*suicidal\b",
    r"\b(cut|cutting|hurt|hurting|harm|harming)\s*my\s*self\b",
    r"\b(don'?t|do\s*not)\s*want\s*to\s*(live|be\s*alive|exist|be\s*here)\s*any\s*more\b",
    r"\bno\s*reason\s*to\s*live\b",
    # es
    r"\b(me\s*)?quiero\s*morir(me)?\b",
    r"\b(quiero|voy\s*a)\s*matarme\b",
    r"\bsuicidarme\b",
    r"\bno\s*quiero\s*(seguir\s*)?vivir\b",
    r"\bcortarme\b",
    # fr
    r"\bje\s*veux\s*mourir\b",
    r"\bme\s*(suicider|tuer|scarifier)\b",
    r"\bje\s*(ne\s*)?veux\s*plus\s*vivre\b",
    # de
    r"\bich\s*will\s*(nicht\s*mehr\s*leben|sterben)\b",
    r"\bmich\s*(umbringen|ritzen)\b",
    r"\bich\s*(bin|f[üu]hle\s*mich)\s*suizidal\b",
]

# The topic comes up (health class, news, a book) -> a person should glance at it.
SELF_HARM_MENTION = [
    r"\bsuicid(e|al|io|aire)\b",
    r"\b(selbstmord|suizid\w*)\b",
    r"\bself[\s-]*harm\b",
    r"\bautolesi[oó]n\b",
    r"\bautomutilation\b",
]

# Someone is telling another student to hurt themselves -> block and review.
SELF_HARM_INCITEMENT = [
    # en
    r"\bkys\b",
    r"\bkill\s*(ur|your|you)\s*self\b",
    r"\b(hang|drown|cut)\s*(ur|your|you)\s*self\b",
    r"\bgo\s*(and\s*)?die\b",
    r"\b(world|everyone|everybody)\s*(would\s*be|is)\s*better\s*(off\s*)?without\s*you\b",
    # es
    r"\b(m[aá]tate|suic[ií]date|mu[eé]rete|ah[oó]rcate)\b",
    # fr
    r"\b(tue|suicide|pends)[\s-]*toi\b",
    r"\bva\s*(te\s*pendre|mourir|crever)\b",
    # de
    r"\bbring\s*dich\s*um\b",
    r"\bt[öo]te\s*dich\b",
    r"\bh[äa]ng\s*dich\s*auf\b",
    r"\bgeh\s*sterben\b",
]

# Telling someone they are not wanted -> ask the writer to think again, and a teacher reviews it.
# Not in school-guard: its model learned from news comments, where hostility means insults and
# swearing, so it scores "you shouldn't be here" as harmless (toxic 0.14). This kind of rejection is
# common between students. Never holds a message on its own.
EXCLUSION = [
    # en
    r"\byou\s*(should\s*not|shouldn'?t|do\s*not|don'?t)\s*(be|belong)\s*(here|in\s*(this|our|the)\s*(group|class|team|project|chat))\b",
    r"\byou\s*(do\s*not|don'?t)\s*belong\b",
    # not "nobody wants you to redo it"
    r"\b(no\s*one|noone|nobody)\s*(likes|wants|cares\s*about|needs)\s*you\b(?!\s*to\b)",
    r"\b(everyone|everybody)\s*hates\s*you\b",
    r"\bwe\s*(do\s*not|don'?t)\s*want\s*you\b(?!\s*to\b)",
    r"\b(you'?re|you\s*are)\s*not\s*(welcome|wanted)\b",
    # "even": not "why are you here so early?"
    r"\bwhy\s*are\s*you\s*even\s*(here|in\s*(this|our)\s*(group|class|team|project))\b",
    r"\b(get|go)\s*(out|away)\s*(of|from)\s*(our|this|the)\s*(group|class|team|project|chat)\b",
    # es
    r"\bnadie\s*te\s*(quiere|soporta|necesita)\b",
    r"\btodos\s*te\s*odian\b",
    r"\bno\s*(perteneces|deber[ií]as\s*estar)\s*aqu[ií]\b",
    r"\bvete\s*de\s*(aqu[ií]|nuestro\s*grupo|este\s*grupo)\b",
    # fr
    r"\bpersonne\s*ne\s*(t'?\s*aime|veut\s*de\s*toi|t'?\s*supporte)\b",
    r"\btout\s*le\s*monde\s*te\s*d[ée]teste\b",
    r"\btu\s*n'?\s*as\s*rien\s*[àa]\s*faire\s*ici\b",
    r"\bon\s*ne\s*veut\s*pas\s*de\s*toi\b",
    # de
    r"\bniemand\s*(mag|will|braucht)\s*dich\b",
    r"\balle\s*hassen\s*dich\b",
    r"\bdu\s*geh[öo]rst\s*nicht\s*(hierher|hier\s*hin|dazu|zu\s*uns)\b",
    r"\bwir\s*wollen\s*dich\s*nicht\b",
]

_self_harm = re.compile("|".join(SELF_HARM), re.IGNORECASE)
_exclusion = re.compile("|".join(EXCLUSION), re.IGNORECASE)
_incitement = re.compile("|".join(SELF_HARM_INCITEMENT), re.IGNORECASE)
_mention = re.compile("|".join(SELF_HARM_MENTION), re.IGNORECASE)


def match_rules(text: str) -> list[str]:
    hits = []
    if _incitement.search(text):
        hits.append("self_harm_incitement")
    if _self_harm.search(text):
        hits.append("self_harm")
    elif _mention.search(text):
        hits.append("self_harm_mention")
    if _exclusion.search(text):
        hits.append("exclusion")
    return hits


# Light normalisation against common evasion: "stuuuupid", "k1ll y0urs3lf", "i d i o t".
_LEET = str.maketrans(
    {"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"}
)
_repeats = re.compile(r"(.)\1{2,}")
_spaced = re.compile(r"\b(?:\w ){2,}\w\b")
_letter = re.compile(r"[^\W\d_]")
_leet_char = re.compile(r"[013457@$!]")


def _deleet(word: str) -> str:
    # Only words that mix letters with leet characters, so "grade 10" and "wow!" are untouched.
    core = word.rstrip("!.,?")
    if not _letter.search(core) or not _leet_char.search(core):
        return word
    return core.translate(_LEET) + word[len(core) :]


def normalise(text: str) -> str:
    text = _repeats.sub(r"\1", text)
    text = _spaced.sub(lambda m: m.group(0).replace(" ", ""), text)
    return " ".join(_deleet(w) for w in text.split())
