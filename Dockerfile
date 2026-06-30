FROM python:3.11-slim

WORKDIR /app

# Install deps first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code + DB migrations
COPY backend ./backend
COPY frontend ./frontend
COPY alembic.ini ./alembic.ini
COPY migrations ./migrations
# Putt-analyzer module (single file; reused by the /api/analyze-putt endpoint)
COPY tools/putt-analyzer/putt_analyze.py ./tools/putt-analyzer/putt_analyze.py

# DATABASE_URL is provided at runtime (compose / k8s), e.g.
#   postgresql://worktracker:worktracker@db:5432/worktracker
EXPOSE 8000

# --proxy-headers + trust all forwarders: behind the k8s TLS ingress uvicorn must
# honor X-Forwarded-Proto=https, else OAuth redirect_uri is built as http:// and
# Google rejects it (redirect_uri_mismatch).
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
