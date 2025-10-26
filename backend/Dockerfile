# Backend Dockerfile
FROM node:20-slim

# Install Python and pip for AI agent
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY requirements.txt ./

# Install Node.js dependencies
RUN npm install

# Create Python virtual environment and install dependencies
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install -r requirements.txt

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads transcripts

# Expose ports
EXPOSE 5000 5001

# Create startup script
RUN echo '#!/bin/bash\n\
export PATH="/opt/venv/bin:$PATH"\n\
# Start AI agent in background\n\
python agents/crew.py &\n\
# Start Node.js server\n\
node server_clean.js\n\
' > start.sh && chmod +x start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["./start.sh"]