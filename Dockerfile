FROM python:3.13-slim
WORKDIR /app
COPY server.py speech.py shared_tasks.py collaboration.py demo-order.json agent.js chat-text.js voice.js voice-audio.js care-data.js demo-data.js tasks-sync.js workflow-sync.js CareBridge_Unified.html ./
COPY 比赛/CareBridge_*.html ./比赛/
RUN useradd --uid 10001 --create-home appuser && mkdir -p /app/.runtime && chown appuser:appuser /app/.runtime
USER appuser
ENV HOST=0.0.0.0 PORT=8000 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
CMD ["python", "server.py"]
