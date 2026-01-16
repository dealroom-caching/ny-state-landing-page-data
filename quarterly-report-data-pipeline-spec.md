# NY State Data Pipeline

**Data Cache Specification (v2.0)**  
*Last updated: 2026-01-16*

This document specifies the **data caching pipeline** that fetches Google Sheets data and stores it as a JSON file consumed by downstream applications. This pipeline runs in a **separate GitHub repository** from the webapp.

> **Philosophy:** This is a **dumb cache**. All business logic (filtering, projections, aggregations) happens in the consuming application. The pipeline just fetches and stores raw sheet data.

---

## Table of contents

1. [Overview](#overview)
2. [Repository structure](#repository-structure)
3. [Google Sheets source](#google-sheets-source)
4. [Output JSON schema](#output-json-schema)
5. [GitHub Action workflow](#github-action-workflow)
6. [Build script implementation](#build-script-implementation)
7. [Repository setup](#repository-setup)

---

## Overview

### Architecture

```
┌─────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│  Google Sheets  │ ───► │  GitHub Action (CI)  │ ───► │  Static JSON    │
│  (source data)  │      │  (fetch & cache)     │      │  (GitHub raw)   │
└─────────────────┘      └──────────────────────┘      └─────────────────┘
                                                              │
                                                              ▼
                                                       ┌─────────────────┐
                                                       │  Webapp (fetch) │
                                                       │  (processes)    │
                                                       └─────────────────┘
```

### Why a separate repository?

1. **Decoupled release cycles** — Update data without redeploying the app
2. **Simpler permissions** — Data team can push to data repo; webapp repo stays protected
3. **Cleaner git history** — Large JSON commits don't pollute the webapp history
4. **CDN-friendly** — GitHub raw URLs with cache-busting via commit SHA

---

## Repository structure

```
ny-state-data/
├── public/
│   └── report-data.json        # Single cached JSON (~5 MB, gzipped: ~500-800 KB)
├── scripts/
│   └── build-report-data.ts    # Simple fetch & cache script
├── .github/
│   └── workflows/
│       └── build-data.yml      # GitHub Action workflow
├── package.json
├── tsconfig.json
└── README.md
```

---

## Google Sheets source

**Google Sheets URL:**  
https://docs.google.com/spreadsheets/d/1LtLWrFwADBtmm5CkA1NeYr1G4mJgVdFWT6a9eq1TCQw/edit

**Sheet ID:** `1LtLWrFwADBtmm5CkA1NeYr1G4mJgVdFWT6a9eq1TCQw`

### 7 Sheets to fetch:

| Key | Sheet Name | GID | Description |
|-----|------------|-----|-------------|
| `output` | output | 0 | Main company output data |
| `ebitda_timeseries` | EBITDA Timeseries | 845629928 | EBITDA data over time |
| `revenue_timeseries` | Revenue Timeseries | 755104021 | Revenue data over time |
| `employee_timeseries` | Employee timeseries | 12460386 | Employee count over time |
| `ev_timeseries` | EV timeseries | 790875073 | Enterprise value over time |
| `mafia` | Mafia | 1431246161 | Company alumni/mafia data |
| `founders` | founders | 275207722 | Founder information |

---

## Output JSON schema

### `report-data.json`

Single file containing all cached sheet data as arrays of objects:

```typescript
interface ReportData {
  meta: {
    generated_at: string;              // ISO timestamp
    source_sheet_id: string;           // Google Sheet ID
    reporting_quarter: string;         // e.g. "2026Q1"
    reporting_year: number;            // e.g. 2026
    reporting_quarter_number: 1|2|3|4; // e.g. 1
    schema_version: string;            // "2.0"
  };

  // Raw sheet data - no transformations
  // Column names match Google Sheets exactly
  sheets: {
    output: Record<string, string>[];             // Main company data
    ebitda_timeseries: Record<string, string>[];  // EBITDA over time
    revenue_timeseries: Record<string, string>[]; // Revenue over time
    employee_timeseries: Record<string, string>[]; // Employees over time
    ev_timeseries: Record<string, string>[];      // Enterprise value over time
    mafia: Record<string, string>[];              // Alumni/mafia data
    founders: Record<string, string>[];           // Founder info
  };

  config: {
    schema_version: string;
  };
}
```

**Example structure:**
```json
{
  "meta": {
    "generated_at": "2026-01-16T12:00:00.000Z",
    "source_sheet_id": "1LtLWrFwADBtmm5CkA1NeYr1G4mJgVdFWT6a9eq1TCQw",
    "reporting_quarter": "2026Q1",
    "reporting_year": 2026,
    "reporting_quarter_number": 1,
    "schema_version": "2.0"
  },
  "sheets": {
    "output": [
      {
        "company_id": "...",
        "company_name": "...",
        "company_url": "...",
        ...
      }
    ],
    "ebitda_timeseries": [...],
    "revenue_timeseries": [...],
    "employee_timeseries": [...],
    "ev_timeseries": [...],
    "mafia": [...],
    "founders": [...]
  },
  "config": {
    "schema_version": "1.0"
  }
}
```

**What's NOT included (consuming app handles these):**
- ❌ Data filtering
- ❌ Aggregations  
- ❌ Projections
- ❌ Business logic

---

## GitHub Action workflow

### `.github/workflows/build-data.yml`

```yaml
name: Cache Google Sheets Data

on:
  workflow_dispatch:  # Manual trigger
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  push:
    branches: [main]
    paths:
      - 'scripts/**'
      - '.github/workflows/build-data.yml'

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Fetch and cache Google Sheets data
        run: npx tsx scripts/build-report-data.ts

      - name: Validate JSON
        run: |
          test -s public/report-data.json || exit 1
          jq empty public/report-data.json
          echo "Size: $(wc -c < public/report-data.json) bytes"

      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/report-data.json
          git diff --staged --quiet || git commit -m "chore: update cached data [skip ci]"
          git push
```

> **Note:** The Google Sheet must be shared as "Anyone with the link can view" for this to work without authentication.

---

## Build script implementation

### `scripts/build-report-data.ts`

Simple script that fetches all sheets via the CSV export endpoint (no authentication required for public sheets):

```typescript
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1LtLWrFwADBtmm5CkA1NeYr1G4mJgVdFWT6a9eq1TCQw';

// Sheet configurations with GID
const SHEET_CONFIGS = [
  { key: 'output', name: 'output', gid: '0' },
  { key: 'ebitda_timeseries', name: 'EBITDA Timeseries', gid: '845629928' },
  { key: 'revenue_timeseries', name: 'Revenue Timeseries', gid: '755104021' },
  { key: 'employee_timeseries', name: 'Employee timeseries', gid: '12460386' },
  { key: 'ev_timeseries', name: 'EV timeseries', gid: '790875073' },
  { key: 'mafia', name: 'Mafia', gid: '1431246161' },
  { key: 'founders', name: 'founders', gid: '275207722' },
];

// ... CSV parsing functions ...

async function fetchSheetData(config) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${config.gid}`;
  const response = await fetch(url);
  const csvText = await response.text();
  return parseCSV(csvText);
}

async function main() {
  const sheetsData = {};
  for (const config of SHEET_CONFIGS) {
    sheetsData[config.key] = await fetchSheetData(config);
  }
  
  const output = {
    meta: { /* ... */ },
    sheets: sheetsData,
    config: { schema_version: '1.0' },
  };
  
  writeFileSync('public/report-data.json', JSON.stringify(output));
}
```

**Key features:**
- Uses CSV export endpoint (no Google API auth required)
- Fetches sheets by GID (more reliable than sheet names)
- Includes CSV parsing for proper handling of quoted fields

---

## Repository setup

### `package.json`

```json
{
  "name": "ny-state-data",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsx scripts/build-report-data.ts"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["scripts/**/*"]
}
```

### Google Sheet setup

The Google Sheet must be shared as **"Anyone with the link can view"** for the CSV export to work without authentication.

1. Open the Google Sheet
2. Click "Share" button
3. Under "General access", select "Anyone with the link"
4. Set role to "Viewer"

No GitHub secrets are required for public sheets.

---

## Usage

### Webapp integration

The webapp fetches the cached JSON from GitHub raw URL:

```typescript
const DATA_URL = 'https://raw.githubusercontent.com/dealroom-caching/ny-state-landing-page-data/main/public/report-data.json';

export async function fetchReportData() {
  const response = await fetch(DATA_URL);
  return await response.json();
}
```

### Local development

Run `npm run build` to generate fresh data locally.

---

## Summary

**The pipeline is a "dumb cache" — fetch sheets, store JSON, done.**

- ✅ No authentication required (public sheet via CSV export)
- ✅ Simple fetch & cache script
- ✅ All business logic handled by consuming application
- ✅ ~200 line build script with robust CSV parsing

