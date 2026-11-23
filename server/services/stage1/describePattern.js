// FINAL OVERRIDE — Stage 1 Pattern Description Generator
// Generates accurate, sequence-faithful descriptive text and chip/pulse models
// directly from a Morse pattern string ('•', '—').

function parseSymbols(pattern) {
  if (!pattern || typeof pattern !== 'string') return [];
  return pattern.trim().split(/\s+/).filter(s => s === '•' || s === '—');
}

/**
 * Generates pulse chips description (Sector 1).
 * Example: "Pulses intercepted: a Long pulse (Dash —), followed by a Short pulse (Dot •)."
 */
function describePulses(pattern) {
  const symbols = parseSymbols(pattern);
  if (symbols.length === 0) return 'No pulses detected.';

  const parts = symbols.map(s => s === '—' ? 'a long pulse (Dash —)' : 'a short pulse (Dot •)');
  if (parts.length === 1) {
    return `Pulse intercepted: ${parts[0]}.`;
  }
  if (parts.length === 2) {
    return `Pulses intercepted: ${parts[0]}, followed by ${parts[1]}.`;
  }
  const allExceptLast = parts.slice(0, -1).join(', ');
  return `Pulses intercepted: ${allExceptLast}, followed by ${parts[parts.length - 1]}.`;
}

/**
 * Generates binary stream description (Sector 2).
 * Rule: 111 = Dash (—), 1 = Dot (•), 0 = Space.
 */
function describeBinary(pattern) {
  const symbols = parseSymbols(pattern);
  const stream = symbols.map(s => s === '—' ? '111' : '1').join('-0-');
  return `A binary stream was received: <code>${stream}</code>.<br>Rule: <strong>111 = Dash (—)</strong>, <strong>1 = Dot (•)</strong>, and <strong>0 = Space</strong>.`;
}

/**
 * Generates optical beacon blinking description (Sector 3).
 * When short and long blinks alternate or interleave, accurately describes the exact order.
 * Never claims a count that differs from the sequence.
 */
function describeBlinks(pattern) {
  const symbols = parseSymbols(pattern);
  if (symbols.length === 0) return 'An optical beacon remains dark.';

  const quickCount = symbols.filter(s => s === '•').length;
  const longCount = symbols.filter(s => s === '—').length;

  // Case 1: Pure short blinks
  if (longCount === 0) {
    return `An optical beacon flashes <strong>${quickCount} short blink${quickCount > 1 ? 's' : ''}</strong>:`;
  }
  // Case 2: Pure long blinks
  if (quickCount === 0) {
    return `An optical beacon flashes <strong>${longCount} long blink${longCount > 1 ? 's' : ''}</strong>:`;
  }

  // Case 3: All short blinks followed by all long blinks (e.g. • • • —)
  const firstDashIdx = symbols.indexOf('—');
  const lastDotIdx = symbols.lastIndexOf('•');
  if (lastDotIdx < firstDashIdx) {
    return `An optical beacon flashes <strong>${quickCount} short blink${quickCount > 1 ? 's' : ''} and ${longCount} long blink${longCount > 1 ? 's' : ''} in this order</strong>:`;
  }

  // Case 4: All long blinks followed by all short blinks (e.g. — — •)
  const firstDotIdx = symbols.indexOf('•');
  const lastDashIdx = symbols.lastIndexOf('—');
  if (lastDashIdx < firstDotIdx) {
    return `An optical beacon flashes <strong>${longCount} long blink${longCount > 1 ? 's' : ''} and ${quickCount} short blink${quickCount > 1 ? 's' : ''} in this order</strong>:`;
  }

  // Case 5: Alternating / interleaved pulses (e.g. — • — •, • — • •)
  const seqWords = symbols.map(s => s === '•' ? 'a short blink' : 'a long blink');
  let orderDesc = '';
  if (seqWords.length === 2) {
    orderDesc = `${seqWords[0]} followed by ${seqWords[1]}`;
  } else {
    orderDesc = seqWords.slice(0, -1).join(', ') + ', and ' + seqWords[seqWords.length - 1];
  }
  return `An optical beacon flashes <strong>${orderDesc} in this order</strong>:`;
}

/**
 * Generates satellite transmission description (Sector 4).
 */
function describeSatellite(pattern) {
  const symbols = parseSymbols(pattern);
  if (symbols.length === 0) return 'No satellite signal detected.';

  const parts = symbols.map(s => s === '—' ? 'a long pulse (Dash —)' : 'a short pulse (Dot •)');
  if (parts.length === 1) {
    return `Satellite signal intercepted: ${parts[0]}.`;
  }
  if (parts.length === 2) {
    return `Satellite signal intercepted: ${parts[0]}, followed by ${parts[1]}.`;
  }
  const allExceptLast = parts.slice(0, -1).join(', ');
  return `Satellite signal intercepted: ${allExceptLast}, followed by ${parts[parts.length - 1]}.`;
}

/**
 * Converts a pattern string to pulse chips.
 */
function patternToChips(pattern) {
  const symbols = parseSymbols(pattern);
  return symbols.map(s => ({
    type: s === '—' ? 'dash' : 'dot',
    label: s === '—' ? 'DASH (—)' : 'DOT (•)',
    glyph: s
  }));
}

/**
 * Converts a pattern to binary stream string.
 */
function patternToBinaryStream(pattern) {
  const symbols = parseSymbols(pattern);
  return symbols.map(s => s === '—' ? '111' : '1').join('-0-');
}

/**
 * Converts a pattern to lamp strobe pulses.
 */
function patternToPulses(pattern, unitMs = 600, leadInMs = 800) {
  const symbols = parseSymbols(pattern);
  return symbols.map(s => ({
    on: s === '—' ? unitMs * 3 : unitMs,
    off: unitMs
  }));
}

module.exports = {
  parseSymbols,
  describePulses,
  describeBinary,
  describeBlinks,
  describeSatellite,
  patternToChips,
  patternToBinaryStream,
  patternToPulses
};
