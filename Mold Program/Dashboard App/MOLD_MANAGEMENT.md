# Mold Management

The CE dashboard has two modes. Its Mold List Dashboard title returns to the product editor. The top-right Mold Management button opens management mode while preserving the product table and ordinary filters.

## Records

- PM: Receive, In, Out; each button records its click time. An open PM must be completed or cancelled before receiving another PM.
- Repair: Receive, then Polishing, Welding, CNC, EDM or Assemble. Stages can be revisited or skipped according to the actual work. Complete Repair closes the job. Add Record appends details to an open repair.
- Cancel Job preserves all history and requires a reason.
- PM and repair jobs are independent. Summary cards count physical mold records, not events or Sub Molds. Sub Mold specifications use the parent physical mold's management history. Different numbered backup molds have independent histories.
- Timestamps are stored in UTC and shown in English using Asia/Taipei time.

## Storage

`mold_management.json` stores append-only events separately from `mold_shared_rows.json`. Product edits and product Undo do not overwrite management history. The identity is the existing normalized Brand + full Mold No. A future mold-number/brand rename requires an explicit management identity migration; do not change historical events casually.

`mold_management.lock` serializes changes across processes sharing this folder. Writes create a backup under `Backups` and replace the journal through a temporary file. Each event has an idempotency ID and a per-mold/category expected-event ID to reject stale edits. Invalid history raises an error instead of reinitializing storage.

Work Orders are stored in `work_orders` with unique filenames and JSON metadata. Uploads are attached to history when a management action is saved; abandoned uploads may remain unreferenced. Keep this directory with the app when copying or backing it up.

## Work Order Entry

The repair dialog accepts Team, Request By, Rev., Reason and numbered Modification / Done By rows. Product description and mold number are copied from the selected physical mold. Save & Receive Repair opens a waiting repair; Save Work Order appends a revised form to an open repair without changing its stage. Print buttons open saved versions in a landscape A4 layout with the PEAK logo and a Print / Save PDF command. Chinese and other original wording is preserved in structured modification rows.

The server assigns YYYYMMDD-TEAM01, TEAM02, etc. using the Taiwan date at first save, independently per day and team. Number allocation uses the same shared SMB lock as event writes. A saved request keeps its number, date and team when edited. Each saved form preserves its product snapshot and its own revision in history.

## Legacy Work Order Extraction

The vendored SheetJS Community Edition 0.20.3 reader supports `.xlsx`, `.xls`, and `.xlsm` up to 20 MB. Workbook macros are not run. Visible worksheet selection, original extracted text, Work Order number and English repair details are available for review. Original files remain downloadable from history.

The generic extractor recognizes English repair/work description headings and selected Chinese repair headings. It preserves complete English source lines. It does not translate Chinese/Korean/Japanese text or read text embedded solely in images. Non-English repair text raises a visible review message. A real customer Work Order sample is needed to validate its layout and determine whether a translation service is required.

Source: https://docs.sheetjs.com/docs/getting-started/installation/standalone/

## Server

The Windows launcher uses `mold_shared_server.ps1`, which loads `mold_management.ps1` and serves:

- `GET /api/management`
- `POST /api/management/event`
- `POST /api/management/work-order`

Restart `start_mold_shared_server.cmd` after updating the PowerShell server. Existing alternate Python/Node server implementations do not implement these new endpoints.

Management controls require the shared server; they do not save to browser-only storage. No external translation service is called and Work Order contents are not sent outside the shared app.
