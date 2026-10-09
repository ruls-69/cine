/* Presentation primitives only. Business state stays in each existing feature. */
interface UniversalUIApi {
  escape(value: unknown): string;
  empty(title: string, description?: string): string;
  table(headers: readonly string[], rows: readonly string[]): string;
  steps(labels: readonly string[], active: number): string;
  enhance(root?: ParentNode): void;
}
interface Window { UniversalUI: UniversalUIApi; }

(() => {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escape(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => entities[char] ?? char);
  }
  function empty(title: string, description = 'Los registros aparecerán aquí cuando tu equipo comience a operar.'): string {
    return `<div class="empty"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 9h22v6a3 3 0 0 0 0 6v5H5v-5a3 3 0 0 0 0-6V9zM21 9v17"/></svg><h3>${escape(title)}</h3><p>${escape(description)}</p></div>`;
  }
  // Callers supply escaped cell markup. Headers may include pre-escaped labels.
  function table(headers: readonly string[], rows: readonly string[]): string {
    if (!rows.length) return empty('Todavía no hay registros');
    return `<p class="table-scroll-hint" aria-hidden="true">Desliza la tabla para ver todas las columnas →</p><div class="table-wrap" tabindex="0" role="region" aria-label="Tabla de registros; desplaza para ver todas las columnas"><table><thead><tr>${headers.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function steps(labels: readonly string[], active: number): string {
    return `<ol class="flow-steps" aria-label="Progreso de venta">${labels.map((label, i) => `<li class="${i === active ? 'current' : i < active ? 'complete' : ''}"${i === active ? ' aria-current="step"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${escape(label)}</li>`).join('')}</ol>`;
  }
  function enhance(root: ParentNode = document): void {
    root.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => {
      if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
        dialog.setAttribute('aria-label', dialog.querySelector('h2')?.textContent ?? 'Formulario');
      }
      dialog.querySelectorAll<HTMLButtonElement>('form.form-grid > button.primary').forEach(button => {
        const actions = document.createElement('div');
        actions.className = 'form-actions';
        button.before(actions);
        actions.append(button);
      });
    });
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type=hidden]), select').forEach(control => {
      if (control.labels?.length || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
      const names: Record<string, string> = { note: 'Observaciones de revisión', reason: 'Motivo', status: 'Estado de revisión' };
      const label = document.createElement('label');
      label.className = 'auto-field';
      label.textContent = names[control.name] ?? control.getAttribute('placeholder') ?? 'Selecciona una opción';
      control.before(label);
      label.append(control);
    });
    root.querySelectorAll<HTMLImageElement>('img').forEach(img => {
      if (img.dataset.fallbackBound) return;
      img.dataset.fallbackBound = 'true';
      const fallback = (): void => {
        img.classList.add('image-unavailable');
        img.removeAttribute('src');
      };
      img.addEventListener('error', fallback, { once: true });
      if (img.complete && img.currentSrc && img.naturalWidth === 0) fallback();
    });
  }
  window.UniversalUI = { escape, empty, table, steps, enhance };
  document.addEventListener('DOMContentLoaded', () => {
    enhance();
    const root = document.getElementById('root');
    if (!root) return;
    const observer = new MutationObserver(records => {
      if (records.some(record => record.addedNodes.length > 0)) enhance(root);
    });
    observer.observe(root, { childList: true, subtree: true });
  });
})();
