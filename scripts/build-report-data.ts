import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const SHEET_ID = '1LtLWrFwADBtmm5CkA1NeYr1G4mJgVdFWT6a9eq1TCQw';

// Sheet configurations with GID (more reliable than names)
const SHEET_CONFIGS = [
  { key: 'output', name: 'output', gid: '0' },
  { key: 'ebitda_timeseries', name: 'EBITDA Timeseries', gid: '845629928' },
  { key: 'revenue_timeseries', name: 'Revenue Timeseries', gid: '755104021' },
  { key: 'employee_timeseries', name: 'Employee timeseries', gid: '12460386' },
  { key: 'ev_timeseries', name: 'EV timeseries', gid: '790875073' },
  { key: 'mafia', name: 'Mafia', gid: '1431246161' },
  { key: 'founders', name: 'founders', gid: '275207722' },
];

/**
 * Parse CSV text into array of objects
 */
function parseCSV(csvText: string): Record<string, string>[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    
    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else if (char === '\r' && !inQuotes) {
      // Skip carriage returns
    } else {
      currentLine += char;
    }
  }
  
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  if (lines.length < 2) return [];
  
  const headers = parseCSVRow(lines[0]);
  
  const results: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i]);
    
    const obj: Record<string, string> = {};
    let rowHasData = false;
    
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j]?.trim();
      const value = values[j]?.trim() ?? '';
      
      if (header && value !== '') {
        obj[header] = value;
        rowHasData = true;
      }
    }
    
    if (rowHasData) {
      results.push(obj);
    }
  }
  
  return results;
}

function parseCSVRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current);
  return values;
}

/**
 * Fetches sheet data using GID (more reliable) or falls back to sheet name
 */
async function fetchSheetData(config: typeof SHEET_CONFIGS[0]): Promise<Record<string, string>[]> {
  const cacheBuster = Date.now();
  
  // Use /export endpoint which returns all data regardless of filter state
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${config.gid}&_cb=${cacheBuster}`;
  
  console.log(`   Fetching ${config.name}...`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch "${config.name}": ${response.statusText}`);
  }
  
  const csvText = await response.text();
  const allRows = parseCSV(csvText);
  
  // Debug: show columns
  if (allRows.length > 0) {
    console.log(`   [${config.name}] Columns: ${Object.keys(allRows[0]).join(', ')}`);
  }
  
  console.log(`   [${config.name}] ${allRows.length} rows`);
  
  return allRows;
}

async function main() {

  console.log('📥 Fetching Google Sheets data...');
  console.log(`   Sheet ID: ${SHEET_ID}`);
  console.log('');
  
  try {
    const sheetsData: Record<string, Record<string, string>[]> = {};
    
    for (const config of SHEET_CONFIGS) {
      try {
        sheetsData[config.key] = await fetchSheetData(config);
      } catch (error) {
        console.error(`   ❌ Failed to fetch ${config.name}:`, error);
        sheetsData[config.key] = [];
      }
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const quarterNumber = Math.ceil((now.getMonth() + 1) / 3) as 1|2|3|4;
    const reportingQuarter = `${year}Q${quarterNumber}`;
    
    const output = {
      meta: {
        generated_at: now.toISOString(),
        source_sheet_id: SHEET_ID,
        reporting_quarter: reportingQuarter,
        reporting_year: year,
        reporting_quarter_number: quarterNumber,
        schema_version: '2.0',
      },
      sheets: sheetsData,
    config: {
      schema_version: '1.0',
    },
    };
    
    const publicDir = path.join(process.cwd(), 'public');
    if (!existsSync(publicDir)) {
      mkdirSync(publicDir);
    }

    const outputPath = path.join(publicDir, 'report-data.json');
    writeFileSync(outputPath, JSON.stringify(output));
    
    console.log('');
    console.log('✅ Cache complete!');
    
    let totalSize = 0;
    for (const config of SHEET_CONFIGS) {
      const data = sheetsData[config.key];
      const size = JSON.stringify(data).length;
      totalSize += size;
      console.log(`   ${config.name}: ${data.length} rows, ${(size / 1024).toFixed(1)} KB`);
    }
    
    const finalSize = JSON.stringify(output).length;
    console.log(`   Total size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
  } catch (err) {
    console.error('❌ Cache failed:', err);
    process.exit(1);
  }
}

main();
