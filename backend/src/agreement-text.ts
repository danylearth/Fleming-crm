/** Format free-text particulars for display without changing the saved answer. */
export function agreementSentence(value: string | null | undefined, fallback = 'None'): string {
  const text = (value?.trim() || fallback).replace(/\p{L}/u, letter => letter.toLocaleUpperCase('en-GB'));
  return /[.!?]["'’”)\]]*$/.test(text) ? text : text + '.';
}
