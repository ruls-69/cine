import { z } from 'zod';
import type { HttpTransport } from '../../shared/application/http-port';

const movieSchema=z.looseObject({id:z.string(),title:z.string(),poster:z.string(),genre:z.string(),rating:z.string(),duration:z.number()});
const showSchema=z.looseObject({id:z.string(),movieId:z.string(),room:z.string(),date:z.string(),time:z.string(),format:z.string(),price:z.number(),available:z.number(),seatsPerTicket:z.number()});
export const catalogSchema=z.object({branch:z.string(),today:z.string(),movies:z.array(movieSchema),shows:z.array(showSchema)});
export const trailersSchema=z.object({branch:z.string(),trailers:z.array(z.object({id:z.string(),title:z.string(),videoId:z.string(),position:z.number()}))});
export type PublicCatalog = z.infer<typeof catalogSchema>;
export type PublicTrailers = z.infer<typeof trailersSchema>;

export class PublicCatalogClient {
  constructor(private readonly transport: HttpTransport) {}
  async catalog(branch:string):Promise<PublicCatalog> {
    const response=await this.transport('/api/public/catalog?branch='+encodeURIComponent(branch),{});
    if(!response.ok) throw new Error('No se pudo cargar la cartelera.');
    return catalogSchema.parse(await response.json());
  }
  async trailers(branch:string):Promise<PublicTrailers> {
    const response=await this.transport('/api/public/trailers?branch='+encodeURIComponent(branch),{cache:'no-store'});
    if(!response.ok) throw new Error('No se pudieron cargar los tráileres.');
    return trailersSchema.parse(await response.json());
  }
}
