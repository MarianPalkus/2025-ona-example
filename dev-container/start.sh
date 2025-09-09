#!/bin/bash

# Start SSH service
service ssh start

# Set up workspace permissions
chown -R developer:developer /workspace

# Create SSH key for developer if it doesn't exist
if [ ! -f /home/developer/.ssh/id_rsa ]; then
    sudo -u developer ssh-keygen -t rsa -b 4096 -f /home/developer/.ssh/id_rsa -N ""
    sudo -u developer chmod 600 /home/developer/.ssh/id_rsa
    sudo -u developer chmod 644 /home/developer/.ssh/id_rsa.pub
fi

# Set up Git credentials helper
sudo -u developer git config --global credential.helper store

# Initialize workspace if empty
if [ ! "$(ls -A /workspace/repositories)" ]; then
    echo "Initializing workspace..."
    sudo -u developer mkdir -p /workspace/repositories/.gitkeep
fi

# Start development services
echo "Starting development environment..."
echo "SSH access: ssh developer@localhost -p 2222 (password: developer)"
echo "Workspace: /workspace/repositories"

# Keep container running
tail -f /dev/null