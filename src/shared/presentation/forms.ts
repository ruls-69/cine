import { commandSchema } from '../application/commands';
import type { Command } from '../application/commands';

export interface PreparedForm {
  form: HTMLFormElement;
  command: Command;
  submitter: HTMLElement | null;
}

export function commandFromForm(form: HTMLFormElement, branch: string, kind: string): Command {
  const fields: Record<string, unknown> = Object.fromEntries(new FormData(form));
  return commandSchema.parse({ ...fields, action: form.dataset.action,
    branch: form.dataset.branch || branch, id: form.dataset.id, kind: fields['kind'] || kind });
}

export function requestId(form: HTMLFormElement): string {
  return form.dataset.requestId ||= crypto.randomUUID();
}
