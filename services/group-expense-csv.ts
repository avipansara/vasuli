import type { GroupDetailData, GroupExpenseWithUser } from './group-detail-service';

const CSV_BOM = '\uFEFF';
const CSV_MIME_TYPE = 'text/csv';
const CSV_UTI = 'public.comma-separated-values-text';

const CSV_HEADERS = [
  'Expense ID',
  'Date',
  'Description',
  'Amount',
  'Currency',
  'Paid by',
  'Category',
  'Notes',
  'Created date',
  'Last updated date',
  'Split details',
] as const;

export interface GroupExpenseCsvFile {
  content: string;
  fileName: string;
}

function formatDate(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function safeFileNamePart(value: string): string {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');

  return normalized || 'group';
}

function buildSplitDetails(
  expense: GroupExpenseWithUser,
  detail: Pick<GroupDetailData, 'members' | 'splits'>,
): string {
  const namesById = new Map(
    detail.members.map(member => [member.userId, member.user?.name || 'Unknown'])
  );

  return detail.splits
    .filter(split => split.expenseId === expense.id)
    .map(split => `${namesById.get(split.userId) || 'Unknown'}: ${formatAmount(split.amount)} ${expense.currency}`)
    .join('; ');
}

function buildExpenseRow(
  expense: GroupExpenseWithUser,
  detail: Pick<GroupDetailData, 'members' | 'splits'>,
): string[] {
  const namesById = new Map(
    detail.members.map(member => [member.userId, member.user?.name || 'Unknown'])
  );

  return [
    expense.id,
    formatDate(expense.date),
    expense.description,
    formatAmount(expense.amount),
    expense.currency,
    expense.paidByUser?.name || namesById.get(expense.paidBy) || 'Unknown',
    expense.category || '',
    expense.notes || '',
    formatDate(expense.createdAt),
    formatDate(expense.updatedAt),
    buildSplitDetails(expense, detail),
  ];
}

export function createGroupExpenseCsv(
  detail: Pick<GroupDetailData, 'group' | 'expenses' | 'members' | 'splits'>,
  exportDate = new Date(),
): GroupExpenseCsvFile {
  const rows = [
    CSV_HEADERS as readonly string[],
    ...detail.expenses.map(expense => buildExpenseRow(expense, detail)),
  ];
  const content = `${CSV_BOM}${rows.map(row => row.map(escapeCsvField).join(',')).join('\r\n')}\r\n`;
  const date = formatDate(exportDate.getTime());

  return {
    content,
    fileName: `${safeFileNamePart(detail.group.name)}-expenses-${date}.csv`,
  };
}

async function downloadCsvOnWeb(file: GroupExpenseCsvFile): Promise<void> {
  const documentRef = globalThis.document;
  if (!documentRef) throw new Error('Browser download is unavailable.');

  const blob = new Blob([file.content], { type: `${CSV_MIME_TYPE};charset=utf-8` });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = objectUrl;
  anchor.download = file.fileName;
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);
  anchor.click();
  documentRef.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

async function shareCsvOnNative(file: GroupExpenseCsvFile): Promise<void> {
  const [FileSystem, Sharing] = await Promise.all([
    import('expo-file-system/legacy'),
    import('expo-sharing'),
  ]);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device.');
  }

  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error('Temporary file storage is unavailable.');

  const localUri = `${directory}${file.fileName}`;
  await FileSystem.writeAsStringAsync(localUri, file.content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  try {
    await Sharing.shareAsync(localUri, {
      mimeType: CSV_MIME_TYPE,
      UTI: CSV_UTI,
      dialogTitle: 'Export group expenses',
    });
  } finally {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  }
}

export async function exportGroupExpensesCsv(
  detail: Pick<GroupDetailData, 'group' | 'expenses' | 'members' | 'splits'>,
  exportDate = new Date(),
): Promise<void> {
  const file = createGroupExpenseCsv(detail, exportDate);

  if (process.env.EXPO_OS === 'web') {
    await downloadCsvOnWeb(file);
    return;
  }

  await shareCsvOnNative(file);
}
