import { AudioManager } from '../audio/AudioManager.ts';
import { css } from '../core/math.ts';
import { Time } from '../core/time.ts';
import { UnityRandom } from '../core/rng.ts';

export const UIColors = {
  Panel: css(0.07, 0.11, 0.2, 0.9),
  PanelLight: css(0.12, 0.18, 0.3, 0.95),
  Accent: css(1, 0.56, 0.16),
  Ice: css(0.6, 0.86, 1),
  Text: css(0.97, 0.98, 1),
  Dim: css(0.7, 0.76, 0.86),
  Button: css(0.16, 0.26, 0.42, 1),
  ButtonHover: css(0.24, 0.38, 0.6, 1),
  Danger: css(0.85, 0.3, 0.3),
  Good: css(0.4, 0.9, 0.5),
};

export type V2 = [number, number];
export const TextAnchor = {
  UpperLeft: 'ul', UpperCenter: 'uc', MiddleLeft: 'ml', MiddleCenter: 'mc', MiddleRight: 'mr', LowerRight: 'lr',
} as const;
type Align = (typeof TextAnchor)[keyof typeof TextAnchor];
export const FontStyle = { Normal: '', Bold: 'b', Italic: 'i', BoldAndItalic: 'bi' } as const;
type Style = (typeof FontStyle)[keyof typeof FontStyle];

/** Unity rich text → HTML (b, i, color, size). Size is in reference px like Unity. */
export function richText(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
    .replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>')
    .replace(/&lt;color=(#[0-9a-fA-F]{3,8}|\w+)&gt;/g, '<span style="color:$1">').replace(/&lt;\/color&gt;/g, '</span>')
    .replace(/&lt;size=(\d+)&gt;/g, '<span style="font-size:$1px">').replace(/&lt;\/size&gt;/g, '</span>')
    .replace(/\n/g, '<br>');
}

/** RectTransform: anchor + anchoredPosition + sizeDelta + pivot, all in reference pixels (y up, like Unity). */
export function rect(name: string, parent: HTMLElement, anchor: V2, pos: V2, size: V2, pivot: V2 = [0.5, 0.5]) {
  const el = document.createElement('div');
  el.className = 'r';
  el.dataset.name = name;
  parent.appendChild(el);
  place(el, anchor, pos, size, pivot);
  return el;
}

export function place(el: HTMLElement, anchor: V2, pos: V2, size: V2, pivot: V2 = [0.5, 0.5]) {
  el.style.left = `calc(${anchor[0] * 100}% + ${pos[0] - pivot[0] * size[0]}px)`;
  el.style.bottom = `calc(${anchor[1] * 100}% + ${pos[1] - pivot[1] * size[1]}px)`;
  el.style.width = `${size[0]}px`;
  el.style.height = `${size[1]}px`;
  el.dataset.ax = String(anchor[0]); el.dataset.ay = String(anchor[1]);
  el.dataset.px = String(pivot[0]); el.dataset.py = String(pivot[1]);
  el.dataset.w = String(size[0]); el.dataset.h = String(size[1]);
}

/** Change anchoredPosition only */
export function setPos(el: HTMLElement, pos: V2) {
  const ax = +el.dataset.ax!, ay = +el.dataset.ay!, px = +el.dataset.px!, py = +el.dataset.py!, w = +el.dataset.w!, h = +el.dataset.h!;
  el.style.left = `calc(${ax * 100}% + ${pos[0] - px * w}px)`;
  el.style.bottom = `calc(${ay * 100}% + ${pos[1] - py * h}px)`;
}

export function stretch(name: string, parent: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'r stretch';
  el.dataset.name = name;
  parent.appendChild(el);
  return el;
}

export function image(el: HTMLElement, color: string, rounded = true) {
  el.style.background = color;
  if (rounded) el.style.borderRadius = '22px';
  return el;
}

export function panel(name: string, parent: HTMLElement, anchor: V2, pos: V2, size: V2, color?: string) {
  const el = rect(name, parent, anchor, pos, size);
  image(el, color ?? UIColors.Panel);
  el.style.boxShadow = '0 6px 0 rgba(0,0,0,0.35)';
  return el;
}

export interface Txt extends HTMLDivElement { set(text: string): void; }

export function label(el: HTMLElement, text: string, size: number, color: string, align: Align = 'mc', style: Style = '', outline = true): Txt {
  const t = document.createElement('div') as unknown as Txt;
  t.className = `txt a-${align}` + (style.includes('b') ? ' bold' : '') + (style.includes('i') ? ' ital' : '') + (outline ? ' outline' : '');
  t.style.fontSize = `${size}px`;
  t.style.color = color;
  const inner = document.createElement('div');
  inner.className = 'in';
  t.appendChild(inner);
  let last = '';
  t.set = (s: string) => { if (s !== last) { last = s; inner.innerHTML = richText(s); } };
  t.set(text);
  el.appendChild(t);
  return t;
}

export function text(name: string, parent: HTMLElement, anchor: V2, pos: V2, size: V2, s: string, fontSize: number, color: string, align: Align = 'mc', style: Style = '') {
  const r = rect(name, parent, anchor, pos, size);
  return label(r, s, fontSize, color, align, style);
}

export function button(parent: HTMLElement, s: string, onClick: () => void, width = 440, height = 72, color?: string, fontSize = 32) {
  const el = rect('Btn_' + s, parent, [0.5, 0.5], [0, 0], [width, height]);
  el.classList.add('btn', 'flow');
  image(el, color ?? UIColors.Button);
  label(stretch('Label', el), s, fontSize, UIColors.Text, 'mc', 'b');
  el.addEventListener('mouseenter', () => AudioManager.play('hover', 0.6));
  el.addEventListener('click', e => { e.stopPropagation(); AudioManager.play('click', 0.8); onClick(); });
  return el;
}

/** VerticalLayoutGroup + ContentSizeFitter */
export function column(name: string, parent: HTMLElement, anchor: V2, pos: V2, width: number, spacing = 14, pivot: V2 = [0.5, 0.5]) {
  const el = document.createElement('div');
  el.className = 'r col';
  el.dataset.name = name;
  parent.appendChild(el);
  el.style.width = `${width}px`;
  el.style.gap = `${spacing}px`;
  // height is unknown (fits content) → position with translate on the pivot
  el.style.left = `calc(${anchor[0] * 100}% + ${pos[0] - pivot[0] * width}px)`;
  el.style.bottom = `calc(${anchor[1] * 100}% + ${pos[1]}px)`;
  el.style.transform = `translateY(${pivot[1] * 100}%)`;
  return el;
}

/** "Label ----o---- 80%" */
export function sliderRow(parent: HTMLElement, lbl: string, value: number, min: number, max: number, onChange: (v: number) => void, fmt?: (v: number) => string) {
  const row = rect('Row_' + lbl, parent, [0.5, 0.5], [0, 0], [760, 56]);
  row.classList.add('flow');
  label(rect('L', row, [0, 0.5], [10, 0], [300, 56], [0, 0.5]), lbl, 28, UIColors.Text, 'ml');
  const vt = label(rect('V', row, [1, 0.5], [-10, 0], [110, 56], [1, 0.5]), '', 26, UIColors.Ice, 'mr');
  const sr = rect('Slider', row, [0.5, 0.5], [40, 0], [320, 26]);
  const input = document.createElement('input');
  input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String((max - min) / 200);
  input.value = String(value);
  input.className = 'slider';
  sr.appendChild(input);
  const f = fmt ?? (v => Math.round(v * 100) + '%');
  const paint = () => { const v = +input.value; vt.set(f(v)); input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`); };
  paint();
  input.addEventListener('input', () => { paint(); onChange(+input.value); });
  return { row, set(v: number) { input.value = String(v); paint(); } };
}

/** A row with a label and a button that cycles/toggles its value text. */
export function optionRow(parent: HTMLElement, lbl: string, current: () => string, onClick: () => void) {
  const row = rect('Row_' + lbl, parent, [0.5, 0.5], [0, 0], [760, 56]);
  row.classList.add('flow');
  label(rect('L', row, [0, 0.5], [10, 0], [380, 56], [0, 0.5]), lbl, 28, UIColors.Text, 'ml');
  const br = rect('B', row, [1, 0.5], [-10, 0], [260, 50], [1, 0.5]);
  br.classList.add('btn');
  image(br, UIColors.Button);
  const t = label(stretch('T', br), current(), 26, UIColors.Ice, 'mc', 'b');
  br.addEventListener('mouseenter', () => AudioManager.play('hover', 0.6));
  br.addEventListener('click', e => { e.stopPropagation(); AudioManager.play('click', 0.8); onClick(); t.set(current()); });
  return { row, refresh() { t.set(current()); } };
}

/** The pause menu Resume button that sometimes runs away from the mouse. */
export class DodgeButton {
  dodgesLeft = 0;
  private x = 0; private y = 0;
  private el: HTMLElement;
  private onLastDodge: () => void;
  constructor(el: HTMLElement, onLastDodge: () => void) {
    this.el = el; this.onLastDodge = onLastDodge;
    el.style.zIndex = '20';            // always on top of the other pause buttons, wherever it jumps
    el.addEventListener('mouseenter', () => this.enter());
  }
  arm(dodges: number) { this.dodgesLeft = dodges; this.x = 0; this.y = 0; this.el.style.translate = '0px 0px'; }
  private enter() {
    if (this.dodgesLeft <= 0) return;
    this.dodgesLeft--;
    // jump somewhere clearly different (at least 160 px away) so it really runs from the mouse
    let x = 0, y = 0;
    do { x = UnityRandom.range(-420, 420); y = UnityRandom.range(-210, 210); } while (Math.hypot(x - this.x, y - this.y) < 160);
    this.x = x; this.y = y;
    this.el.style.translate = `${x}px ${-y}px`;
    AudioManager.play('scoot', 0.6);
    if (this.dodgesLeft === 0) this.onLastDodge();
  }
}

/** frame-based alpha helper used by fades */
export const unscaled = () => Time.unscaledDeltaTime;
