"""Extracción de audio con ffmpeg: mono, 16 kHz, float32."""

import subprocess
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000


class AudioError(Exception):
    pass


def extract_audio(video_path: Path, max_seconds: int, ffmpeg: str = "ffmpeg") -> np.ndarray:
    """Devuelve el audio del archivo como array mono a 16 kHz.

    ffmpeg corta a max_seconds + 1 para no decodificar de más; quien llama
    comprueba si el resultado supera max_seconds.
    """
    command = [
        ffmpeg, "-nostdin", "-v", "error",
        "-i", str(video_path),
        "-vn", "-t", str(max_seconds + 1),
        "-f", "s16le", "-ac", "2", "-ar", str(SAMPLE_RATE),
        "-",
    ]
    try:
        proc = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    except subprocess.CalledProcessError as exc:
        raise AudioError("No se pudo leer el archivo. ¿Es un video o audio válido?") from exc

    raw = np.frombuffer(proc.stdout, dtype=np.int16)
    if len(raw) < 2:
        raise AudioError("El archivo no contiene una pista de audio.")

    left = raw[0::2].astype(np.float32) / 32768.0
    right = raw[1::2].astype(np.float32) / 32768.0
    n = min(len(left), len(right))
    left, right = left[:n], right[:n]

    # Canales en antifase: promediarlos cancela la voz. Con correlación fuertemente
    # negativa se usa solo el izquierdo.
    if np.max(np.abs(left)) > 1e-4 and np.max(np.abs(right)) > 1e-4:
        corr = np.corrcoef(left, right)[0, 1]
        mono = left if corr < -0.75 else (left + right) / 2.0
    else:
        mono = left if np.max(np.abs(left)) >= np.max(np.abs(right)) else right

    # Audio muy bajo pero no silencioso: se sube el volumen para el modelo.
    peak = np.max(np.abs(mono))
    if 0.01 < peak < 0.5:
        mono = mono * (0.90 / peak)
    return mono
