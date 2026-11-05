# Servicio de transcripción (faster-whisper en CPU). Solo accesible desde la red de Docker.
FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# El modelo se descarga al construir la imagen; en marcha no sale a internet.
ARG WHISPER_MODEL=base
ENV WHISPER_MODEL=$WHISPER_MODEL
# Caché fuera de /root: el servicio corre con otro usuario y tiene que poder leerla.
ENV HF_HOME=/opt/hf
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"
ENV HF_HUB_OFFLINE=1

COPY *.py ./
RUN useradd --system --no-create-home transcriber
USER transcriber

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
