// GSM 7-bit default alphabet characters (Basic Character Set + Extension)
const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZ ÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyz äöñüà';
const GSM_EXTENSION = '|^€{}[~]\\';

function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM_BASIC.includes(char) && !GSM_EXTENSION.includes(char)) return false;
  }
  return true;
}

function gsm7Length(text: string): number {
  let len = 0;
  for (const char of text) {
    // Extension chars take 2 slots (escape + char)
    len += GSM_EXTENSION.includes(char) ? 2 : 1;
  }
  return len;
}

export interface SmsSegmentInfo {
  charCount: number;
  encoding: 'GSM-7' | 'UCS-2';
  segments: number;
  charsPerSegment: number;
  charsRemaining: number;
}

export function calculateSmsSegments(text: string): SmsSegmentInfo {
  if (!text) return { charCount: 0, encoding: 'GSM-7', segments: 0, charsPerSegment: 160, charsRemaining: 160 };

  const gsm = isGsm7(text);
  const charCount = gsm ? gsm7Length(text) : text.length;

  let charsPerSegment: number;
  let segments: number;

  if (gsm) {
    if (charCount <= 160) {
      charsPerSegment = 160;
      segments = 1;
    } else {
      charsPerSegment = 153; // UDH header takes 7 chars
      segments = Math.ceil(charCount / 153);
    }
  } else {
    if (charCount <= 70) {
      charsPerSegment = 70;
      segments = 1;
    } else {
      charsPerSegment = 67; // UDH header takes 3 chars
      segments = Math.ceil(charCount / 67);
    }
  }

  const totalCapacity = segments * charsPerSegment;
  const charsRemaining = totalCapacity - charCount;

  return {
    charCount,
    encoding: gsm ? 'GSM-7' : 'UCS-2',
    segments,
    charsPerSegment,
    charsRemaining,
  };
}
