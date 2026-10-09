import { z } from 'zod';
import { errorMessage } from '../contracts';
import type { HttpTransport } from './http-port';

export type CommandResponse<T> = {ok:true;status:number;body:T}|{ok:false;status:number;body:{error:string}};

/** Preserve HTTP failure status so a feature can retain its idempotent retry. */
export async function sendCommand<T>(transport: HttpTransport, command: unknown, schema: z.ZodType<T>): Promise<CommandResponse<T>> {
  const response=await transport('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
  const body=await response.json();
  if(!response.ok) return {ok:false,status:response.status,body:{error:errorMessage(body)}};
  return {ok:true,status:response.status,body:schema.parse(body)};
}
