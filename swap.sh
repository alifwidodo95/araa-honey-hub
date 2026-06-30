#!/bin/bash
echo "=== ARAA HONEY VPS OPTIMIZATION SYSTEM ==="
echo "1. Creating 2GB swap file..."
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

echo "2. Restarting Docker daemon..."
sudo systemctl restart docker

echo "=== OPTIMIZATION COMPLETED SUCCESSFULLY ==="
free -h
