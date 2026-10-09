import { z } from 'zod';
import { sendCommand } from '../../shared/application/command-client';
import type { HttpTransport } from '../../shared/application/http-port';

export const candyLineSchema = z.looseObject({
  item: z.string(), quantity: z.number().int().positive(), unitPrice: z.number().positive(),
});
export const pendingCandySchema = z.looseObject({
  requestId: z.string().min(8).max(100), lines: z.array(candyLineSchema).min(1).max(100),
});
export type CandyLine = z.infer<typeof candyLineSchema>;
export type PendingCandy = z.infer<typeof pendingCandySchema>;

const saleResponseSchema=z.looseObject({order:z.looseObject({id:z.string(),total:z.number()})});
export function submitCandySale(transport:HttpTransport, command:unknown) {
  return sendCommand(transport,pendingCandySchema.parse(command),saleResponseSchema);
}

export function restorePendingCandy(raw: string | null): PendingCandy | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    const result = pendingCandySchema.safeParse(value);
    return result.success ? result.data : null;
  } catch { return null; }
}
