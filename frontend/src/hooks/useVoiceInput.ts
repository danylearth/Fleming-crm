import { useEffect, useRef, useState } from 'react';
type Recognition = { lang: string; interimResults: boolean; onresult: ((event: { results: { transcript: string }[][] }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void };
export function useVoiceInput(onText: (text: string) => void) {
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  useEffect(() => { callback.current = onText; }, [onText]);
  const [listening,setListening] = useState(false);
  const [error,setError] = useState('');
  const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
  useEffect(() => () => { recognition.current?.abort(); }, []);
  const toggle = () => {
    if (listening) { recognition.current?.stop(); return; }
    if (!Constructor) { setError('Voice input is unavailable in this browser. You can type your question.'); return; }
    setError(''); const input = new Constructor(); recognition.current = input;
    input.lang='en-GB'; input.interimResults=false;
    input.onresult = event => { const text=event.results[0]?.[0]?.transcript; if (text) callback.current(text); };
    input.onerror = event => { setListening(false); setError(event.error === 'not-allowed' ? 'Microphone access was declined. You can type instead.' : 'Could not hear your question. Try again or type it.'); };
    input.onend = () => setListening(false);
    try { input.start(); setListening(true); } catch { setError('Voice input could not start. Please type your question.'); }
  };
  return { supported:!!Constructor,listening,error,toggle };
}
