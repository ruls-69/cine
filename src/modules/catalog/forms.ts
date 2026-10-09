import type { PreparedForm } from '../../shared/presentation/forms';
import type { PrepareResult } from '../../shared/application/commands';

interface CatalogFormPorts {
  notify(message: string): void;
  verifyPoster(url: string): Promise<void>;
}

export async function prepareCatalog({command}: PreparedForm, ports: CatalogFormPorts): Promise<PrepareResult> {
  if(command.action==='movie_save') {
    ports.notify('Comprobando imagen…');
    const poster=command['poster'];
    if(typeof poster!=='string') throw new Error('Introduce una imagen válida.');
    await ports.verifyPoster(poster);
  }
  return command;
}
