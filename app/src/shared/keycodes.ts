// KeyboardEvent.code → macOS virtual keycode (kVK_*), independent of the keyboard layout.
export const CODE_TO_MAC: Record<string, number> = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyH: 4, KeyG: 5, KeyZ: 6, KeyX: 7, KeyC: 8, KeyV: 9,
  IntlBackslash: 10, KeyB: 11, KeyQ: 12, KeyW: 13, KeyE: 14, KeyR: 15, KeyY: 16, KeyT: 17,
  Digit1: 18, Digit2: 19, Digit3: 20, Digit4: 21, Digit6: 22, Digit5: 23, Equal: 24, Digit9: 25,
  Digit7: 26, Minus: 27, Digit8: 28, Digit0: 29, BracketRight: 30, KeyO: 31, KeyU: 32,
  BracketLeft: 33, KeyI: 34, KeyP: 35, Enter: 36, KeyL: 37, KeyJ: 38, Quote: 39, KeyK: 40,
  Semicolon: 41, Backslash: 42, Comma: 43, Slash: 44, KeyN: 45, KeyM: 46, Period: 47, Tab: 48,
  Space: 49, Backquote: 50, Backspace: 51, Escape: 53,
  NumpadDecimal: 65, NumpadMultiply: 67, NumpadAdd: 69, NumpadDivide: 75, NumpadEnter: 76,
  NumpadSubtract: 78, NumpadEqual: 81, Numpad0: 82, Numpad1: 83, Numpad2: 84, Numpad3: 85,
  Numpad4: 86, Numpad5: 87, Numpad6: 88, Numpad7: 89, Numpad8: 91, Numpad9: 92,
  F1: 122, F2: 120, F3: 99, F4: 118, F5: 96, F6: 97, F7: 98, F8: 100, F9: 101, F10: 109,
  F11: 103, F12: 111, F13: 105, F14: 107, F15: 113, F16: 106, F17: 64, F18: 79, F19: 80, F20: 90,
  Insert: 114, Home: 115, PageUp: 116, Delete: 117, End: 119, PageDown: 121,
  ArrowLeft: 123, ArrowRight: 124, ArrowDown: 125, ArrowUp: 126,
};

const SPECIAL_LABELS: Record<string, string> = {
  Space: "Space", Enter: "↩", NumpadEnter: "⌤", Tab: "⇥", Backspace: "⌫", Delete: "⌦", Escape: "⎋",
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
  PageUp: "⇞", PageDown: "⇟", Home: "↖", End: "↘", Insert: "Help",
};

/** Human-readable key label (follows the current layout via `key` for character keys).
 *  Saved in config.json, so it stays language-neutral; see `displayKeyLabel` for the UI. */
export function keyLabel(code: string, key: string): string {
  if (SPECIAL_LABELS[code]) return SPECIAL_LABELS[code];
  if (/^F\d+$/.test(code)) return code;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "num " + code.slice(6).replace("Decimal", ".").replace("Multiply", "×").replace("Add", "+").replace("Subtract", "−").replace("Divide", "÷").replace("Equal", "=");
  return key.length === 1 ? key.toUpperCase() : key;
}

/** Apple's order: ⌃ ⌥ ⇧ ⌘ */
export const MODIFIER_ORDER = ["ctrl", "option", "shift", "cmd", "fn"] as const;
export const MODIFIER_SYMBOL: Record<string, string> = { ctrl: "⌃", option: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" };
export const MODIFIER_NAME: Record<string, string> = { ctrl: "Control", option: "Option", shift: "Shift", cmd: "Command", fn: "Fn" };

export function sortModifiers(mods: string[]): string[] {
  return [...mods].sort((a, b) => MODIFIER_ORDER.indexOf(a as never) - MODIFIER_ORDER.indexOf(b as never));
}

/** Space was saved as "Espaço" by older versions and as "Space" now; show it in the UI language. */
export function displayKeyLabel(label: string, spaceName: string): string {
  return label === "Space" || label === "Espaço" ? spaceName : label;
}
