FROM ubuntu:24.04 AS foundry

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/root/.foundry/bin:${PATH}"

SHELL ["/bin/bash", "-lc"]

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        curl \
        git \
        libssl-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L https://foundry.paradigm.xyz | bash \
    && source /root/.bashrc \
    && foundryup \
    && forge --version \
    && cast --version \
    && anvil --version \
    && chisel --version

WORKDIR /workspace/contracts

CMD ["bash"]

FROM python:3.12-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/workspace

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY services/agent/requirements.txt /tmp/agent-requirements.txt
RUN pip install --no-cache-dir -r /tmp/agent-requirements.txt

COPY . /workspace

EXPOSE 8000

CMD ["uvicorn", "services.agent.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
