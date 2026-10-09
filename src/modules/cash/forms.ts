import type { PreparedForm } from '../../shared/presentation/forms';
import { requestId } from '../../shared/presentation/forms';
import type { Confirm, PrepareResult } from '../../shared/application/commands';

export function prepareCash({ form, command }: PreparedForm, confirm: Confirm): PrepareResult {
  if (['cash_movement','cash_open'].includes(command.action)) command.requestId=requestId(form);
  if (command.action==='close' && !confirm('¿Cerrar tu caja del día? Las ventas quedarán bloqueadas hasta una nueva apertura.')) return null;
  return command;
}
