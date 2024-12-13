FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8080
# Use gunicorn instead of Flask's development server
CMD ["gunicorn", "--bind", ":8080", "--workers", "1", "app:app"]