# NY State Data Cache

This repository contains the data caching pipeline for NY state data.

## Overview

The pipeline fetches raw data from **public** Google Sheets and stores it as a static JSON file in the `public/` directory. This JSON is then consumed by the web application.

## Repository Structure

- `public/report-data.json`: The cached data (generated).
- `scripts/build-report-data.ts`: The script that performs the fetch and cache operation.
- `.github/workflows/build-data.yml`: GitHub Action to automate the caching (managed manually).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. The Google Sheet ID is hardcoded in the build script.

3. Run the build script locally:
   ```bash
   npm run build
   ```

## Data Source

- **Google Sheet URL:** https://docs.google.com/spreadsheets/d/1LtLWrFwADBtmm5CkA1NeYr1G4mJgVdFWT6a9eq1TCQw/edit
- **Google Sheet ID:** `1LtLWrFwADBtmm5CkA1NeYr1G4mJgVdFWT6a9eq1TCQw`
- **Sheets fetched:**
  | Key | Sheet Name | GID |
  |-----|------------|-----|
  | `output` | output | 0 |
  | `ebitda_timeseries` | EBITDA Timeseries | 845629928 |
  | `revenue_timeseries` | Revenue Timeseries | 755104021 |
  | `employee_timeseries` | Employee timeseries | 12460386 |
  | `ev_timeseries` | EV timeseries | 790875073 |
  | `mafia` | Mafia | 1431246161 |
  | `founders` | founders | 275207722 |

## Output JSON Structure

```json
{
  "meta": {
    "generated_at": "2026-01-16T...",
    "source_sheet_id": "1LtLWrFwADBtmm5CkA1NeYr1G4mJgVdFWT6a9eq1TCQw",
    "reporting_quarter": "2026Q1",
    "reporting_year": 2026,
    "reporting_quarter_number": 1,
    "schema_version": "2.0"
  },
  "sheets": {
    "output": [...],
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
