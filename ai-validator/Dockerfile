FROM python:3.11-slim as builder

WORKDIR /app
RUN apt-get update && apt-get install -y gcc librdkafka-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

FROM python:3.11-slim as runtime

WORKDIR /app
RUN apt-get update && apt-get install -y librdkafka1 curl && rm -rf /var/lib/apt/lists/*

RUN useradd -m validator
USER validator

COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache /wheels/*

COPY validator.py .
COPY cardano_updater.py .
COPY base_updater.py .
COPY policies/ ./policies/

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["python", "validator.py"]
