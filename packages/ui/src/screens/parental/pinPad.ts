import { PIN_LENGTH } from '../../../../core/src/parental.ts';

// ---- PIN keypad (SettingsParentalPin*): 4 boxes + 3×4 digit keys. Physical digit keys also work.

export interface PinPad {
  el: HTMLElement;
  /** Clears the input (after a wrong PIN). */
  reset(): void;
  showError(message: string): void;
  destroy(): void;
}

const PAD_ROWS: string[][] = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['del', '0', 'ok']];

/** PIN keypad: 4 boxes, a message row, and digit keys. `onSubmit(pin)` is called once a 4-digit entry is completed with OK. */
export class PinPadView implements PinPad {
  readonly el: HTMLElement;
  private readonly onSubmit: (pin: string) => void;
  private readonly boxEls: HTMLElement[] = [];
  private readonly message: HTMLElement;
  private readonly okKey: HTMLElement;
  private value = '';
  /** Physical digits (keyboard / remote): e.key '0'-'9'. */
  private readonly onKey = (e: KeyboardEvent): void => {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      this.add(e.key);
    }
  };

  constructor(onSubmit: (pin: string) => void) {
    this.onSubmit = onSubmit;
    this.el = document.createElement('div');
    this.el.style.cssText = 'display:flex;flex-direction:column;align-items:center';

    const boxes = document.createElement('div');
    boxes.className = 'pin-boxes';
    for (let i = 0; i < PIN_LENGTH; i++) {
      const b = document.createElement('span');
      b.className = 'pin-box';
      this.boxEls.push(b);
      boxes.append(b);
    }
    this.message = document.createElement('div');
    this.message.className = 'pin-message';
    this.message.style.margin = '20px 0 8px';
    this.okKey = document.createElement('div');

    this.el.append(boxes, this.message, this.buildGrid());
    this.paint();
    document.addEventListener('keydown', this.onKey);
  }

  reset(): void {
    this.value = '';
    this.paint();
  }

  showError(message: string): void {
    this.message.textContent = message;
    this.value = '';
    this.paint(true);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKey);
  }

  private paint(error = false): void {
    this.boxEls.forEach((b, i) => {
      b.innerHTML = i < this.value.length ? '<span class="pin-dot"></span>' : '';
      b.classList.toggle('current', !error && i === Math.min(this.value.length, PIN_LENGTH - 1));
      b.classList.toggle('error', error);
    });
    this.okKey.classList.toggle('disabled', this.value.length < PIN_LENGTH);
  }

  private add(d: string): void {
    if (this.value.length >= PIN_LENGTH) return;
    this.value += d;
    this.message.textContent = '';
    this.paint();
  }

  private del(): void {
    this.value = this.value.slice(0, -1);
    this.message.textContent = '';
    this.paint();
  }

  private submit(): void {
    if (this.value.length === PIN_LENGTH) this.onSubmit(this.value);
  }

  /** Key focus ids: `pin-<digit>`, `pin-del`, `pin-ok`. */
  private buildGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'pin-grid';
    for (const row of PAD_ROWS) {
      for (const k of row) {
        const key = k === 'ok' ? this.okKey : document.createElement('div');
        key.dataset.focusId = `pin-${k}`;
        if (k === 'del') {
          key.className = 'pin-key ghost';
          key.textContent = 'Sil';
          key.addEventListener('click', () => this.del());
        } else if (k === 'ok') {
          key.className = 'pin-key ok';
          key.textContent = 'Tamam';
          key.addEventListener('click', () => this.submit());
        } else {
          key.className = 'pin-key';
          key.textContent = k;
          key.addEventListener('click', () => this.add(k));
        }
        grid.append(key);
      }
    }
    return grid;
  }
}

/** `onSubmit(pin)` is called once a 4-digit entry is completed with OK. */
export function createPinPad(onSubmit: (pin: string) => void): PinPad {
  return new PinPadView(onSubmit);
}
