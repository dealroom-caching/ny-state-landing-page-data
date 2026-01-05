import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_NAMES = [
  'Locations Metadata',
  'Yearly Funding Data',
  'Quarterly Funding Data',
  'Yearly Enterprise Value',
  'Top Industries, Tags, Rounds', // Fixed name from spec implementation example
  'Top Rounds',
  'Regional Comparison',
];

/**
 * Fetches sheet data using the Google Visualization API (JSON export path)
 * This works for any public Google Sheet without an API key.
 */
async function fetchSheetData(sheetName: string) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet "${sheetName}": ${response.statusText}`);
  }
  
  const text = await response.text();
  
  // The response is wrapped in a callback: /* google.visualization.Query.setResponse({...}); */
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/);
  if (!jsonMatch) {
    throw new Error(`Failed to parse JSON response for sheet "${sheetName}"`);
  }
  
  const data = JSON.parse(jsonMatch[1]);
  const table = data.table;
  
  // Extract headers
  const headers = table.cols.map((col: any) => col.label || '');
  
  // Map rows to objects using headers
  return table.rows.map((row: any) => {
    const obj: any = {};
    row.c.forEach((cell: any, i: number) => {
      const header = headers[i];
      if (header) {
        // v is the raw value, f is the formatted string. We prefer raw values.
        obj[header] = cell?.v ?? '';
      }
    });
    return obj;
  });
}

async function main() {
  if (!SHEET_ID) {
    console.error('❌ GOOGLE_SHEET_ID environment variable is not set');
    process.exit(1);
  }

  console.log('📥 Fetching Google Sheets data via JSON export path...');
  
  try {
    // Fetch all sheets in parallel
    const sheetsData = await Promise.all(
      SHEET_NAMES.map(name => fetchSheetData(name))
    );
    
    // Calculate current reporting quarter
    const now = new Date();
    const year = now.getFullYear();
    const quarterNumber = Math.ceil((now.getMonth() + 1) / 3) as 1|2|3|4;
    const reportingQuarter = `${year}Q${quarterNumber}`;
    
    // Build output JSON
    const output = {
      meta: {
        generated_at: now.toISOString(),
        source_sheet_id: SHEET_ID,
        reporting_quarter: reportingQuarter,
        reporting_year: year,
        reporting_quarter_number: quarterNumber,
        schema_version: '2.0',
      },
      sheets: {
        locations: sheetsData[0],
        yearly_funding: sheetsData[1],
        quarterly_funding: sheetsData[2],
        yearly_ev: sheetsData[3],
        top_industries_tags: sheetsData[4],
        top_rounds: sheetsData[5],
        regional_comparison: sheetsData[6],
      },
      config: {
        map_enabled: false,
        share_preview_enabled: true,
        default_location_id: 'london',
      },
    };
    
    // Ensure public directory exists
    const publicDir = path.join(process.cwd(), 'public');
    if (!existsSync(publicDir)) {
      mkdirSync(publicDir);
    }

    // Write to public/report-data.json
    const outputPath = path.join(publicDir, 'report-data.json');
    writeFileSync(outputPath, JSON.stringify(output, null, 2));
    
    console.log('✅ Cache complete!');
    console.log(`   Locations: ${sheetsData[0].length}`);
    console.log(`   Reporting: ${reportingQuarter}`);
    console.log(`   Size: ${(JSON.stringify(output).length / 1024 / 1024).toFixed(2)} MB`);
  } catch (err) {
    console.error('❌ Cache failed:', err);
    process.exit(1);
  }
}

main();
