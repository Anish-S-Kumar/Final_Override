// ==============================================================================
// FINAL OVERRIDE — STAGE 2 PURE DECODER LIBRARY
// Cross-environment (Browser ES/global + Node.js CommonJS)
// Zero external dependencies.
// ==============================================================================

function base64Decode(str) {
  if (typeof str !== 'string') return { ok: false, reason: 'Input must be a string' };
  const clean = str.trim().replace(/\s+/g, '');
  if (!clean) return { ok: false, reason: 'Empty input' };
  
  // Base64 format check: chars must be A-Z, a-z, 0-9, +, /, =, and length multiple of 4
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    return { ok: false, reason: 'Invalid Base64 characters or padding' };
  }

  try {
    let decoded;
    if (typeof atob === 'function') {
      decoded = atob(clean);
    } else if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(clean, 'base64').toString('utf8');
    } else {
      return { ok: false, reason: 'No Base64 decoder environment available' };
    }
    return { ok: true, text: decoded };
  } catch (err) {
    return { ok: false, reason: 'Base64 decoding failed: ' + (err.message || 'invalid input') };
  }
}

function hexDecode(str) {
  if (typeof str !== 'string') return { ok: false, reason: 'Input must be a string' };
  const clean = str.trim().replace(/\s+/g, '');
  if (!clean) return { ok: false, reason: 'Empty input' };

  if (clean.length % 2 !== 0) {
    return { ok: false, reason: 'Hex string must have an even length' };
  }
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    return { ok: false, reason: 'Hex string contains invalid non-hexadecimal characters' };
  }

  let out = '';
  for (let i = 0; i < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
  }
  return { ok: true, text: out };
}

function rot13(str) {
  if (typeof str !== 'string') return { ok: false, reason: 'Input must be a string' };
  const text = str.replace(/[a-zA-Z]/g, (c) => {
    const isUpper = c >= 'A' && c <= 'Z';
    const base = isUpper ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
  return { ok: true, text };
}

function atbash(str) {
  if (typeof str !== 'string') return { ok: false, reason: 'Input must be a string' };
  const text = str.replace(/[a-zA-Z]/g, (c) => {
    const isUpper = c >= 'A' && c <= 'Z';
    const base = isUpper ? 65 : 97;
    return String.fromCharCode(base + (25 - (c.charCodeAt(0) - base)));
  });
  return { ok: true, text };
}

function reverse(str) {
  if (typeof str !== 'string') return { ok: false, reason: 'Input must be a string' };
  return { ok: true, text: str.split('').reverse().join('') };
}

function caesar(str, shift = 3) {
  if (typeof str !== 'string') return { ok: false, reason: 'Input must be a string' };
  const s = ((shift % 26) + 26) % 26;
  const text = str.replace(/[a-zA-Z]/g, (c) => {
    const isUpper = c >= 'A' && c <= 'Z';
    const base = isUpper ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + s) % 26) + base);
  });
  return { ok: true, text };
}

function validateNumericVigenereKey(key) {
  if (typeof key !== 'string') return { ok: false, reason: 'Key must be a string' };
  const clean = key.trim();
  if (clean.length === 0) return { ok: false, reason: 'Vigenère key cannot be empty' };
  if (clean.length > 12) return { ok: false, reason: 'Vigenère key cannot exceed 12 digits' };
  if (!/^[1-9]+$/.test(clean)) {
    return { ok: false, reason: 'Vigenère key must contain only digits 1-9 (no zeroes or letters)' };
  }
  return { ok: true, key: clean };
}

function vigenereNumericDecode(str, keyDigits) {
  if (typeof str !== 'string') return { ok: false, reason: 'Input must be a string' };
  const keyVal = validateNumericVigenereKey(keyDigits);
  if (!keyVal.ok) return keyVal;

  const k = keyVal.key;
  let kIdx = 0;
  const text = str.replace(/[a-zA-Z]/g, (c) => {
    const isUpper = c >= 'A' && c <= 'Z';
    const base = isUpper ? 65 : 97;
    const shift = parseInt(k[kIdx % k.length], 10);
    kIdx++;
    return String.fromCharCode(((c.charCodeAt(0) - base - shift + 26) % 26) + base);
  });
  return { ok: true, text };
}

function vigenereNumericEncode(str, keyDigits) {
  if (typeof str !== 'string') return { ok: false, reason: 'Input must be a string' };
  const keyVal = validateNumericVigenereKey(keyDigits);
  if (!keyVal.ok) return keyVal;

  const k = keyVal.key;
  let kIdx = 0;
  const text = str.replace(/[a-zA-Z]/g, (c) => {
    const isUpper = c >= 'A' && c <= 'Z';
    const base = isUpper ? 65 : 97;
    const shift = parseInt(k[kIdx % k.length], 10);
    kIdx++;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
  });
  return { ok: true, text };
}

// Module dictionary mapping module ID to pure function
const MODULE_DISPATCH = {
  rot13: (text) => rot13(text),
  base64: (text) => base64Decode(text),
  hex: (text) => hexDecode(text),
  atbash: (text) => atbash(text),
  reverse: (text) => reverse(text),
  caesar: (text, shift = 3) => caesar(text, shift)
};

const decoders = {
  base64Decode,
  hexDecode,
  rot13,
  atbash,
  reverse,
  caesar,
  vigenereNumericDecode,
  vigenereNumericEncode,
  validateNumericVigenereKey,
  MODULE_DISPATCH
};

if (typeof window !== 'undefined') {
  window.stage2Decoders = decoders;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = decoders;
}
