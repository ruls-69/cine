import { z } from 'zod';

export const roleSchema = z.enum(['manager', 'accounting', 'administrator', 'ticketing', 'candy']);
export const userSchema = z.object({ id: z.string(), role: roleSchema, branch: z.string().nullable() });
// Collection records retain feature-specific fields. Consumers validate the
// command they build separately; this envelope must never coerce server values.
const rowSchema = z.looseObject({ id: z.string().optional(), branch: z.string().optional() });
export const stateSchema = z.looseObject({
  products: z.array(rowSchema), shows: z.array(rowSchema), sales: z.array(rowSchema),
  reports: z.array(rowSchema), audits: z.array(rowSchema), closures: z.array(rowSchema),
  log: z.array(rowSchema), users: z.array(userSchema),
  availability: z.record(z.string(), z.number()),
});
export const sessionSchema = z.object({
  user: userSchema, branches: z.array(z.string()), today: z.string(),
  serverTime: z.string(), state: stateSchema,
});
export type SessionDTO = z.infer<typeof sessionSchema>;
export type UserDTO = z.infer<typeof userSchema>;

export function errorMessage(value: unknown): string {
  const result = z.object({ error: z.string() }).safeParse(value);
  return result.success ? result.data.error : 'No se pudo completar la solicitud.';
}
