import { z } from 'zod';

/** Transport command, not a database row. Feature adapters own its extra fields. */
export const commandSchema = z.looseObject({
  action: z.string().min(1), branch: z.string().min(1),
  id: z.string().optional(), kind: z.string().optional(),
});
export type Command = z.infer<typeof commandSchema>;
export type Confirm = (message: string) => boolean;
export type PrepareResult = Command | null;

