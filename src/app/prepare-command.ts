/** Composition dispatches to feature-owned form adapters; it contains no feature rules. */
import { commandFromForm } from '../shared/presentation/forms';
import type { Confirm, PrepareResult } from '../shared/application/commands';
import { prepareCash } from '../modules/cash/forms';
import { prepareCatalog } from '../modules/catalog/forms';
import { prepareInventory } from '../modules/inventory/forms';
import { preparePayroll } from '../modules/payroll/forms';

interface FormPorts {
  confirm: Confirm;
  notify(message: string): void;
  verifyPoster(url: string): Promise<void>;
}

export async function prepareCommand(form: HTMLFormElement, submitter: HTMLElement|null, branch: string, kind: string, ports: FormPorts): Promise<PrepareResult> {
  const command=commandFromForm(form,branch,kind);
  const input={form,submitter,command};
  if(command.action.startsWith('payroll_')) return preparePayroll(input,ports.confirm);
  if(command.action.startsWith('cash_') || command.action==='close' || command.action==='close_review') return prepareCash(input,ports.confirm);
  if(['movie_save','trailer_save','room_save','schedule'].includes(command.action)) return prepareCatalog(input,ports);
  return prepareInventory(input,ports.confirm);
}
