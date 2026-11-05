"""API interna del extractor de guion.

POST /transcribe recibe el archivo como cuerpo crudo, lo guarda en una carpeta
temporal, transcribe y devuelve el resultado. El archivo y el audio se borran
siempre al terminar, también si falla. Nada se conserva.
"""

import asyncio
import logging
import os
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from starlette.requests import ClientDisconnect

from audio import AudioError, extract_audio
from transcriber import MODEL_NAME, transcribe

MAX_BYTES = int(os.environ.get("MAX_SCRIPT_MB", "100")) * 1024 * 1024
MAX_SECONDS = int(os.environ.get("MAX_SCRIPT_MINUTES", "30")) * 60
# Subidas más transcripciones a la vez: acota el disco temporal que se puede ocupar.
MAX_PENDING = int(os.environ.get("MAX_SCRIPT_PENDING", "3"))
WORK_ROOT = Path(tempfile.gettempdir()) / "script-extract"

logger = logging.getLogger("uvicorn.error")
app = FastAPI(title="Extractor de guion")
# Una transcripción a la vez: el CPU del servidor es compartido. Las subidas no
# ocupan este turno; una subida lenta no bloquea a nadie.
busy = asyncio.Lock()
pending = 0


def error(status: int, message: str) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


@app.on_event("startup")
def clean_leftovers() -> None:
    """Borra lo que haya quedado de un corte anterior."""
    shutil.rmtree(WORK_ROOT, ignore_errors=True)
    WORK_ROOT.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_NAME}


@app.post("/transcribe")
async def transcribe_endpoint(request: Request):
    global pending
    if pending >= MAX_PENDING:
        return error(429, "Hay demasiados videos en proceso. Inténtalo en un minuto.")
    pending += 1
    work = Path(tempfile.mkdtemp(dir=WORK_ROOT))
    try:
        source = work / "input"
        size = 0
        with source.open("wb") as out:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_BYTES:
                    return error(413, f"El archivo supera el máximo de {MAX_BYTES // 1024 // 1024} MB.")
                out.write(chunk)
        if size == 0:
            return error(400, "No se recibió ningún archivo.")

        async with busy:
            # Pudo cancelar mientras esperaba su turno: no se gasta CPU en balde.
            if await request.is_disconnected():
                return error(499, "Cancelado.")
            try:
                audio = await run_in_threadpool(extract_audio, source, MAX_SECONDS)
            except AudioError as exc:
                return error(422, str(exc))
            # Se borra el video en cuanto se tiene el audio.
            source.unlink(missing_ok=True)

            if len(audio) / 16000 > MAX_SECONDS:
                return error(413, f"El video dura más de {MAX_SECONDS // 60} minutos.")
            try:
                return await run_in_threadpool(transcribe, audio)
            except Exception:
                logger.exception("transcripción fallida")
                return error(500, "No se pudo transcribir el archivo.")
    except ClientDisconnect:
        return error(499, "Cancelado.")
    finally:
        shutil.rmtree(work, ignore_errors=True)
        pending -= 1
