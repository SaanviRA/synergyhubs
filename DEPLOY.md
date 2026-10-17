# Deployment Guide for Ubuntu

The app is deployed as a **release bundle**: one `.tar.gz` built on your development machine that
contains everything the server runs. The server never runs `npm`, `uv`, or a build step - updating is
"copy the bundle, run one command", which swaps the release and restarts the service.

---

## Architecture Overview

```
Browser ──HTTPS──> Nginx ──┬── /        static files   /opt/group_app/current/dist      (frontend)
                           └── /api/*   proxy  ──>  127.0.0.1:5001  uvicorn + FastAPI   (systemd: group-app-api)
                                                          │
                                                          └──> 127.0.0.1:5432  PostgreSQL (Docker)
```

1. **Frontend**: React + Vite, compiled to static files inside the bundle and served directly by **Nginx**.
2. **Backend**: Python + FastAPI, run by **systemd** as the `group-app-api` service on `127.0.0.1:5001`.
3. **Database**: **PostgreSQL 15** in a Docker container.
4. **Proxy**: **Nginx** terminates HTTPS, serves the frontend, and forwards `/api/*` to the backend.

On the server:

| Path | Contents |
|---|---|
| `/opt/group_app/releases/<version>/` | One unpacked bundle per deployment (the newest 5 are kept) |
| `/opt/group_app/current` | Symlink to the live release |
| `/etc/group_app/group_app.env` | Secrets and settings. Survives deployments. |
| `/etc/systemd/system/group-app-api.service` | The API service |
| `/usr/local/bin/group-app-deploy` | The deploy command |

### How the frontend is enabled

There is no frontend process to start. The bundle contains the compiled site in `dist/`, and Nginx is
pointed at `/opt/group_app/current/dist` (Step 5). Because `current` is a symlink that each deployment
re-points, a new frontend is live the moment a deployment finishes - no Nginx reload needed. If the site
shows the Nginx welcome page or a 404, the Nginx site from Step 5 is not enabled; if pages load but
logging in fails, check the API (`systemctl status group-app-api`) and that the bundle was built with
the right `VITE_API_URL`.

---

## Step 1: Build a bundle (on your development machine)

Requirements: Node.js 20+, [uv](https://docs.astral.sh/uv/), and a checkout of this repository.

```bash
VITE_API_URL=https://yourdomain.com scripts/build_bundle.sh
```

This writes `build/group_app-<version>.tar.gz` (about 13 MB).

- `VITE_API_URL` is the public address of the site. It is compiled into the frontend, so a bundle is
  tied to one domain. It defaults to `https://synergyhubs.org`, so plain `scripts/build_bundle.sh` builds
  for the live site; pass it on the command line for any other domain. The `VITE_API_URL` in `.env` is
  ignored here, because that one is for local development.
- The Google values (`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_APP_ID`, `VITE_GOOGLE_API_KEY`) are read from
  `.env` and compiled in the same way.
- The Python packages inside the bundle are built for **Python 3.12 on x86_64** (Ubuntu 24.04). For a
  different server, set the version to match its `python3 --version`:

  ```bash
  BUNDLE_PYTHON=3.10 scripts/build_bundle.sh                                   # Ubuntu 22.04
  BUNDLE_PLATFORM=aarch64-manylinux_2_28 scripts/build_bundle.sh               # ARM servers
  ```

  The deploy command refuses a bundle built for the wrong Python version.

Package versions come from the lockfiles (`package-lock.json`, `backend/uv.lock`); Python packages are
hash-verified, and npm install scripts are disabled during the build.

---

## Step 2: Prepare the server (first time only)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx python3 curl openssl ufw
```

Install Docker for the database:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io
```

Node.js, npm, PM2, and uv are **not** needed on the server.

---

## Step 3: Create the database (first time only)

Copy the bundle to the server (`scp build/group_app-<version>.tar.gz user@server:`), then unpack it once
to get the schema:

```bash
tar -xzf group_app-<version>.tar.gz

# Choose a strong password - it goes into the env file in Step 4
sudo docker run -d --name group_app_postgres --restart always \
  -e POSTGRES_DB=group_app_db -e POSTGRES_USER=pguser -e POSTGRES_PASSWORD='choose-a-strong-password' \
  -p 127.0.0.1:5432:5432 \
  -v group_app_postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine

# Wait a few seconds for it to start, then load the schema
sudo docker exec -i group_app_postgres psql -U pguser -d group_app_db < group_app-<version>/schema.sql
```

> **Warnings**
> - `schema.sql` **drops and recreates every table**. Only run it on a new, empty database.
> - It also seeds demo classes and five demo accounts (`alex@school.edu`, `davis@school.edu`, ...) that
>   share one password. Remove them before real users arrive:
>   `sudo docker exec group_app_postgres psql -U pguser -d group_app_db -c "DELETE FROM classes WHERE id IN (1,2); DELETE FROM users WHERE id <= 5;"`
> - Keep the port bound to `127.0.0.1` as shown. Ports published by Docker are **not** protected by UFW.

---

## Step 4: First deployment

```bash
sudo group_app-<version>/deploy/deploy.sh group_app-<version>.tar.gz
```

On the first run this also:

- creates `/etc/group_app/group_app.env` with a freshly generated `JWT_SECRET` and the Google client ID
  from the bundle,
- installs and enables the `group-app-api` systemd service,
- installs itself as `group-app-deploy` for future updates.

If you chose your own database password in Step 3, this first run stops at the migration step with an
authentication error, because the new env file still has the default password. Set it and run the same
command again:

```bash
sudo nano /etc/group_app/group_app.env      # set DB_PASSWORD (and check GOOGLE_CLIENT_ID)
sudo group-app-deploy group_app-<version>.tar.gz
curl http://127.0.0.1:5001/api/health       # {"status":"ok"}
```

`/etc/group_app/group_app.env` settings:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs login tokens. Required, at least 32 characters - the API refuses to start otherwise. Changing it logs everyone out. |
| `GOOGLE_CLIENT_ID` | Must equal the `VITE_GOOGLE_CLIENT_ID` the bundle was built with. Google sign-in is refused when empty. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection. |
| `CORS_ORIGINS` | Leave empty when Nginx serves the frontend and `/api` from the same domain (the setup in this guide). |

---

## Step 5: Enable the frontend in Nginx (first time only)

```bash
sudo cp /opt/group_app/current/deploy/nginx.conf.example /etc/nginx/sites-available/group_app
sudo nano /etc/nginx/sites-available/group_app        # set server_name to your domain
sudo ln -s /etc/nginx/sites-available/group_app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

The site configuration serves `/opt/group_app/current/dist` and proxies `/api` to `127.0.0.1:5001`.

---

## Step 6: Firewall and HTTPS (first time only)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
sudo systemctl status certbot.timer        # automatic renewal
```

HTTPS is required for Google sign-in (see below).

---

## Updating the app

One command builds, uploads and deploys:

```bash
scripts/build_and_deploy.sh               # to the "deploy_server" host in ~/.ssh/config
scripts/build_and_deploy.sh other_host    # or any host ssh can reach
```

It takes the user, hostname and key from your SSH configuration, builds the bundle for the server's own
Python version and CPU, and runs `group-app-deploy` there (with `sudo` unless you log in as root).
`VITE_API_URL` works as for `build_bundle.sh`. The server needs its first deployment done by hand first.

To do the same steps by hand, on your development machine:

```bash
VITE_API_URL=https://yourdomain.com scripts/build_bundle.sh
scp build/group_app-<version>.tar.gz user@server:
```

On the server:

```bash
sudo group-app-deploy group_app-<version>.tar.gz
```

That command unpacks the bundle into a new release directory, applies `migration.sql` (safe to re-run),
points `current` at the new release, restarts `group-app-api`, and checks `/api/health`. If the health
check fails, it switches back to the previous release automatically and prints the service log.

### Rolling back manually

```bash
ls /opt/group_app/releases
sudo ln -sfn /opt/group_app/releases/<older-version> /opt/group_app/current
sudo systemctl restart group-app-api
```

---

## Moving an existing Node/PM2 server to this setup

1. Stop the old API so port 5001 is free: `pm2 delete group-app-api && pm2 save` (PM2 and Node.js can then be uninstalled).
2. Keep the existing `group_app_postgres` container - skip Step 3.
3. Run Step 4. Copy your old values into `/etc/group_app/group_app.env`. If the old `.env` had no
   `JWT_SECRET`, keep the generated one: everyone is simply asked to log in again.
4. In `/etc/nginx/sites-available/group_app`, change `root` to `/opt/group_app/current/dist` and reload Nginx.

Behaviour changes to expect: requests without a login token are now rejected (previously they acted as a
built-in demo user), and users can only reach projects in classes they belong to.

---

## Google OAuth 2.0 Setup

To avoid "Access Blocked" or "Error 400" screens, complete the following in the
[Google Cloud Console](https://console.cloud.google.com/):

### 1. Register a Custom OAuth Client ID
- Navigate to **APIs & Services** > **Credentials**.
- Click **+ Create Credentials** > **OAuth client ID**, application type **Web application**.
- Put the client ID in `.env` as `VITE_GOOGLE_CLIENT_ID` before building the bundle, and make sure
  `GOOGLE_CLIENT_ID` in `/etc/group_app/group_app.env` has the same value.

### 2. Configure Authorized Origins
- **Authorized JavaScript origins**:
  - Your domain: `https://yourdomain.com` (must be HTTPS).
  - For local development: `http://localhost:5173` (Vite).
  - Google **does not allow** bare IP addresses as authorized origins. You must use a domain name with HTTPS in production.

### 3. Configure the OAuth Consent Screen
- **User Type**: **External** (any Google account) or **Internal** (your school/organization only).
- **Publishing Status**: while in **Testing**, only accounts listed under **Test users** can sign in. Click **Publish App** to allow everyone.
- **Scopes**: the Drive Picker uses sensitive scopes, so an unverified app shows an "Unverified App" warning until you submit it for Google verification.

---

## Admins and account approval

New accounts cannot sign in until an admin approves them. Admins do this in the app under
**Account > Manage Users**, where they can also delete accounts.

Make the first admin from the database. Sign up in the app first, then:

```bash
sudo docker exec -it group_app_postgres psql -U pguser -d group_app_db
```
```sql
SELECT id, name, email, role, approved FROM users WHERE email = 'you@synergyhubs.org';
UPDATE users SET is_admin = TRUE, approved = TRUE WHERE id = <id>;
```

Admin status is only granted this way, never by email, so signing up with an admin's address does not
make someone an admin. Admin accounts cannot be deleted from the Manage Users page.

---

## Maintenance & Logs

* **API status and logs**:
  ```bash
  systemctl status group-app-api
  sudo journalctl -u group-app-api -f
  ```
* **Restart the API** (for example after editing the env file):
  ```bash
  sudo systemctl restart group-app-api
  ```
* **Which release is live**:
  ```bash
  cat /opt/group_app/current/BUNDLE_INFO
  ```
* **Database logs**:
  ```bash
  sudo docker logs -f group_app_postgres
  ```
* **Database backup**:
  ```bash
  sudo docker exec group_app_postgres pg_dump -U pguser group_app_db > backup-$(date +%F).sql
  ```
* **Nginx**:
  ```bash
  sudo tail -f /var/log/nginx/error.log
  sudo systemctl restart nginx
  ```
