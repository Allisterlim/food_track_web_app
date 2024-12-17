FROM python:3.9-slim

WORKDIR /app

# Copy requirements first for better cache usage
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Set environment variables
ENV FLASK_APP=app.py
ENV PORT=8080

# Command to run the application
CMD exec gunicorn --bind :$PORT app:app --workers 1 --threads 8 --timeout 0