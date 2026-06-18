FROM python:3.11-slim

WORKDIR /app

# Install deps first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY backend ./backend
COPY frontend ./frontend

# SQLite DB lives on a mounted volume so data survives container restarts
ENV WT_DB=/app/data/worktracker.db
EXPOSE 8000

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
