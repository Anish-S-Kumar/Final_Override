// FINAL OVERRIDE — Decoding & Cryptographic Workbench Tools
// Supports Base64, Hexadecimal, ROT13, Atbash, Caesar shift, and Vigenere ciphers.

function rot13(str) {
  return caesarShift(str, 13);
}

function base64Decode(str) {
  const clean = str.trim().replace(/\s+/g, '');
  try {
    return atob(clean);
  } catch {
    throw new Error('Invalid Base64 input: check padding or characters');
  }
}

function hexDecode(str) {
  const clean = str.trim().replace(/\s+/g, '');
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('Invalid Hex stream: requires even-length hex digits (0-9, a-f)');
  }
  let out = '';
  for (let i = 0; i < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
  }
  return out;
}

function atbash(str) {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const isUpper = c >= 'A' && c <= 'Z';
    const base = isUpper ? 65 : 97;
    return String.fromCharCode(base + (25 - (c.charCodeAt(0) - base)));
  });
}

function rot5(str) {
  return str.replace(/[0-9]/g, (c) => {
    return String((parseInt(c, 10) + 5) % 10);
  });
}

function caesarShift(str, shift = 3) {
  const s = ((shift % 26) + 26) % 26;
  return str.replace(/[a-zA-Z]/g, (c) => {
    const isUpper = c >= 'A' && c <= 'Z';
    const base = isUpper ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + s) % 26) + base);
  });
}

function reverseStr(str) {
  return str.split('').reverse().join('');
}

function vigenereDecode(str, key = '') {
  if (!key) return str;
  const k = key.toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) return str;
  let kIdx = 0;
  return str.replace(/[a-zA-Z]/g, (c) => {
    const isUpper = c >= 'A' && c <= 'Z';
    const base = isUpper ? 65 : 97;
    const shift = k.charCodeAt(kIdx % k.length) - 65;
    kIdx++;
    return String.fromCharCode(((c.charCodeAt(0) - base - shift + 26) % 26) + base);
  });
}

window.decoderTools = {
  rot13,
  base64Decode,
  hexDecode,
  atbash,
  rot5,
  caesar3: (s) => caesarShift(s, 3),
  caesarShift,
  reverse: reverseStr,
  vigenere: vigenereDecode
};
