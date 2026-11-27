import * as XLSX from 'xlsx';
import { parseProtocolSheets, type ImportResult, type SheetRow } from '../lib/protocolImportParser';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function importProtocolWorkbook(file: File): Promise<ImportResult> {
  if (file.size > MAX_FILE_SIZE) throw new Error('Súbor je príliš veľký (max. 5 MB).');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheets: Record<string, SheetRow[]> = {};
  for (const name of workbook.SheetNames) sheets[name] = XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[name], { defval: '' });
  return parseProtocolSheets(sheets);
}
