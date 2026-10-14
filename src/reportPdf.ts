import type { Category, Expense, FixedExpense, SpendingLimit } from './types';
import { monthlyBudgetExpenses } from './domain';

interface MonthlyPdfInput {
  cycleLabel: string;
  start: string;
  end: string;
  expenses: Expense[];
  categories: Category[];
  fixedExpenses: FixedExpense[];
  monthlyBudget?: SpendingLimit;
  categoryLimits: SpendingLimit[];
  dailyTotals: Array<{ date: string; amountPaise: number }>;
}

type Line = { text: string; size?: number; color?: string; bold?: boolean; gap?: number; kind?: 'section' | 'category'; value?: string; detail?: string; ratio?: number };

const ascii = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[₹]/g, 'INR ').replace(/[^\x20-\x7e]/g, '?');
const escapePdf = (value: string) => ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
const amount = (paise: number) => `INR ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function wrap(value: string, max = 86): string[] {
  const words = ascii(value).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!word) continue;
    if (line && `${line} ${word}`.length > max) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function streamForPage(lines: Line[], pageNumber: number, pageCount: number, firstPage: boolean, cycleLabel: string, highlights: string[]): string {
  const commands = [
    '0.38 0.32 0.82 rg 0 736 595 106 re f',
    '0.52 0.45 0.91 rg 455 778 86 64 re f',
    '0.98 0.72 0.34 rg 478 804 11 11 re f',
    '0.52 0.45 0.91 rg 520 762 26 16 re f',
    'BT /F2 22 Tf 1 1 1 rg 44 812 Td (Spendwise) Tj ET',
    'BT /F1 8 Tf 0.91 0.89 1 rg 45 793 Td (YOUR MONTHLY MONEY STORY) Tj ET',
    `BT /F2 15 Tf 1 1 1 rg 44 765 Td (${escapePdf(cycleLabel)}) Tj ET`,
    `BT /F1 8 Tf 0.91 0.89 1 rg 478 790 Td (${pageNumber} / ${pageCount}) Tj ET`
  ];
  if (firstPage) {
    commands.push('0.95 0.93 1 rg 42 660 162 58 re f', '0.91 0.98 0.95 rg 216 660 162 58 re f', '1 0.95 0.86 rg 390 660 162 58 re f');
    highlights.forEach((value, index) => {
      const x = [54, 228, 402][index];
      commands.push(`BT /F1 8 Tf 0.38 0.36 0.55 rg ${x} 701 Td (${escapePdf(['TOTAL SPENT', 'BUDGET LEFT', 'FIXED EXPENSES'][index])}) Tj ET`);
      commands.push(`BT /F2 10 Tf 0.28 0.24 0.62 rg ${x} 678 Td (${escapePdf(value)}) Tj ET`);
    });
  }
  let y = firstPage ? 642 : 710;
  for (const line of lines) {
    const size = line.size ?? 10;
    const color = line.color ?? '0.16 0.18 0.31';
    const boldFont = line.bold ? 'F2' : 'F1';
    if (line.kind === 'section') {
      commands.push(`0.95 0.93 1 rg 43 ${y - 7} 509 25 re f`);
      commands.push(`0.96 0.53 0.38 rg 51 ${y + 1} 6 6 re f`);
      commands.push(`BT /F2 10 Tf 0.32 0.28 0.68 rg 65 ${y} Td (${escapePdf(line.text)}) Tj ET`);
      y -= 33;
      continue;
    }
    if (line.kind === 'category') {
      commands.push(`0.97 0.98 1 rg 48 ${y - 34} 500 42 re f`);
      commands.push(`BT /F2 9 Tf 0.20 0.24 0.40 rg 56 ${y} Td (${escapePdf(line.text)}) Tj ET`);
      commands.push(`BT /F2 9 Tf 0.20 0.24 0.40 rg 434 ${y} Td (${escapePdf(line.value ?? '')}) Tj ET`);
      if (line.detail) commands.push(`BT /F1 7 Tf 0.43 0.45 0.57 rg 56 ${y - 10} Td (${escapePdf(line.detail)}) Tj ET`);
      commands.push(`0.88 0.88 0.96 rg 56 ${y - 24} 340 5 re f`);
      commands.push(`0.35 0.70 0.62 rg 56 ${y - 24} ${Math.max(3, Math.min(340, 340 * (line.ratio ?? 0)))} 5 re f`);
      y -= 43;
      continue;
    }
    const wrapped = wrap(line.text, size >= 15 ? 65 : 88);
    for (const text of wrapped) {
      if (y < 52) break;
      commands.push(`BT /${boldFont} ${size} Tf ${color} rg 48 ${y} Td (${escapePdf(text)}) Tj ET`);
      y -= size >= 15 ? 23 : size >= 12 ? 19 : 15;
    }
    y -= line.gap ?? 0;
  }
  commands.push('0.89 0.87 0.95 rg 43 47 509 1 re f');
  commands.push('BT /F1 8 Tf 0.40 0.39 0.54 rg 44 29 Td (Application generated and maintained by SNK.) Tj ET');
  commands.push(`BT /F1 8 Tf 0.40 0.39 0.54 rg 510 29 Td (${pageNumber} / ${pageCount}) Tj ET`);
  return commands.join('\n');
}

export function monthlyReportPdf(input: MonthlyPdfInput): Blob {
  const normalExpenses = input.expenses.filter((expense) => !expense.fixedExpenseId);
  const fixedExpensesInReport = input.expenses.filter((expense) => Boolean(expense.fixedExpenseId));
  const total = input.expenses.reduce((sum, expense) => sum + expense.amountPaise, 0);
  const includedFixedTotal = monthlyBudgetExpenses(fixedExpensesInReport, input.fixedExpenses).reduce((sum, expense) => sum + expense.amountPaise, 0);
  const budgetCounted = monthlyBudgetExpenses(input.expenses, input.fixedExpenses).reduce((sum, expense) => sum + expense.amountPaise, 0);
  const categories = [
    ...input.categories.map((category) => ({
      name: category.name,
      amount: normalExpenses.filter((expense) => expense.categoryId === category.id).reduce((sum, expense) => sum + expense.amountPaise, 0),
      limit: input.categoryLimits.find((limit) => limit.categoryId === category.id && !limit.deleted)
    })),
    ...(includedFixedTotal > 0 ? [{ name: 'Fixed expenses', amount: includedFixedTotal, limit: undefined }] : [])
  ].filter((row) => row.amount > 0 || row.limit).sort((a, b) => b.amount - a.amount);
  const largestCategory = Math.max(...categories.map((category) => category.amount), 1);
  const budgetRemaining = input.monthlyBudget ? input.monthlyBudget.amountPaise - budgetCounted : undefined;

  const lines: Line[] = [
    { text: `Cycle: ${input.start} to ${input.end}`, color: '0.42 0.44 0.54', gap: 4 },
    { text: 'Every little choice adds up. Here is your month at a glance.', size: 11, color: '0.30 0.32 0.44', gap: 9 },
    { text: `Budget: ${input.monthlyBudget ? amount(input.monthlyBudget.amountPaise) : 'not set'} | Counted: ${amount(budgetCounted)} | ${budgetRemaining === undefined ? 'Set a budget to track what is left.' : budgetRemaining >= 0 ? `${amount(budgetRemaining)} left to spend.` : `${amount(-budgetRemaining)} over budget.`}`, color: '0.30 0.32 0.44', gap: 9 },
    { text: 'CATEGORY SNAPSHOT', kind: 'section' },
    ...categories.map(({ name, amount: spent, limit }) => ({ kind: 'category' as const, text: name, value: amount(spent), detail: limit ? `Monthly allocation ${amount(limit.amountPaise)}` : undefined, ratio: spent / largestCategory })),
    { text: `Fixed expenses: ${amount(fixedExpensesInReport.reduce((sum, expense) => sum + expense.amountPaise, 0))} across ${fixedExpensesInReport.length} included entries.`, color: '0.30 0.32 0.44', gap: 8 },
    { text: 'DAY BY DAY', kind: 'section' },
    ...input.dailyTotals.map((day) => ({ text: `${day.date}    ${amount(day.amountPaise)}` })),
    { text: 'EXPENSE DETAILS', kind: 'section' },
    ...input.expenses.slice().sort((a, b) => a.spentOn.localeCompare(b.spentOn)).map((expense) => {
      const categoryName = expense.fixedExpenseId ? 'Fixed expense' : input.categories.find((category) => category.id === expense.categoryId)?.name ?? 'Other';
      return { text: `${expense.spentOn} | ${expense.itemName} | ${categoryName} | ${amount(expense.amountPaise)}` };
    })
  ];

  const pages: Line[][] = [];
  let current: Line[] = [];
  let estimatedLines = 0;
  for (const line of lines) {
    const lineHeight = line.kind === 'section' ? 33 : line.kind === 'category' ? 43 : wrap(line.text, line.size && line.size >= 15 ? 65 : 88).length * (line.size && line.size >= 12 ? 19 : 15) + (line.gap ?? 0);
    const capacity = pages.length === 0 ? 568 : 650;
    if (estimatedLines + lineHeight > capacity) {
      pages.push(current);
      current = [];
      estimatedLines = 0;
    }
    current.push(line);
    estimatedLines += lineHeight;
  }
  pages.push(current);

  const objects: string[] = [];
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const remainingText = budgetRemaining === undefined ? 'No limit' : budgetRemaining >= 0 ? amount(budgetRemaining) : `${amount(-budgetRemaining)} over`;
    const stream = streamForPage(page, index + 1, pages.length, index === 0, input.cycleLabel, [amount(total), remainingText, amount(includedFixedTotal)]);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R /F2 ${4 + pages.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  const fontId = 3 + pages.length * 2;
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontId + 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
