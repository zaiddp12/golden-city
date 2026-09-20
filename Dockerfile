FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py importer.py railway_start.py ./
COPY static ./static
CMD ["python", "-u", "railway_start.py"]
