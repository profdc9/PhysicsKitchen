/**
 * Show a modal confirmation dialog styled to match the app theme.
 * Returns a Promise that resolves to true if confirmed, false if cancelled.
 */
export function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #222; border: 1px solid #555; border-radius: 6px;
      padding: 24px 28px; min-width: 280px; max-width: 400px;
      display: flex; flex-direction: column; gap: 20px;
      color: #ddd; font-family: sans-serif; font-size: 14px;
    `;

    const text = document.createElement('p');
    text.textContent = message;
    text.style.lineHeight = '1.5';

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      background: #333; color: #ccc; border: 1px solid #555;
      border-radius: 4px; padding: 6px 18px; cursor: pointer; font-size: 13px;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Reset';
    confirmBtn.style.cssText = `
      background: #622; color: #fcc; border: 1px solid #944;
      border-radius: 4px; padding: 6px 18px; cursor: pointer; font-size: 13px;
    `;

    const close = (result: boolean) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    // Close on Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(false); window.removeEventListener('keydown', onKey); }
      if (e.key === 'Enter')  { close(true);  window.removeEventListener('keydown', onKey); }
    };
    window.addEventListener('keydown', onKey);

    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    dialog.appendChild(text);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    confirmBtn.focus();
  });
}
