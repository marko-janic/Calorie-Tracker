# Kcal Tracker

A single-user food diary for energy (kcal), protein, carbohydrates, fat and fibre.

- **App** (`app/`): one Expo codebase for an Android APK (sideloaded) and a web version. Every client keeps a full local copy of the diary in SQLite and works offline.
- **Server** (`server/`): .NET 10 API with SQLite. It is the sync hub and also serves the web UI and the APK.
- **Deployment** (`deploy/`): one compose project (`kcal`) with the server and Caddy (TLS via the Cloudflare DNS challenge).

`plan.md` is the complete specification. This README is the setup and operations runbook.

## Contents

1. Local development
2. First-time setup on the VM
3. Operations
4. Non-interference with Home Assistant and wg-easy
5. CI/CD secrets and the signing key

---

## 1. Local development

| Task | Command |
|---|---|
| Server tests | `dotnet test server/Kcal.sln` |
| Run the server (http://localhost:5080, data in `server/Kcal.Server/.data/`) | `dotnet run --project server/Kcal.Server` |
| First pairing code (local) | `dotnet run --project server/Kcal.Server -- pair` |
| App checks | `cd app && npm ci && npm run typecheck && npm run lint && npm test` |
| App on web (Expo dev server, http://localhost:8081) | `cd app && npm run web` |
| App on Android (Expo Go) | `cd app && npm start`, then connect to `http://<pc-ip>:5080` in Settings. Plain HTTP works in development builds only. |
| Web UI served by the local server | `cd app && npx expo export --platform web --output-dir ../server/Kcal.Server/wwwroot`, then `dotnet run --project server/Kcal.Server` and open http://localhost:5080 |
| API requests | Open `bruno/` in Bruno (see `bruno/README.md`) and use the `local` environment. |

Every pull request to `main` must increase `VERSION` (single SemVer for server, web UI and APK; minor and patch must stay below 100).

---

## 2. First-time setup on the VM

1. **Cloudflare token:** create a custom API token for kcal only.
   - Permissions: Zone > DNS > Edit, Zone > Zone > Read.
   - Zone resources: Include > Specific zone > `example.com`.
   - Optional: client IP filtering, if the home public IP is static.
2. **Cloudflare DNS:** add the A records `kcal.example.com` and `ui.kcal.example.com`.
   - Value: the VM's LAN IP.
   - Proxy status: **DNS only** (grey cloud).
   - TTL: Auto.
   - The VM's IP must be fixed (static or DHCP reservation).
3. **Ports on the VM:** run `sudo ss -tlnp | grep ':443'` and `sudo ss -ulnp | grep ':443'`.
   - Empty output: keep `KCAL_HTTPS_PORT=443`.
   - Otherwise: use `8443` and set `KCAL_UI_ORIGIN=https://ui.kcal.example.com:8443`. All URLs then include `:8443`.
4. **Install the files on the VM:**
   ```sh
   sudo mkdir -p /opt/kcal
   sudo cp deploy/docker-compose.yml /opt/kcal/
   sudo cp deploy/.env.example /opt/kcal/.env
   sudo nano /opt/kcal/.env          # fill in CLOUDFLARE_API_TOKEN
   sudo chown root:root /opt/kcal/.env
   sudo chmod 600 /opt/kcal/.env
   ```
5. **Private images only:** if the GHCR images are private, run `docker login ghcr.io -u <github-user>` with a personal access token that has `read:packages`.
6. **Start:** in `/opt/kcal`, run `docker compose up -d`, then watch `docker compose logs -f caddy` until both certificates are obtained.
7. **First pairing code:** `docker compose exec kcal-server kcal pair`. The server also logs a fresh code at startup while no device is paired.
8. **PC:** open `https://ui.kcal.example.com` and pair with the code (device name e.g. "PC browser").
9. **Phone**, on home Wi-Fi or with WireGuard on:
   1. Open `https://kcal.example.com/download/kcal.apk` and install the app. Allow "Install unknown apps" for the browser once.
   2. Go to Settings → Connect and enter `https://kcal.example.com`. Allow the local network permission if Android asks for it.
   3. Pair with a code from the web UI (Settings → Devices → "Pair a new device").
10. **DNS rebind check** on a device on home Wi-Fi: `nslookup kcal.example.com` must return the VM's IP.
    - If it fails while `nslookup kcal.example.com 1.1.1.1` works, the router's DNS rebind protection is blocking a public name that points to a private IP.
    - Add `kcal.example.com` and `ui.kcal.example.com` to the router's rebind exceptions. On a FRITZ!Box: Home Network → Network → Network Settings → DNS Rebind Protection.
    - WireGuard clients use the DNS server wg-easy hands out (1.1.1.1 by default) and are not affected.

The Cloudflare token can technically edit every record in `example.com`, including `wireguard.example.com`, because Cloudflare tokens cannot be limited to single records. In operation Caddy only touches its own `_acme-challenge.…` TXT records. Keep `.env` readable by root only.

---

## 3. Operations

All commands run in `/opt/kcal`.

- **Update**
  - With Watchtower (`docker compose --profile autoupdate up -d`): automatic, only for the kcal containers.
  - Without: `docker compose pull && docker compose up -d`.
  - To pin a version, set `KCAL_VERSION=v0.3.0` in `.env`.
- **Logs:** `docker compose logs -f kcal-server`.
- **Backups**
  - The server writes a nightly `VACUUM INTO` snapshot and keeps the newest 14.
  - Snapshots live in the volume `kcal_kcal-data` under `backups/`.
  - Proxmox VM backups also include them.
  - Every synced client holds a full copy too.
- **Restore**
  1. `docker compose stop kcal-server`
  2. Copy a snapshot over `kcal.db` in the volume and delete `kcal.db-wal` and `kcal.db-shm`, e.g.
     ```sh
     VOLUME=$(docker volume inspect kcal_kcal-data --format '{{ .Mountpoint }}')
     sudo cp "$VOLUME/backups/kcal-2026-11-03.db" "$VOLUME/kcal.db"
     sudo rm -f "$VOLUME/kcal.db-wal" "$VOLUME/kcal.db-shm"
     ```
  3. `docker compose start kcal-server`
  - Clients with newer local changes push them again on their next sync.
- **New pairing code:** `docker compose exec kcal-server kcal pair`.
- **Revoke a device:** in the app, Settings → Devices → remove.

---

## 4. Non-interference with Home Assistant and wg-easy

- **Own compose project:** `kcal`, with its own network and volumes.
- **One port pair:** it publishes only `KCAL_HTTPS_PORT` (tcp and udp).
- **Nothing else touched:**
  - wg-easy, its DNS setting and its port;
  - the router and port forwarding;
  - Home Assistant;
  - the `wireguard.example.com` record.
- **Cloudflare changes:**
  - two new DNS-only A records;
  - temporary `_acme-challenge` TXT records.
- **Watchtower** (optional) only updates containers labelled `com.centurylinklabs.watchtower.enable=true`.

Check after changes: Home Assistant and wg-easy keep working, and `docker ps` shows only the `kcal-*` containers as new.

---

## 5. CI/CD secrets and the signing key

Workflows (GitHub-hosted runners):
- `.github/workflows/pr.yml`: version bump check, server tests, app typecheck, lint and tests.
- `.github/workflows/release.yml` (push to `main`, manual dispatch): signed APK → server and Caddy images (amd64, arm64) on GHCR, tagged `v<VERSION>` and `latest` → GitHub Release with the APK.

Repository secrets:

| Secret | Content |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of `kcal-release.p12` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `kcal` |
| `ANDROID_KEY_PASSWORD` | key password (same as the keystore password for PKCS12) |

The release workflow fails if any of them is missing; it never publishes a debug-signed APK. Local `assembleRelease` builds without the `KCAL_UPLOAD_*` variables fall back to debug signing.

Create the signing key once on the dev PC (Java 21):

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore kcal-release.p12 -alias kcal -keyalg RSA -keysize 4096 -validity 36500
[Convert]::ToBase64String([IO.File]::ReadAllBytes("kcal-release.p12")) | Set-Clipboard
```

**Back up `kcal-release.p12` and its password** (e.g. in a password manager). Android only installs updates signed with the same key. Losing it means uninstalling and reinstalling the app; sync restores the data afterwards.

The `GITHUB_TOKEN` covers the GHCR pushes and the release, through the workflow permissions.
