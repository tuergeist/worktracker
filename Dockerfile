FROM python:3.11-slim

WORKDIR /app

# Install deps first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY backend ./backend
COPY frontend ./frontend
# Putt-analyzer module (single file; reused by the /api/analyze-putt endpoint)
COPY tools/putt-analyzer/putt_analyze.py ./tools/putt-analyzer/putt_analyze.py

# DATABASE_URL is provided at runtime (compose / k8s), e.g.
#   postgresql://worktracker:worktracker@db:5432/worktracker
EXPOSE 8000

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
