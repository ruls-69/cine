import type { PreparedForm } from '../../shared/presentation/forms';
import type { Confirm, PrepareResult } from '../../shared/application/commands';

export function prepareInventory({form,command,submitter}: PreparedForm, confirm: Confirm): PrepareResult {
  if (command.action!=='audit_save') return command;
  command.counts=Object.fromEntries(Array.from(form.querySelectorAll<HTMLInputElement>('.count'),input=>[input.name,input.value]));
  if(submitter?.getAttribute('name')==='finish') {
    if(!confirm('¿Confirmar el conteo, reemplazar las existencias oficiales y desbloquear la operación?')) return null;
    command.action='audit_finish';
  }
  return command;
}
