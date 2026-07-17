# Source manifest — public Dell/NVIDIA networking docs

`docs/sources.csv` is the corpus manifest that feeds the tool's knowledge. Every fact in
`js/catalog/*` and `docs/SPEC.md` should trace back to a row here. **Public docs
only** — personal/internal reference, cited (not republished).

## Columns
| column | meaning |
|---|---|
| `doc_id` | short stable ID (H-number or slug) |
| `vendor` | Dell / NVIDIA / Microsoft / IEEE / IETF / IBTA / BE Networks |
| `category` | portfolio · switch-spec · optics · sonic · ai-fabric · storage · compatibility · compute · hci · management · standard |
| `title` | document name |
| `url` | canonical **public** URL |
| `type` | `pdf` (direct download) or `html` (multi-page guide) |
| `access` | `direct` (scriptable), `browser-check` (Info Hub reCAPTCHA — needs a headless browser or manual save), `manual` (support portal page) |
| `verified` | `yes` (URL confirmed via search) or `pattern` (follows a known URL pattern — confirm before relying) |
| `local_file` | the file already in this folder, or `—` |
| `notes` | version/date + what the doc is authoritative for |

## The authoritative few (trust these over spec sheets when they conflict)
- **Portfolio:** `QRG-DC` (Quick Reference Guide) — the current switch line-up.
- **Sizing:** `SONIC-L3` (H18364) — oversubscription 2:1, **2–8 spines**, Clos tiers.
- **AI lossless:** `AI-NETGUIDE` (H04600) — PFC/ECN/DCQCN/ARS-DLB, rail-optimized.
- **PowerScale back-end:** `ST-PS-COMPAT` (OneFS Supportability & Compatibility Guide) —
  the *live* supported-switch matrix (supersedes H16346's snapshot).
- **Azure Local:** `HCI-AZLOCAL` (Microsoft) — the ToR supported-switch list.

## How to use it — the harvester (`tools/harvest.js`)
Zero-dependency Node script. Run from the repo root:
```
node tools/harvest.js                 # fetch all access=direct docs → corpus/
node tools/harvest.js --dry-run       # show the plan, download nothing
node tools/harvest.js --only=storage  # one category
node tools/harvest.js --id=SONIC-L3   # one doc
node tools/harvest.js --force         # re-download even if unchanged
node tools/harvest.js --ignore-robots # override robots for docs you know are public
node tools/harvest.js --help
```
It:
1. **Harvests** `access=direct` rows — polite: real UA, `--delay` (default 1500 ms), follows
   redirects, **conditional GET** (ETag/Last-Modified) + SHA-256 so re-runs skip unchanged docs,
   and **respects robots.txt** (per host; override with `--ignore-robots`).
2. **Extracts** — PDFs via `pdftotext -table` (Xpdf; auto-detected, or set `PDFTOTEXT`), HTML via a
   naive tag-strip → `corpus/txt/<doc_id>.txt` (raw file kept in `corpus/raw/`).
3. **Reports** — writes `corpus/whats-new.txt` listing **new / changed** docs to re-audit, and
   prints the `browser-check` / `manual` rows for you to **save by hand** (Info Hub reCAPTCHA /
   support-portal pages). State is kept in `corpus/.harvest-state.json`.
4. **Reconcile** (human step) — pull facts from the new/changed `corpus/txt/*` into `js/catalog/*`
   **with the `doc_id` cited**, then run the conflict audit (see `docs/SPEC.md`).

**Notes:** `verified=pattern` URLs are confirmed on first pull (a 404 → fix the URL). Some hosts
disallow crawlers in robots (e.g. `www.dell.com/learn/...`) — those get skipped and listed; use the
`delltechnologies.com/asset/...` mirror, `--ignore-robots` (for public docs you're entitled to read),
or save manually. `corpus/` is local scratch — not part of the app.

## Validation tools (category=tool) — external oracles, not scrape targets
- **Dell Fabric Design Center** (`fdc.dell.com`, partner login): Dell's own validated-design
  generator — topology + **wiring diagram + ordering BOM + JSON export**. Workflow: build the
  same scenario in FDC and in Dell Boi, export FDC's BOM/JSON into the project folder, and the
  ingest loop turns it into **ground-truth checks**. Any disagreement = FDC wins.
- **NVIDIA Air** (`air.nvidia.com`, free): digital-twin simulation of Spectrum topologies on
  Cumulus/SONiC — validates the NVIDIA side (topologies, configs) pre-hardware.
- **Dell EIPT** (`dell.com/calc`): measured power/cooling models incl. networking — the
  authoritative watts/BTU source for power-aware rack planning.
These are login/interactive tools: the user generates & downloads outputs legitimately; we ingest
the downloaded files (never scrape behind the login).

## Boundaries
Public, spec-level material only. **Do not** scrape gated partner/pricing/roadmap content
onto this machine, bypass logins, or redistribute the PDFs. Orderable SKUs & pricing stay in
Dell's ordering tools — this tool remains "spec-confirmed / SKU-verify" by design.
