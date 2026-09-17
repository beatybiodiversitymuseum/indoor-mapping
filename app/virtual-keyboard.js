export const KEYBOARD_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M", "-", "."],
];

export function applyVirtualKey(value, key) {
  if (key === "backspace") return value.slice(0, -1);
  if (key === "clear") return "";
  if (key === "space") return `${value} `;
  return `${value}${key}`;
}

export function virtualKeyWithCaps(key, caps) {
  return /^[A-Z]$/.test(key) ? (caps ? key : key.toLowerCase()) : key;
}
