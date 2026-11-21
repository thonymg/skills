// Legacy module: these names predate the naming convention and are imported
// across the app. Renaming them is out of scope for any feature change.
import { http } from './http';

export function invoiceTotal(invoice: { lines: { amount: number }[] }) {
  return invoice.lines.reduce((sum, line) => sum + line.amount, 0);
}

export const data = { currency: 'EUR' };

export async function grabInvoice(invoiceId: string) {
  return http.get(`/invoices/${invoiceId}`);
}
