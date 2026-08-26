# Deployment Guide for Ubuntu

This guide walks you through deploying the Group Collaboration App (React/Vite frontend + Node/Express backend + PostgreSQL database) on a fresh Ubuntu server (Ubuntu 22.04 LTS or 24.04 LTS).

---

## Architecture Overview

1. **Frontend**: React + Vite + Tailwind CSS. Served as static files by **Nginx**.
2. **Backend**: Node.js + Express API. Managed as a background service via **PM2** on port `5001`.
3. **Database**: **PostgreSQL** running in a Docker container (using the existing `docker-compose.yml`).
4. **Proxy**: **Nginx** handles TLS/SSL (HTTPS) termination and routes `/api/*` requests to the Express server while serving the React static assets for all other routes.

---

## Step 1: Update System & Install Core Utilities

Log in to your Ubuntu server and run the following commands to update system packages and install basic tools:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ufw nginx
```

---

## Step 2: Install Node.js (v20 LTS)

The backend and frontend build tools require Node.js. Install Node.js v20 using NodeSource:

```bash
# Download and import the NodeSource GPG key
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

# Create deb repository configuration
NODE_MAJOR=20
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

# Update package lists and install Node.js
sudo apt-get update
sudo apt-get install nodejs -y
```

Verify your installation:
```bash
node -v
npm -v
```

---

## Step 3: Install Docker & Docker Compose (for PostgreSQL)

Since the project already includes a `docker-compose.yml` for PostgreSQL:

```bash
# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Verify Docker installation:
```bash
sudo docker --version
sudo docker compose version
```

---

## Step 4: Clone Repository & Setup Files

1. Clone the repository into a directory of your choice (e.g., `/var/www/group_app`):
   ```bash
   sudo mkdir -p /var/www
   sudo chown -R $USER:$USER /var/www
   cd /var/www
   git clone <YOUR_REPOSITORY_URL> group_app
   cd group_app
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

---

## Step 5: Start the Database Container

The `docker-compose.yml` configures PostgreSQL 15 and initializes it using `schema.sql`.

Start the container in detached mode:
```bash
sudo docker compose up -d
```

Verify that the database is running:
```bash
sudo docker compose ps
```
> **Note**: The SQL seed file (`schema.sql`) runs automatically on the first boot of the container, seeding initial student/teacher profiles and structural constraints.

---

## Step 6: Configure Environment Variables

Edit the `.env` file at the root of the project:

```bash
nano .env
```

Ensure the configuration is populated. Here is an example production `.env` configuration:

```env
# Google Cloud Console Credentials (for Drive Picker / Auth)
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
VITE_GOOGLE_APP_ID=your-google-app-id
VITE_GOOGLE_API_KEY=your-google-api-key

# JWT Token secret (Generate a strong random string)
JWT_SECRET=super_secret_production_key_change_me_1234567

# Database Connection (Matches docker-compose.yml values)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=group_app_db
DB_USER=pguser
DB_PASSWORD=pgpassword

# Port for Express Backend
PORT=5001

# API URL for Frontend requests (leave empty to use relative routes under Nginx proxy)
VITE_API_URL=""
```

---

## Step 7: Build and Run the Backend (using PM2)

To keep the Express app running in the background and ensure it restarts on server reboots, we use the process manager **PM2**:

1. Install PM2 globally:
   ```bash
   sudo npm install -g pm2
   ```

2. Install backend dependencies:
   ```bash
   cd /var/www/group_app/server
   npm install
   ```

3. Start the backend app:
   ```bash
   pm2 start index.js --name "group-app-api"
   ```

4. Configure PM2 to start on system boot:
   ```bash
   pm2 startup systemd
   ```
   *Follow the command outputted on the screen to run the systemd configuration command.*

5. Save the running process list:
   ```bash
   pm2 save
   ```

---

## Step 8: Build the Frontend Assets

1. Navigate to the root directory and install dependencies:
   ```bash
   cd /var/www/group_app
   npm install
   ```

2. Compile the production bundle:
   ```bash
   npm run build
   ```
   This will generate a static production folder inside `/var/www/group_app/dist`.

---

## Step 9: Configure Nginx Reverse Proxy

Create an Nginx configuration file to serve the static frontend and route API calls to the PM2 backend service.

1. Open a new Nginx site configuration file:
   ```bash
   sudo nano /etc/nginx/sites-available/group_app
   ```

2. Paste the following configuration (replace `yourdomain.com` with your domain name or public server IP address):

```nginx
server {
    listen 80;
    server_name yourdomain.com; # Replace with your domain or server IP

    # Root folder of the compiled Vite frontend
    root /var/www/group_app/dist;
    index index.html;

    # Serve static frontend pages
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js backend
    location /api {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Custom size limits for uploads (if Google Drive links aren't enough)
    client_max_body_size 10M;
}
```

3. Enable the configuration and test it:
   ```bash
   sudo ln -s /etc/nginx/sites-available/group_app /etc/nginx/sites-enabled/
   # Remove the default nginx profile to avoid conflicts:
   sudo rm /etc/nginx/sites-enabled/default
   
   # Test Nginx syntax
   sudo nginx -t
   ```

4. Restart Nginx:
   ```bash
   sudo systemctl restart nginx
   ```

---

## Step 10: Configure Firewall (UFW)

Secure your server by enabling the firewall and allowing Nginx HTTP/HTTPS traffic:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## Step 11: Setup HTTPS (SSL) with Let's Encrypt

If you have mapped a domain name to your server's IP address, secure it with HTTPS using Certbot:

1. Install Certbot and its Nginx plugin:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   ```

2. Run Certbot to acquire and install the SSL certificate:
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```
   *Follow the interactive prompt to complete the configuration. Certbot will automatically rewrite the Nginx file to enable SSL redirection.*

3. Verify automatic certificate renewal:
   ```bash
   sudo systemctl status certbot.timer
   ```

---

## Maintenance & Logs

Here are standard diagnostic commands to inspect the health of your application:

* **View API Logs (Node.js)**:
  ```bash
  pm2 logs group-app-api
  ```
* **Restart Backend service**:
  ```bash
  pm2 restart group-app-api
  ```
* **View Database Logs (PostgreSQL)**:
  ```bash
  cd /var/www/group_app
  sudo docker compose logs -f
  ```
* **View Nginx Error Logs**:
  ```bash
  sudo tail -f /var/log/nginx/error.log
  ```
* **Restart Nginx**:
  ```bash
  sudo systemctl restart nginx
  ```
