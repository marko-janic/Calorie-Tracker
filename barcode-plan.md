# Barcode scanning and portion size – plan

Status: proposal, nothing implemented. Written separately from `plan.md`, which stays unchanged.

## 1. Goal and constraints

- Scan a product barcode on the Android app, look it up, and prefill the entry form.
- Scanning is Android only. The web UI has no scan button.
- The Scan button is on the day view, next to "Add entry" and "AI import". A manual digit entry on the scan screen is the fallback. The scanner is always the first option.
- Entries get a new optional portion size with a unit, either grams or millilitres: `portionSize` and `portionUnit`. Total amount = `portionSize × quantity`.
- Adding a field is accepted, including the sync and server changes it causes.

## 2. Decisions

| # | Topic | Decision |
|---|---|---|
| B1 | Capture | `expo-camera` `CameraView` with `onBarcodeScanned`. Types: `ean13`, `ean8`, `upc_a`, `upc_e`. |
| B2 | Lookup | The phone calls Open Food Facts (OFF) directly. No server proxy: the server is only reachable at home or over the VPN, and shops are neither. |
| B3 | Web | No scan button. The portion size and unit are shown and editable, and must survive a web edit. |
| B4 | Cache | None at first. All lookups go through one function, so a local `products` table can be added later. |
| B5 | Data | `portionSize` (number) and `portionUnit` (`g` or `ml`), both nullable. Nutrients stay per portion, and `quantity` still multiplies everything. |
| B6 | AI import | Add optional `portionSize` and `portionUnit` per item, both or neither. An item with only one of them fails the check, and the error names the item. This is strict on purpose (plan §2, D15). `schemaVersion` stays 1. |
| B7 | Units | Only `g` and `ml`. There is no conversion between them, because that needs a density per food. |
| B8 | Entry point | A "Scan" button on the day view, Android only. There is no scan button inside the entry form. The scan screen replaces itself with the filled-in "Add entry" screen, so Save returns to the day view. |
| B9 | Unit toggle | The g/ml toggle is a label. Nutrients are always per-100 value × size ÷ 100, the same for both units. Changing the unit does not stop the scaling. |

## 3. Data model: portion size and unit

- `portionSize`: number or null, range 0.1–10 000.
- `portionUnit`: `'g'`, `'ml'` or null.
- Both are set or both are null. A size without a unit, or a unit without a size, is invalid in the form, the AI schema and the server.
- Existing entries and entries without a size keep `null` in both.
- Display: the entry row shows the total amount when set, e.g. "×2 · 300 ml".
- Why a unit field and not a second column like `ml`: one size, one unit, no way to fill both. Open Food Facts reports per-100 values for solids (per 100 g) and for drinks (per 100 ml), so the entry stores which one the size is in.
- More units (e.g. pieces) would mean extending the enum on the server and an API version bump again. Not planned.

### Migration and rollout

Both columns are nullable, so the change is additive. No row has to be rewritten.

**Existing entries**
- Server and every client keep them as they are: `portionSize = null`, `portionUnit = null`. The UI shows nothing extra for them, as today.
- There is no backfill. Older AI-imported entries carry the amount in the name ("Basmati rice, cooked (150 g)"). Parsing that is unreliable, so those entries stay as they are.
- The migration does not change `Version` or the global counter. Clients that already synced do not pull anything again, and a fresh client pulls the same records with nulls.
- Both-null satisfies the "both or neither" rule, so no existing row is invalid.

**Server database**
- `dotnet ef migrations add AddPortionSize` generates two `AddColumn` operations on `Entries` (`PortionSize` real, `PortionUnit` text, both nullable). SQLite adds such a column without rebuilding the table.
- `DatabaseInitializer` already runs `MigrateAsync` at startup, so the new image migrates the database on its first start. Nothing else to run.
- `PortionUnit` is a C# enum (`G`, `Ml`), like `MealType`, stored as lowercase text (`g`, `ml`) through a value converter. The server tests check that the wire format is `g` and `ml`.
- Rolling back to the old image works for the database: the old model ignores the extra columns, the old code never writes them, and EF does not fail on an unknown applied migration. Values entered in the meantime stay in the database but are not returned.
- Rolling back is not safe for the apps. Once they have updated, they expect server version 2. An old server reports 1, so they pause sync. A server rollback therefore means rolling back the apps too.
- Before the first deployment, take a snapshot by hand (copy `kcal.db` from the volume, or wait for the nightly `VACUUM INTO`). The restore steps in the README stay valid. Restoring an older snapshot into the new image simply re-applies the migration.

**Client databases (Android and web)**
- `npm run db:generate` creates `0001_*.sql` with two `ALTER TABLE entries ADD ...` statements. The generated `migrations.js` and `_journal.json` must be committed too.
- `useMigrations` applies it when the app starts, before the UI renders and before any sync. Existing rows get nulls and stay `dirty = false`, so nothing is pushed because of the migration.
- The APK must be signed with the same key, or the install does not keep the local database.

**Wire contract: where data could be lost**
The JSON serializer ignores unknown properties and `EntryChangeDTO` fills missing ones with defaults. That causes two failure modes:
1. An old client edits an entry and pushes it without the new fields. The server stores nulls and overwrites the value.
2. A new client pushes to an old server. The server silently drops the fields, the client marks the row as synced, and the next pull replaces the local values with nulls.

`minAppVersion` only covers the first case. The client's check is `apiVersion !== 1 || appVersion < minAppVersion`, so raising **`ApiVersion` to 2** closes both: an old client sees 2 and pauses, a new client (`SUPPORTED_API_VERSION = 2`) refuses an old server. Raise `MinAppVersion` to the new release as well. Local use continues and queued changes stay dirty while sync is paused.

The pause message must say which side is old. Today the banner always says "Update required" and links to the server's APK. That is wrong when the server is the older side (a server rollback, or a new app talking to an old server). `updateRequired` gets a reason:
- `app`: the server's `apiVersion` is higher than the app supports, or the app is below `minAppVersion`. Keep the current banner with the download link.
- `server`: the server's `apiVersion` is lower than the app supports. Show "The server is older than this app. Sync is paused." with no download link.

One small gap stays open. An old app that passed its version check just before the server restarted can still push once, and that push erases the sizes and units. The window is a few seconds, so it is accepted.
Rollout order:
1. Snapshot the server database.
2. Release one version: server image, with the new APK and web build bundled. Deploy it. The database migrates on start.
3. Old apps now show "update required" with the download link. Nothing is pushed, nothing is lost.
4. Install the new APK over the old one. The local migration runs, sync resumes, and queued changes from before push with null size and unit.
5. The web UI updates with the server. An open old tab shows "Reload" (plan §9.7).

**Types**
- App: `EntryFields` in `sync/types.ts` derives from the domain schema, so the new fields appear in the types on their own. `toEntryChange` in `sync/merge.ts` lists its fields by hand and would silently leave them out, so it must be updated. `toLocalEntry` spreads the record and needs no change.
- Server: `Apply` and `ToDTO` in `SyncService` also list fields by hand. Update both, plus `EntryChangeDTO` and `EntryDTO`.
- A round-trip test in each project (client change → push → pull → local row, and `SyncTests` on the server) catches a forgotten field.

## 4. Work packages

### WP1 – Portion size and unit end to end (ships first)

App:
- `src/domain/types.ts`: add `PortionUnit = z.enum(['g', 'ml'])`, and `portionSize` and `portionUnit` to `EntryFieldsSchema` and `EntryInput`. Add a refinement: both set or both null.
- `src/domain/entryForm.ts`: add `portionSize` (text) and `portionUnit` to the form state (empty size, unit `g`), to `nutrientFieldsFrom` and to `parseNutrientFields`. An empty size gives both null. A size gives both set.
- `src/db/schema.ts`: add `portionSize: real('portion_size')` and `portionUnit: text('portion_unit').$type<PortionUnit>()`. Run `npm run db:generate` for migration `0001`.
- `src/ui/NutrientInputs.tsx`: a size input next to quantity, with a `g | ml` segmented toggle (Paper `SegmentedButtons`).
- `src/ui/EntryRow.tsx` and the day view: show the total amount.
- `src/sync/*` and `src/db/mappers.ts`: carry both fields in push and pull, and in the merge functions.
- `src/ai/schema.ts`: add `portionSize: z.number().min(0.1).max(10000).nullish()` and `portionUnit: PortionUnit.nullish()` to the item schema, with the same both-or-neither check.
- `src/ai/extract.ts`: add both keys to `knownItemKeys`, so they are not reported as extra fields.
- `src/ai/prompt.ts`: change rules 3 and 4. The amount of the whole portion eaten goes into `portionSize` with `portionUnit` `"g"` for solids or `"ml"` for drinks. Keep the name free of the amount. Add a rule that `portionSize` and `portionUnit` are either both given or both null. The format description sent to the AI cannot express this (zod drops the check when it builds it), so it has to be in the prompt text.
- `src/app/import.tsx`: map both fields into the preview.
- `src/sync/versions.ts`, `src/sync/status.ts`, `src/sync/engine.ts`, `src/ui/SyncStatus.tsx`, `src/app/settings/index.tsx`: `SUPPORTED_API_VERSION = 2`, and the `updateRequired` reason (`app` or `server`) described in §3. The `server` message has no download link.

Server:
- `Models/Entry.cs`, `Models/DTOs.cs`, `Data/AppDbContext.cs`: add `PortionSize` (`double?`) and `PortionUnit` (`PortionUnit?`, a new enum next to `MealType` in `DTOs.cs`), with a range check, the value converter, and the both-or-neither rule in `EntryChangeDTO.Validate`. An unknown unit is rejected the same way as an unknown meal type.
- A new EF migration, and updated snapshot.
- `SyncService.cs`: copy both fields on push and return them on pull.
- `ServerInfo.cs`: `ApiVersion = 2` and `MinAppVersion` set to the release version.
- A migration test in `DatabaseTests`: migrate a database to `InitialCreate`, insert an entry with SQL, migrate to the latest, and check the entry is intact with null size and unit.
- `bruno/` requests: add both fields to the sample entries.

Tests:
- Jest: form parsing (size without unit, unit toggle, empty), AI schema and extraction with and without the fields, merge round trip, and the two `updateRequired` reasons.
- `Kcal.Server.Tests`: `ValidationTests` (range, unknown unit, size without unit, unit without size), `SyncTests` (round trip, null stays null, `g` and `ml` on the wire).
- Rewrite the existing tests that expect server version 1 or the old prompt:
  - `HealthEndpointTests.cs`: expect `ApiVersion` 2.
  - `bruno/01 setup/01 health.bru`: expect `apiVersion` 2.
  - `helpers.test.ts`: the healthy case is `apiVersion` 2, and the update-required cases are 1 (server too old) and 3 (app too old).
  - `engine.test.ts`: the fake server reports `apiVersion` 2.
  - `prompt.test.ts`: the full format description it compares with `toEqual` now has the two new fields.

### WP2 – Pure product logic (no UI)

New module `src/domain/barcode.ts`:
- `normalizeBarcode(input)`: strip spaces, accept digits only.
- `expandUpcE(code)`: turns an 8-digit UPC-E code into its 12-digit UPC-A form (table below).
- `isValidBarcode(code)`: length 8, 12 or 13, and a correct GS1 check digit. An 8-digit code is checked as EAN-8. A UPC-E code is never checked in its short form, because its check digit belongs to the 12-digit form. The plain EAN-8 rule rejects about 80% of valid UPC-E codes.
- `toLookupCode(input, scannerType?)`: the one function the scan screen and the typed field both use. It returns the code to look up, or null.
  - Scanner type `upc_e`: expand, then check the 12-digit code.
  - Other scanner types: check the code as it is.
  - Typed number with 8 digits: accept it if it is a valid EAN-8. Otherwise, if it starts with 0 or 1, expand it as UPC-E and check that.
  - 12 and 13 digits: check as they are. OFF accepts 12-digit codes, so there is no padding.

UPC-E expansion. A short code is `N d1 d2 d3 d4 d5 d6 C`, where `N` is the number system (0 or 1) and `C` is the check digit. The last digit before the check, `d6`, decides the layout:

| d6 | 12-digit UPC-A |
|---|---|
| 0, 1 or 2 | `N d1 d2 d6 0 0 0 0 d3 d4 d5 C` |
| 3 | `N d1 d2 d3 0 0 0 0 0 d4 d5 C` |
| 4 | `N d1 d2 d3 d4 0 0 0 0 0 d5 C` |
| 5 to 9 | `N d1 d2 d3 d4 d5 0 0 0 0 d6 C` |

Example: `01234565` becomes `012345000065`.

New module `src/domain/product.ts`:
- `OffProduct` type and a zod schema for the fields used. The schema is tolerant: every field may be missing, and numbers may arrive as text. A failed parse gives the `error` result, never an exception.
- `productToFormValues(product, size)`: per-100 values × `size / 100`, rounded as in plan §5.4 (kcal whole, grams to 0.1). The unit is the product's unit.
- OFF keys: `energy-kcal_100g`, `energy_100g` (kJ), `proteins_100g`, `carbohydrates_100g`, `fat_100g` and `fiber_100g` (OFF spells fibre this way).
- Missing nutrient → `null`. Missing kcal with kJ present → kJ ÷ 4.184. Neither → kcal left empty for the user.
- Product unit (`g` or `ml`): the first of these that gives a unit, in this order: `product_quantity_unit`, the unit in the `quantity` text (e.g. "330 ml"), `serving_quantity_unit`, the unit in the `serving_size` text. If none gives one, `g`. The product's own unit comes before the serving unit because OFF sometimes lists a drink's serving in grams (barcode 5000112637922: product unit `ml`, serving unit `g`).
- Default size: `serving_quantity` if it is present and between 0.1 and 10 000, else 100.
- Name: brand and product name, cut to 200 characters. With no product name, the brand alone. With neither, empty, so the user has to type one.
- Carbs: OFF follows the label. Where a label includes fibre in carbs, show a note, and offer a "subtract fibre" toggle later if needed.

Tests:
- Barcodes: one UPC-E case for each row of the table, the example above, a UPC-E whose short form fails the EAN-8 check but is accepted after expansion, a valid typed EAN-8, wrong check digit, wrong length.
- Product mapper with complete, partial, kJ-only and empty products, a liquid in ml, rounding, text instead of numbers, and the name rules.
- Four real OFF products as fixtures (trimmed responses):
  - `5449000000996`: drink, unit `ml`, size 330.
  - `5000112637922`: drink with serving unit `g`, must give `ml`.
  - `3017620422003`: serving unit but no `serving_quantity`, gives `g` and size 100.
  - `4008400402222`: solid, size 15.

### WP3 – Lookup client

`src/products/lookup.ts` with `lookupBarcode(code, signal?): Promise<LookupResult>`.
- `GET https://world.openfoodfacts.org/api/v3/product/{code}.json?fields=product_name,brands,nutriments,serving_quantity,serving_quantity_unit,serving_size,product_quantity_unit,quantity`. These field names were checked against real v3 responses.
- Timeout 8 s with `AbortController`. The caller can also cancel with `signal` (WP4).
- Results: `found`, `notFound`, `offline`, `error`.
  - OFF answers an unknown or invalid code with HTTP 404 and a JSON body (`status: "failure"`, `result.id: "product_not_found"`). That is `notFound`, not `error`.
  - Network failure or timeout is `offline`. Any other failure (HTTP 429 or 5xx, an unreadable answer) is `error`, with a clear message for 429.
- One attempt only, no automatic retry and no backoff. The user is waiting, so a failure shows a Retry button (WP4).
- Send a User-Agent in the form OFF asks for: `AppName/Version (contact)`. OFF also asks apps to fill in a short usage form (§7).
- Attribution: OFF data is ODbL. Add a line to Settings → About.
- The function takes a `fetch` parameter so tests can stub it.

Tests: response parsing and error classification with stubbed fetch, including the 404 body for an unknown code, 429, an HTML error page, and a timeout.

### WP4 – Scan screen and form integration

Dependencies: `npx expo install expo-camera`. Add the plugin to `app.config.ts` with a camera permission text and `recordAudioAndroid: false`. Bump `VERSION`.

Day view `src/app/index.tsx`:
- A third button, "Scan" (`barcode-scan` icon, `contained-tonal`), next to "Add entry" and "AI import". Android only. It opens `/entry/scan` with the shown `date`.
- This is the only way into the scanner. The stack is day view → scan → filled-in "Add entry", so Save and the back button both return to the day view.

Screen `src/app/entry/scan.tsx` (Android only):
- Full-screen `CameraView`, `barcodeScannerSettings.barcodeTypes` as in B1.
- Pass each scan, with its scanner type, to `toLookupCode` (WP2). A scan that gives null is ignored and scanning goes on. Accept only the first scan that gives a code, and ignore further callbacks while navigating.
- Unmount the camera when the screen loses focus (only one preview may be active).
- Torch toggle.
- Link at the bottom: "Type the number instead". It opens a digit field. The typed number goes through `toLookupCode` without a scanner type and shows an error if it gives null.
- Permission denied → show the digit field directly, with an "Open settings" button.
- On a code: `router.replace({ pathname: '/entry/new', params: { barcode: code, date } })`. `replace` removes the scan screen from the stack.

`src/app/entry/new.tsx`:
- Read `barcode`. If present, do the lookup before the form is shown, because the form reads its starting values only once.
  - While the lookup runs, show a loading screen with the barcode number and a "Fill in manually" button. The button cancels the lookup and opens the empty form.
  - When the lookup is done, render `EntryForm` with `key={barcode}` and the starting values.
- `found`: prefill name, portion size, unit and nutrients (WP2), and pass the per-100 values to `EntryForm`.
- `notFound`, `offline`, `error`: an empty form with a notice, e.g. "Product not found. Fill it in manually." For `offline` and `error` the notice has a Retry button that runs the lookup again. The barcode stays in the notice.
- No barcode param: unchanged behaviour.

`src/ui/EntryForm.tsx`:
- A new optional prop `per100`: the unit and the per-100 values of kcal, protein, carbs, fat and fibre (null = unknown). The form also keeps a `scaling` flag in its state. It is on when `per100` is given.
- While `scaling` is on, changing the portion size recomputes kcal, protein, carbs, fat and fibre as per-100 value × size ÷ 100, rounded as in WP2. An empty or invalid size leaves the nutrients as they are.
- Editing kcal, protein, carbs, fat or fibre by hand switches `scaling` off for good. `NutrientInputs` already reports the changed field, so the form can tell.
- The g/ml toggle does not touch `scaling` (B9).
- No scan button in the form, and no scanner shortcut elsewhere.

Edit screen: size and unit are plain fields. No automatic rescaling. A "Scale nutrients to X" action can come later.

### WP5 – Docs

Update `plan.md` after you move it to the archive, or fold this file into the new main plan. Sections that change: §1.2 and §16 (remove barcode scanning), §2 (new decisions), §5.1 (entry field), §6 and §8 (sync, server, `ApiVersion` and `MinAppVersion`), §9 (scan screen, new dependency, permission), §10 (AI schema and prompt).

## 5. Order and release

1. WP1 as its own PR with a `VERSION` bump, `ApiVersion` 2 and the raised `MinAppVersion`.
2. WP2 and WP3 together (pure code and tests, no UI).
3. WP4 with the `expo-camera` dependency, needing a new APK.
4. WP5 alongside each PR.

Every PR to `main` must raise `VERSION` (README).

## 6. Risks

| Risk | Mitigation |
|---|---|
| OFF data is wrong or incomplete. | Always show the editable form before saving. Never save a lookup directly. |
| OFF rate limit (15 product reads per minute per IP, applied per user for apps). | Single user, so unlikely. Show a clear message on 429. |
| No signal in a shop. | The offline result opens the manual form. A local cache (B4) is the later fix. |
| Old client erases the portion size and unit, or a new client pushes to an old server and loses them. | `ApiVersion` 2 plus `MinAppVersion` (§3, "Migration and rollout"). |
| A drink gets the g label (or the reverse). | Only the label is wrong. The scaling is the same for g and ml (B9). The unit comes from the product's own unit first (WP2), is shown next to the size, and can be changed freely. |
| Camera quality on some phones. | Torch, the digit fallback, and a check on real devices before release. |
| US-labelled products count fibre inside carbs. | Note in the form. Optional toggle later. |

## 7. Open points

- OFF contact details for the User-Agent, and OFF's short API usage form.
- Whether a local product cache is wanted after real use.
