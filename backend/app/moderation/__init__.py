"""Checks chat messages for bullying and self-harm with the school-guard classifier.

Two layers, as in school-guard: an int8 ONNX model scores each message for toxic, severe, profanity,
threat, insult, hate and sexual, and a rule layer (patterns.py) catches self-harm phrasing. Every
message gets one of four actions:

  allow     nothing flagged: the message is posted
  review    something mildly flagged: the writer is asked "are you sure?" first; if they send it
            anyway it is posted and a teacher reviews it
  block     held: only the writer sees it until a teacher decides
  escalate  held, and the writer may be at risk of self-harm: alert people right away

The model needs onnxruntime, sentencepiece, numpy and the model files in MODERATION_MODEL_DIR. When
any of that is missing the rule layer still runs on its own (RulesOnly), so self-harm and "kys"-style
messages are still caught and chat keeps working.
"""

import hashlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from .patterns import match_rules, normalise

logger = logging.getLogger("group_app")

MAX_WINDOWS = 8  # long messages are scored in overlapping windows; cap the work
STRIDE = 32  # tokens shared between neighbouring windows
BOS, EOS, UNK = 0, 2, 3  # XLM-R special ids; SentencePiece ids are shifted by +1

# Model categories that hold a message instead of posting it. school-guard also holds on "threat", but
# its threat score reacts to violent words rather than intent: "I'll shoot you an email" (0.71) scores
# above "I'll beat you up" (0.66). So a threat goes to review instead: the writer is asked to think
# again, and if they send it anyway a teacher sees it.
BLOCKING = {"severe", "hate", "sexual"}


@dataclass
class Verdict:
    action: str  # allow | review | block | escalate
    categories: list[str] = field(default_factory=list)
    scores: dict[str, float] = field(default_factory=dict)


def decide(text: str, flagged: list[str], scores: dict[str, float]) -> Verdict:
    """Combines the model's flagged categories with the rule layer."""
    rules = sorted(set(match_rules(text)) | set(match_rules(normalise(text))))
    categories = rules + flagged
    if "self_harm" in rules:
        action = "escalate"
    elif "self_harm_incitement" in rules or BLOCKING & set(flagged):
        action = "block"
    elif categories:
        action = "review"
    else:
        action = "allow"
    return Verdict(action, categories, scores)


class RulesOnly:
    """The rule layer alone, for when the model is not available."""

    version = "rules-only"

    def moderate(self, text: str) -> Verdict:
        text = text.strip()
        return decide(text, [], {}) if text else Verdict("allow")


class Moderator:
    """The school-guard model plus the rule layer. Load once; moderate() is safe to call from threads."""

    def __init__(self, model_dir: Path):
        import numpy as np
        import onnxruntime as ort
        import sentencepiece as spm

        self._np = np
        config_text = (model_dir / "config.json").read_text()
        cfg = json.loads(config_text)
        self.labels: list[str] = cfg["labels"]
        self.thresholds: dict[str, float] = cfg["thresholds"]
        self.pad_id: int = cfg["pad_id"]
        self.body_len: int = cfg["max_len"] - 2
        # Stored with each flag, so reviewed flags can be traced to the model and thresholds used
        model_file = model_dir / "model.int8.onnx"
        digest = hashlib.sha256(f"{config_text}{model_file.stat().st_size}".encode()).hexdigest()
        self.version = f"school-guard-{digest[:12]}"

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        opts.enable_cpu_mem_arena = False  # trades a little speed for a lower, flatter memory use
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(str(model_file), opts, providers=["CPUExecutionProvider"])
        self.sp = spm.SentencePieceProcessor(model_file=str(model_dir / "sentencepiece.bpe.model"))

    def _windows(self, text: str) -> list[list[int]]:
        ids = [i + 1 if i else UNK for i in self.sp.encode(text)]
        step = self.body_len - STRIDE
        starts = list(range(0, max(len(ids) - STRIDE, 1), step))
        if len(starts) > MAX_WINDOWS:  # very long message: keep the start and always the ending
            starts = starts[: MAX_WINDOWS - 1] + starts[-1:]
        return [[BOS, *ids[s : s + self.body_len], EOS] for s in starts]

    def score(self, text: str) -> dict[str, float]:
        """Probability per category; the max over windows and over the raw and normalised text."""
        np = self._np
        variants = {text, normalise(text)}
        windows = [w for v in variants for w in self._windows(v)]
        width = max(len(w) for w in windows)
        ids = np.full((len(windows), width), self.pad_id, dtype=np.int64)
        mask = np.zeros_like(ids)
        for i, w in enumerate(windows):
            ids[i, : len(w)] = w
            mask[i, : len(w)] = 1
        logits = self.session.run(None, {"input_ids": ids, "attention_mask": mask})[0]
        probs = (1 / (1 + np.exp(-logits))).max(axis=0)
        return {label: round(float(p), 3) for label, p in zip(self.labels, probs)}

    def moderate(self, text: str) -> Verdict:
        text = text.strip()
        if not text:
            return Verdict("allow")
        scores = self.score(text)
        flagged = [label for label in self.labels if scores[label] >= self.thresholds[label]]
        return decide(text, flagged, scores)


def load_moderator(model_dir: str | None) -> Moderator | RulesOnly:
    if not model_dir:
        logger.warning("MODERATION_MODEL_DIR is not set: chat is checked with the self-harm rules only")
        return RulesOnly()
    try:
        moderator = Moderator(Path(model_dir))
    except Exception:
        logger.exception("Could not load the moderation model from %s: using the rules only", model_dir)
        return RulesOnly()
    logger.info("Moderation model %s loaded from %s", moderator.version, model_dir)
    return moderator
