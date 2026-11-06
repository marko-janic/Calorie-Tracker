# Bruno collection

API requests for the Kcal server (plan section 13.3). Open this folder as a collection in Bruno.

## Setup

1. **Developer mode:** the signing scripts use Node `crypto` (`lib/kcal.js`), so switch the collection's
   JavaScript sandbox to *Developer Mode*.
2. **Dev key:** create the git-ignored `bruno/.env` with a P-256 key (see `.env.example`):

   ```sh
   node -e "const {generateKeyPairSync}=require('crypto');const {privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});console.log('KCAL_DEV_KEY_PKCS8='+privateKey.export({type:'pkcs8',format:'der'}).toString('base64'))" > bruno/.env
   ```

3. **Environment:** choose `local` (`http://localhost:5080`, `dotnet run --project server/Kcal.Server`) or
   `homelab` (`https://kcal.example.com`).
4. **Pairing code:** set `pairingCode` in the environment. Locally the server logs one at startup while no
   device is paired; otherwise use `dotnet run --project server/Kcal.Server -- pair` (local) or
   `docker compose exec kcal-server kcal pair` (VM). Codes are single use and valid for 10 minutes.

## Requests

Run the folders in order. Each request stores what the next one needs (`serverId`, `deviceId`, `nonce`,
`accessToken`, `entryId`, `entryVersion`) in the environment.

| Folder | Requests |
|---|---|
| `01 setup` | health, pair, challenge, token |
| `02 sync` | push a new entry, pull it, a stale delete (expects `deleteConflict`), a stale edit (expects `olderEdit`) |
| `03 devices` | list, create a pairing code, revoke (revokes the Bruno device itself; pair again afterwards) |

From the command line (Bruno CLI):

```sh
cd bruno
npx @usebruno/cli run "01 setup" "02 sync" "03 devices" --env local --sandbox developer
```
