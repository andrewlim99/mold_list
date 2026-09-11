# Linux deployment

This deployment keeps the existing dashboard API unchanged. It uses the full
`mold_shared_server.ps1` implementation, which includes the product,
drawing-upload, management, repair-review, and work-order endpoints. Do not
use `mold_shared_server_mac.py` for this deployment: it is a reduced local-use
server and does not include the management endpoints.

The architecture is:

```text
LAN browser --> Nginx :80 --> PowerShell app :3212 (loopback only)
                                      |
                                      +--> JSON data, drawings, work_orders
```

## Prerequisites

These instructions target a Debian/Ubuntu-style server. Install:

- PowerShell 7 (`pwsh`)
- Nginx
- `rsync` (for copying a later app update)

Create a dedicated service account:

```bash
sudo useradd --system --home-dir /opt/mold-dashboard --shell /usr/sbin/nologin moldapp
sudo install -d -o moldapp -g moldapp -m 0750 /opt/mold-dashboard
```

## First deployment

From the copied `Dashboard App` directory, copy the complete app to the
server. Do not copy only the HTML file: the server scripts, JavaScript, CSS,
assets, drawings, and data files all belong to the application.

```bash
sudo rsync -a ./ /opt/mold-dashboard/
sudo chown -R moldapp:moldapp /opt/mold-dashboard
sudo install -m 0644 deploy/linux/mold-dashboard.service /etc/systemd/system/mold-dashboard.service
sudo install -m 0644 deploy/linux/mold-dashboard.nginx.conf /etc/nginx/sites-available/mold-dashboard
sudo ln -s /etc/nginx/sites-available/mold-dashboard /etc/nginx/sites-enabled/mold-dashboard
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now mold-dashboard
sudo systemctl reload nginx
```

This configuration adds the `mold.internal` virtual host; it does not replace
or disable an existing Nginx default site. If the server already hosts other
internal applications, inspect the existing Nginx configuration before adding
this site and keep those sites enabled.

If your PowerShell executable is not `/usr/bin/pwsh`, locate it with
`command -v pwsh` and update `ExecStart` in the installed systemd service
before starting it.

## Verify before sharing the URL

Run these commands on the server:

```bash
systemctl status mold-dashboard --no-pager
curl -fsS http://127.0.0.1:3212/api/health
curl -fsS http://127.0.0.1/api/health
```

Then find the server's LAN address:

```bash
hostname -I
```

Open `http://SERVER-LAN-IP/` from another computer on the same network. The
dashboard chooses its API address from the page's own origin, so no HTML
configuration or hard-coded IP address is required.

## LAN security

The provided Nginx configuration listens on HTTP for initial internal-network
testing. Before giving it broader network access, add authentication and
HTTPS, or restrict the server firewall to your LAN/VPN. The in-page edit
password is not a replacement for server authentication.

At minimum, allow TCP port 80 only from your local subnet in the server or
network firewall. Never expose port 3212: the application is intentionally
bound to loopback and Nginx is its only public entry point.

## Data and backups

Back up these paths together every day, while preserving permissions:

```text
/opt/mold-dashboard/mold_shared_rows.json
/opt/mold-dashboard/mold_management.json
/opt/mold-dashboard/drawings/
/opt/mold-dashboard/work_orders/
/opt/mold-dashboard/Backups/
```

Test a restore on a separate copy before relying on the backup. SQLite can be
introduced later without changing the LAN URL or the dashboard UI.

## Updating the application

Take a backup first. Stop the service while replacing application code so an
active save cannot be mixed with updated scripts. Preserve the live data and
upload folders unless the update intentionally includes a data migration.

```bash
sudo systemctl stop mold-dashboard
sudo rsync -a --exclude 'mold_shared_rows.json' --exclude 'mold_management.json' --exclude 'drawings/' --exclude 'work_orders/' --exclude 'Backups/' ./ /opt/mold-dashboard/
sudo chown -R moldapp:moldapp /opt/mold-dashboard
sudo systemctl start mold-dashboard
curl -fsS http://127.0.0.1/api/health
```

For a failed start, inspect the service log:

```bash
journalctl -u mold-dashboard -n 100 --no-pager
```
