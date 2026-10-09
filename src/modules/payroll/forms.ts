import type { PreparedForm } from '../../shared/presentation/forms';
import { requestId } from '../../shared/presentation/forms';
import type { Confirm, PrepareResult } from '../../shared/application/commands';
import { encodeBiometric } from './biometric-reader';

export async function preparePayroll({form,command}: PreparedForm, confirm: Confirm): Promise<PrepareResult> {
  if(command.action==='payroll_extra') {
    command.employees=new FormData(form).getAll('employees');
    command.requestId=requestId(form);
  }
  if(command.action==='payroll_delete'&&!confirm('¿Borrar este registro? Dejará de aparecer en las listas. Los registros con historial asociado se conservan.')) return null;
  if(command.action==='payroll_validate'&&!confirm('¿Validar esta planilla y preparar el envío individual a los empleados? Los importes quedarán bloqueados.')) return null;
  if(command.action==='payroll_import') {
    const input=form.querySelector<HTMLInputElement>('[name="biometric"]');
    Object.assign(command,await encodeBiometric(input?.files?.[0]));
    delete command.biometric;
    command.requestId=requestId(form);
  }
  return command;
}
