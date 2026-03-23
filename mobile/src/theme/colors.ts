// Theme colors matching the web application exactly
export const colors = {
  light: {
    // Backgrounds
    bgPage: '#f5f5f5',
    bgCard: '#ffffff',
    bgElevated: '#fafafa',
    bgInput: 'rgba(0,0,0,0.04)',
    bgHover: 'rgba(0,0,0,0.06)',
    bgSubtle: 'rgba(0,0,0,0.03)',

    // Borders
    borderColor: 'rgba(0,0,0,0.08)',
    borderInput: 'rgba(0,0,0,0.1)',
    borderSubtle: 'rgba(0,0,0,0.06)',

    // Text
    textPrimary: '#1a1a1a',
    textSecondary: 'rgba(0,0,0,0.5)',
    textMuted: 'rgba(0,0,0,0.35)',
    textFaint: 'rgba(0,0,0,0.2)',

    // Buttons
    btnPrimaryBg: '#1a1a1a',
    btnPrimaryText: '#ffffff',

    // Accent gradient (orange to pink)
    accentStart: '#f97316', // orange-500
    accentEnd: '#ec4899', // pink-500

    // Overlay
    overlayBg: 'rgba(0,0,0,0.4)',
  },

  dark: {
    // Backgrounds
    bgPage: '#1a1a1a',
    bgCard: '#232323',
    bgElevated: '#2a2a2a',
    bgInput: 'rgba(255,255,255,0.05)',
    bgHover: 'rgba(255,255,255,0.06)',
    bgSubtle: 'rgba(255,255,255,0.03)',

    // Borders
    borderColor: 'rgba(255,255,255,0.08)',
    borderInput: 'rgba(255,255,255,0.1)',
    borderSubtle: 'rgba(255,255,255,0.06)',

    // Text
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255,255,255,0.6)',
    textMuted: 'rgba(255,255,255,0.4)',
    textFaint: 'rgba(255,255,255,0.2)',

    // Buttons
    btnPrimaryBg: '#ffffff',
    btnPrimaryText: '#000000',

    // Accent gradient (same as light)
    accentStart: '#f97316', // orange-500
    accentEnd: '#ec4899', // pink-500

    // Overlay
    overlayBg: 'rgba(0,0,0,0.6)',
  },

  // Status colors (same for both themes)
  status: {
    success: '#10b981', // green-500
    warning: '#f59e0b', // amber-500
    error: '#ef4444', // red-500
    info: '#3b82f6', // blue-500
  },
};

export type Theme = 'light' | 'dark';
export type ColorScheme = typeof colors.light;
