# Fleming Lettings CRM - Design Update

This document outlines the comprehensive design update to match the official Fleming Lettings website branding.

## Design System Overview

### Color Palette

Based on the official Fleming Lettings website (fleminglettings.co.uk), the new color scheme features:

**Primary Colors:**
- **Fleming Pink**: `#DC006D` - Primary action color, buttons, accents
- **Fleming Purple**: `#25073B` - Hover states, secondary elements, dark accents
- **Fleming Black**: `#000000` - Primary text, high contrast elements
- **Fleming White**: `#FFFFFF` - Backgrounds, text on dark surfaces

**Gray Scale:**
- 50: `#fafafa` - Lightest backgrounds
- 100: `#f5f5f5`
- 200: `#eeeeee` - Page background (matches website)
- 300: `#e0e0e0` - Borders
- 400: `#bdbdbd`
- 500: `#9e9e9e` - Muted text
- 600: `#757575` - Secondary text
- 700: `#616161`
- 800: `#424242`
- 900: `#212121`

### Typography

**Font Family:**
- Primary: **Switzer** (matches official website)
- Fallback: Inter, system-ui, -apple-system, sans-serif

**Font Weights:**
- 100: Thin
- 200: Extra Light
- 300: Light
- 400: Regular (default)
- 500: Medium
- 600: Semi Bold
- 700: Bold
- 800: Extra Bold

**Font Sizes:**
- xs: 13px (line-height: 1.5)
- sm: 15px (line-height: 1.5)
- base: 16px (line-height: 1.5) - Default
- lg: 18px (line-height: 1.5)
- xl: 20px (line-height: 1.4)
- 2xl: 24px (line-height: 1.3)
- 3xl: 30px (line-height: 1.2)
- 4xl: 36px (line-height: 1.2)
- 5xl: 42px (line-height: 1.1)

### Design Elements

**Shadows:**
- `shadow-fleming`: 6px 6px 9px rgba(0, 0, 0, 0.2) - Standard shadow
- `shadow-fleming-deep`: 12px 12px 50px rgba(0, 0, 0, 0.4) - Elevated elements
- `shadow-fleming-sharp`: 6px 6px 0px rgba(0, 0, 0, 0.2) - Sharp edges

**Border Radius:**
- Minimal border radius (2-4px) for most elements
- Use `rounded-sm` for buttons, cards, inputs (matches website's sharp aesthetic)

**Spacing:**
- Generous padding: 25px-35px for buttons
- Comfortable whitespace between sections

## Component Updates

### 1. Buttons

**Primary Button:**
```tsx
className="bg-fleming-pink text-white px-9 py-3 rounded-sm font-medium hover:bg-fleming-purple transition-all duration-300 shadow-fleming hover:shadow-fleming-deep hover:-translate-y-0.5 font-switzer"
```

**Secondary Button:**
```tsx
className="bg-fleming-purple text-white px-9 py-3 rounded-sm font-medium hover:bg-fleming-pink transition-all duration-300 font-switzer"
```

**Outline Button:**
```tsx
className="border-2 border-fleming-pink text-fleming-pink px-9 py-3 rounded-sm font-medium hover:bg-fleming-pink hover:text-white transition-all duration-300 font-switzer"
```

### 2. Form Inputs

```tsx
className="w-full bg-fleming-gray-50 border border-fleming-gray-300 rounded-sm px-4 py-3 text-sm text-fleming-black placeholder:text-fleming-gray-400 focus:outline-none focus:border-fleming-pink focus:ring-2 focus:ring-fleming-pink/20 transition-all font-switzer"
```

### 3. Cards

```tsx
className="bg-white rounded-sm border border-fleming-gray-300 p-6 shadow-fleming hover:shadow-fleming-deep transition-all duration-300"
```

### 4. Navigation Links (Sidebar)

**Active State:**
```tsx
className="bg-fleming-pink-50 text-fleming-pink border-l-2 border-fleming-pink"
```

**Inactive State:**
```tsx
className="text-fleming-gray-600 hover:text-fleming-pink hover:bg-fleming-pink-50/50 border-l-2 border-transparent"
```

### 5. Checkboxes

Checkboxes are styled globally in `index.css`:
- Unchecked: Gray border (#d1d5db)
- Checked: Fleming Pink background (#DC006D)
- Focus: Pink ring with 50% opacity

## Layout Updates

### Sidebar
- Background: White
- Active item: Light pink background with pink left border
- Hover: Pink text with subtle pink background
- Logo: Pink gradient (pink to purple) with sharp corners
- Font: Switzer throughout

### Top Bar
- Background: White with subtle shadow
- Search input: Light gray background with pink focus ring
- User avatar: Pink to purple gradient

### Main Content Area
- Background: `#eeeeee` (matches website)
- Cards on gray background for depth
- Generous padding and spacing

## CSS Variables

Updated CSS variables in `frontend/src/index.css`:

```css
:root {
  --bg-page: #eeeeee;
  --btn-primary-bg: #DC006D;
  --btn-primary-hover: #25073B;
  --fleming-pink: #DC006D;
  --fleming-purple: #25073B;
}
```

## Tailwind Configuration

Updated `frontend/tailwind.config.js`:
- Added `fleming-pink` color palette
- Added `fleming-purple` color palette
- Added `fleming-black`, `fleming-white`, `fleming-gray` colors
- Added `font-switzer` font family
- Updated font sizes with proper line heights
- Added Fleming-specific shadows

## Migration Guide

### For Existing Components

1. **Replace color classes:**
   - `bg-navy-600` → `bg-fleming-pink`
   - `text-navy-600` → `text-fleming-pink`
   - `hover:bg-navy-700` → `hover:bg-fleming-purple`
   - `bg-gold-500` → `bg-fleming-purple`

2. **Update border radius:**
   - `rounded-lg` → `rounded-sm`
   - `rounded-xl` → `rounded-sm`
   - `rounded-2xl` → `rounded-sm`
   - `rounded-full` → `rounded-sm` (except for circular elements like avatars)

3. **Update font family:**
   - Add `font-switzer` to all text elements
   - Remove `font-[Lufga]` or `font-[Inter]`

4. **Update shadows:**
   - `shadow-lg` → `shadow-fleming`
   - For elevated elements: `shadow-fleming-deep`

5. **Update transitions:**
   - Add `transition-all duration-300` for smooth animations
   - Buttons should have `hover:-translate-y-0.5` for lift effect

### Button Migration

**Old:**
```tsx
<button className="bg-navy-600 text-white px-4 py-2 rounded-lg hover:bg-navy-700">
  Click me
</button>
```

**New:**
```tsx
<button className="bg-fleming-pink text-white px-9 py-3 rounded-sm hover:bg-fleming-purple transition-all duration-300 shadow-fleming hover:shadow-fleming-deep hover:-translate-y-0.5 font-switzer font-medium">
  Click me
</button>
```

## Updated Files

1. ✅ `frontend/tailwind.config.js` - Color palette and design tokens
2. ✅ `frontend/src/index.css` - CSS variables, font imports, global styles
3. ✅ `frontend/src/components/Layout.tsx` - Sidebar, top bar, navigation
4. ✅ `frontend/src/pages/LoginV3.tsx` - Login page with new branding

## Next Steps

To complete the design update across all pages:

1. **Update all V3 page components** with new color scheme:
   - DashboardV3.tsx
   - PropertiesV3.tsx
   - LandlordsV3.tsx
   - TenantsV3.tsx
   - EnquiriesV3.tsx
   - BDMV3.tsx
   - MaintenanceV3.tsx
   - TasksV3.tsx
   - (and all detail pages)

2. **Create reusable UI components** in `frontend/src/components/ui/`:
   - Button.tsx (primary, secondary, outline variants)
   - Input.tsx (with Fleming styling)
   - Card.tsx (with Fleming styling)
   - Badge.tsx (status indicators)
   - Modal.tsx (dialogs and popups)

3. **Update form components:**
   - Replace all input styling with new design
   - Update select dropdowns
   - Update textarea elements

4. **Testing:**
   - Test all pages in light mode
   - Test all pages in dark mode
   - Verify responsive design on mobile
   - Check accessibility (contrast ratios, focus states)

## Design Philosophy

The Fleming Lettings brand emphasizes:
- **Professional simplicity** - Clean, minimal design
- **Bold accents** - Vibrant pink for calls-to-action
- **Sharp edges** - Minimal border radius for modern feel
- **Strong contrast** - Black text on light backgrounds
- **Generous spacing** - Comfortable padding and margins
- **Smooth transitions** - 300ms animations for interactive elements

## Reference

Official website: https://www.fleminglettings.co.uk
