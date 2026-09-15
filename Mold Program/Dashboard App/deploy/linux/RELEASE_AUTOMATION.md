# NAS release automation

This is a code-only deployment channel. Live data and uploads remain on the
Ubuntu server and are backed up to Synology by the existing backup timer.

## NAS release folder

Create one folder on the mounted Synology share:

```text
4. CE WEEKLY REPORT/mold_backup_data/mold-dashboard-releases/
```

Upload one completed ZIP file there. A recommended name is:

```text
mold-dashboard-release-YYYYMMDD-HHMM.zip
```

The deployer validates the ZIP before deployment. It skips invalid or
incomplete archives and uses the SHA-256 checksum—not merely the filename—to
avoid redeploying the same content.

## ZIP contents

The archive must contain one `Dashboard App` source directory, including at
least `mold_dashboard.html`, `mold_shared_server.ps1`, `mold_management.ps1`,
the JavaScript files, and `assets/`.

Never include live data or uploads:

```text
mold_shared_rows.json
mold_management.json
drawings/
work_orders/
repair_photos/
Backups/
```

## Installation

Install `unzip`, the deployer, its timer, and the Nginx maintenance page:

```bash
sudo apt-get install -y unzip
sudo install -m 0750 deploy/linux/mold-dashboard-deploy-from-nas /usr/local/sbin/mold-dashboard-deploy-from-nas
sudo install -d -m 0755 /var/www/mold-dashboard
sudo install -m 0644 deploy/linux/mold-dashboard-maintenance.html /var/www/mold-dashboard/_mold-maintenance.html
sudo install -m 0644 deploy/linux/mold-dashboard-deploy.service /etc/systemd/system/mold-dashboard-deploy.service
sudo install -m 0644 deploy/linux/mold-dashboard-deploy.timer /etc/systemd/system/mold-dashboard-deploy.timer
sudo install -m 0644 deploy/linux/mold-dashboard.nginx.conf /etc/nginx/sites-available/mold-dashboard
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl reload nginx
sudo systemctl enable --now mold-dashboard-deploy.timer
```

The timer runs at minute `:07` and `:37`, avoiding the data-backup timer. Test
one deployment manually after uploading a valid ZIP:

```bash
sudo systemctl start mold-dashboard-deploy.service
sudo journalctl -u mold-dashboard-deploy.service -n 100 --no-pager
```

The deployment history and local code rollbacks are stored in:

```text
/var/lib/mold-dashboard-deploy/
```
