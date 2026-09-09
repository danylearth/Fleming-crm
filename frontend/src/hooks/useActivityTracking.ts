import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
export function useActivityTracking() {
  const { token } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!token) return;
    let lastInput = Date.now();
    const recordInput = () => { lastInput = Date.now(); };
    const record = (navigation = false) => {
      if (document.visibilityState !== 'visible' || Date.now()-lastInput > 60000) return;
      void fetch(`${import.meta.env.VITE_API_URL || ''}/api/activity/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ page: pathname, navigation }) }).catch(() => {});
    };
    const events = ['pointerdown','keydown','touchstart','scroll'];
    events.forEach(e => window.addEventListener(e,recordInput,{ passive: true }));
    record(true); const timer = window.setInterval(() => record(),30000);
    return () => { clearInterval(timer); events.forEach(e => window.removeEventListener(e,recordInput)); };
  }, [token,pathname]);
}
