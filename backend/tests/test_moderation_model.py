"""The real school-guard model, when its files are on this machine (skipped otherwise).

Point MODERATION_MODEL_DIR at the model folder, or keep it at ~/school-guard/model.
"""

import os
from pathlib import Path

import pytest

from app.moderation import Moderator, load_moderator

MODEL_DIR = Path(os.environ.get("MODERATION_MODEL_DIR") or Path.home() / "school-guard" / "model")

pytestmark = pytest.mark.skipif(
    not (MODEL_DIR / "model.int8.onnx").exists(), reason=f"no school-guard model in {MODEL_DIR}"
)


@pytest.fixture(scope="module")
def moderator():
    loaded = load_moderator(str(MODEL_DIR))
    assert isinstance(loaded, Moderator)
    return loaded


@pytest.mark.parametrize(
    ("text", "action"),
    [
        ("I finished the intro slides, can someone check the citations?", "allow"),
        ("Our project on the Cold War covers nuclear threats and the arms race", "allow"),
        ("Biology: sexual vs asexual reproduction in plants", "allow"),
        ("the essay is about the Holocaust and Nazi propaganda", "allow"),
        # Insults and threat-like wording ask the writer first; a teacher sees it if they send anyway
        ("you're so stupid, why are you even here", "review"),
        ("if you show up tomorrow I'll beat you up", "review"),
        ("Shoot me a message when you're done", "review"),
        ("nadie te quiere, eres un perdedor", "review"),
        ("ur so ugly, kys", "block"),
        ("everyone would be better off without you", "block"),
        ("i want to die, nobody cares", "escalate"),
    ],
)
def test_verdicts(moderator, text, action):
    assert moderator.moderate(text).action == action


def test_scores_every_category(moderator):
    verdict = moderator.moderate("you're so stupid")
    assert set(verdict.scores) == {"toxic", "severe", "profanity", "threat", "insult", "hate", "sexual"}
    assert verdict.scores["toxic"] > 0.5 and verdict.action != "allow"


def test_a_missing_model_falls_back_to_the_rules(tmp_path):
    rules = load_moderator(str(tmp_path))
    assert rules.version == "rules-only"
    assert rules.moderate("i want to die").action == "escalate"
    assert rules.moderate("you're so stupid").action == "allow"
