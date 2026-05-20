FROM ubuntu:24.04

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
