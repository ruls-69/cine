import { z } from 'zod';
import { sendCommand } from '../../shared/application/command-client';
import type { HttpTransport } from '../../shared/application/http-port';

export const ticketLineSchema = z.looseObject({
  item: z.string(), quantity: z.number().int().positive(), unitPrice: z.number().positive(),
  seatsPerTicket: z.number().int().min(1).max(2),
});
export const pendingTicketSchema = z.looseObject({
  requestId: z.string().min(8).max(100), lines: z.array(ticketLineSchema).min(1).max(50),
});
export type TicketLine = z.infer<typeof ticketLineSchema>;
export type PendingTicket = z.infer<typeof pendingTicketSchema>;

const saleResponseSchema=z.looseObject({
  order:z.looseObject({id:z.string(),lines:z.array(z.looseObject({quantity:z.number(),unitPrice:z.number()})),total:z.number()}),
  repeated:z.boolean().optional(),
});
export function submitTicketSale(transport:HttpTransport, command:unknown) {
  return sendCommand(transport,pendingTicketSchema.parse(command),saleResponseSchema);
}

export function restorePendingTicket(raw: string | null): PendingTicket | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    const result = pendingTicketSchema.safeParse(value);
    return result.success ? result.data : null;
  } catch { return null; }
}
