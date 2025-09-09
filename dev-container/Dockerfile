FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    openssh-server \
    sudo \
    vim \
    nano \
    htop \
    tree \
    jq \
    unzip \
    build-essential \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (for Docker-in-Docker scenarios)
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Install Python 3.11
RUN add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y python3.11 python3.11-pip python3.11-venv python3.11-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Go 1.21
RUN wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz \
    && rm go1.21.5.linux-amd64.tar.gz

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Install Java 17
RUN apt-get update && apt-get install -y openjdk-17-jdk \
    && rm -rf /var/lib/apt/lists/*

# Install additional development tools
RUN npm install -g \
    typescript \
    ts-node \
    @types/node \
    nodemon \
    pm2 \
    yarn \
    pnpm

# Install Python tools
RUN python3.11 -m pip install --upgrade pip \
    && python3.11 -m pip install \
    poetry \
    pipenv \
    virtualenv \
    black \
    flake8 \
    pytest \
    jupyter \
    requests \
    fastapi \
    uvicorn

# Create developer user
RUN useradd -m -s /bin/bash -G sudo developer \
    && echo 'developer:developer' | chpasswd \
    && echo 'developer ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Set up SSH
RUN mkdir /var/run/sshd \
    && echo 'PermitRootLogin no' >> /etc/ssh/sshd_config \
    && echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config \
    && echo 'PubkeyAuthentication yes' >> /etc/ssh/sshd_config

# Set environment variables
ENV PATH="/usr/local/go/bin:/home/developer/.cargo/bin:$PATH"
ENV JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
ENV WORKSPACE_DIR="/workspace/repositories"

# Create workspace directory
RUN mkdir -p /workspace/repositories /workspace/config \
    && chown -R developer:developer /workspace

# Switch to developer user
USER developer
WORKDIR /home/developer

# Set up Git configuration
RUN git config --global user.name "AI Agent Developer" \
    && git config --global user.email "agent@example.com" \
    && git config --global init.defaultBranch main

# Create SSH directory
RUN mkdir -p /home/developer/.ssh \
    && chmod 700 /home/developer/.ssh

# Install additional user-level tools
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Set up shell environment
RUN echo 'export PATH="/usr/local/go/bin:$HOME/.cargo/bin:$PATH"' >> ~/.bashrc \
    && echo 'export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"' >> ~/.bashrc \
    && echo 'export WORKSPACE_DIR="/workspace/repositories"' >> ~/.bashrc \
    && echo 'cd $WORKSPACE_DIR' >> ~/.bashrc

# Copy development scripts
COPY --chown=developer:developer scripts/ /home/developer/scripts/
RUN chmod +x /home/developer/scripts/*

# Copy configuration files
COPY --chown=developer:developer config/ /workspace/config/

# Switch back to root for service startup
USER root

# Expose SSH port and development server ports
EXPOSE 22 3000 3001 3002 3003 3004 3005 8000 8001 8002 8003 8004 8005

# Create startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]