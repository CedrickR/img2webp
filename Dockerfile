FROM python:3.11-slim

WORKDIR /app

COPY . /app

EXPOSE 8001

CMD ["python", "-m", "http.server", "8001"]
