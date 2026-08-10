FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py scraper.py environment.py controller.py actuator.py evaluator.py memory.py ws_server.py ./

ENV PORT=8765
EXPOSE 8765

CMD ["python", "main.py"]
