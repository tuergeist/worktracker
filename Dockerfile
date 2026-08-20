FROM python:3.14-slim

WORKDIR /app

# Install deps first for layer caching. requirements.txt is a hashed, fully
# pinned lock generated from requirements.in — see the header there.
# --require-hashes makes pip refuse anything whose artifact does not match, so
# it also fails loudly if the lock was regenerated without --generate-hashes.
COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

# App code + DB migrations
COPY backend ./backend
COPY frontend ./frontend
COPY alembic.ini ./alembic.ini
COPY migrations ./migrations

# DATABASE_URL is provided at runtime (compose / k8s), e.g.
#   postgresql://worktracker:worktracker@db:5432/worktracker
EXPOSE 8000

# --proxy-headers + trust all forwarders: behind the k8s TLS ingress uvicorn must
# honor X-Forwarded-Proto=https, else OAuth redirect_uri is built as http:// and
# Google rejects it (redirect_uri_mismatch).
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
