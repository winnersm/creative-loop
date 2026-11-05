"""Transcripción con faster-whisper (CPU, int8). El modelo se carga una vez."""

import os
from functools import lru_cache

import numpy as np
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")


@lru_cache(maxsize=1)
def _model() -> WhisperModel:
    return WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")


def transcribe(audio: np.ndarray) -> dict:
    """Detecta el idioma y devuelve el texto con sus segmentos."""
    segments_iter, info = _model().transcribe(
        audio,
        beam_size=5,
        vad_filter=False,
        temperature=0.0,  # determinista: evita alucinaciones
    )
    segments = []
    for seg in segments_iter:
        text = seg.text.strip()
        if text:
            segments.append(
                {"id": len(segments) + 1, "start": round(seg.start, 2), "end": round(seg.end, 2), "text": text}
            )
    full = " ".join(s["text"] for s in segments)
    return {
        "language": info.language,
        "languageProbability": round(info.language_probability, 3),
        "durationSeconds": round(info.duration, 2),
        "text": full,
        "wordCount": len(full.split()),
        "segments": segments,
    }
