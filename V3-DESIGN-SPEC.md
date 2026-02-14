# Fleming V3 Design Specification

## Theme: Dark Mode CRM
Based on Danyl's Figma designs (Live Data Trust reference system).

## Colors

### Base
- **Page background:** `#1a1a1a`
- **Card background:** `#232323` with subtle gradient overlay
- **Card border:** `rgba(255,255,255,0.08)` — very subtle
- **Elevated card:** `#2a2a2a`

### Text
- **Primary:** `#ffffff`
- **Secondary:** `rgba(255,255,255,0.6)`
- **Tertiary/muted:** `rgba(255,255,255,0.4)`
- **Labels:** `rgba(255,255,255,0.5)`

### Accent Gradients
- **Primary gradient (orange→pink):** `linear-gradient(135deg, #f97316, #ec4899)` — used on progress rings, map clusters, notification badges, key CTAs
- **Purple gradient:** `linear-gradient(135deg, #a855f7, #6366f1)` — secondary accent
- **Light purple/blue:** `linear-gradient(135deg, #c4b5fd, #93c5fd)` — tertiary

### Accent Solids
- **Hot pink:** `#ec4899`
- **Magenta:** `#f472b6`
- **Coral/Orange:** `#f97316`
- **Green (status active):** `#22c55e`
- **Deep navy:** `#1e1b4b`

### Buttons
- **Primary:** White bg (`#ffffff`), black text (`#000000`), rounded-full
- **Secondary/Ghost:** transparent, white border or no border, white text
- **Accent:** gradient bg (orange→pink)

## Typography
- **Font:** Lufga (already installed in `public/fonts/lufga/`)
- **Page titles:** 32-40px, font-bold
- **Section headers:** 20-24px, font-semibold
- **Card titles:** 16-18px, font-semibold
- **Body:** 14px, font-normal
- **Labels:** 12-13px, font-medium, muted color
- **Numbers/stats:** 28-40px, font-bold

## Layout

### Sidebar Navigation
- Width: ~200px expanded
- Background: same as page (`#1a1a1a`) or very slightly lighter
- Logo at top with hamburger toggle
- Nav items: icon + text label, 14px
- Active item: subtle filled pill background (`rgba(255,255,255,0.1)`), white text
- Inactive: muted text (`rgba(255,255,255,0.5)`)
- User avatar + name + email at bottom-left

### Top Bar (per page)
- Back arrow (circle bg) + breadcrumb: `Parent > Page Title`
- Page title: large, bold
- User avatar + name + email at top-right with chevron

### Cards
- `rounded-2xl` (16px radius)
- Background: `#232323` with subtle glass/gradient effect
- Border: 1px `rgba(255,255,255,0.08)`
- Some cards have gradient overlay from bottom (darker→transparent)
- Image cards: image at top, content below, rounded-xl for image
- Hover: subtle brightness increase

### Glass Effect on Cards
- Some cards show a subtle gradient shine from top-left
- `background: linear-gradient(145deg, rgba(255,255,255,0.05) 0%, transparent 50%)`

### Form Fields
- Background: `#2a2a2a` or `rgba(255,255,255,0.05)`
- Border: `rgba(255,255,255,0.1)`
- Rounded-xl (12px)
- Text: white
- Label: above field, muted color, 12-13px

### Tags/Pills
- Small: `px-3 py-1`, `rounded-full`, `bg-white/10`, `text-white/70`, `text-xs`
- Category filters: row of pills, active one has `bg-white/15` or filled

### Progress Rings
- Circular SVG rings with gradient stroke (orange→pink or purple)
- Label below, number inside or below
- Used for compliance percentages

### Status Indicators
- Small green dot for active/online
- Red badge with count for notifications

## Page Templates

### 1. Dashboard
- Greeting: "Hello, [Name] 👋" — large bold
- Data Summary section with map visualization
- Asset Manager with map + property pins
- Matchmaking/BDM horizontal card row
- Upload Data section
- My Projects/Properties carousel with category filter pills
- Resources section

### 2. Grid View (Properties, Landlords)
- Search bar at top (full width, rounded-xl, dark bg)
- Filter dropdowns or pills below search
- Card grid: 3-4 columns
- Each card: logo/image, star rating or stats, name, subtitle, tags
- Optional: map on right side (split view)

### 3. Detail Page (Property, Landlord)
- Hero image with overlay text
- Breadcrumb navigation
- Left column: hero + description
- Right column: overview stats with progress rings, checklist items
- Below: sections for Collaborators (avatar grid), Messenger (chat list), Tasks (with progress bars), Files (icon grid by type)

### 4. Form/Edit Page (Landlord Edit, Settings)
- Left: avatar/logo + description
- Right: stacked form fields
- Sub-navigation tabs on left (Personal Info, Company, Contracts, Data Interests)
- "Update" button: white, rounded-full, prominent

### 5. Messenger/Chat
- Left panel: header with new requests (horizontal cards), search, conversation list (avatar + name + time)
- Right panel: chat header (avatar + name), message bubbles (left-aligned for others, right for self), reactions, link previews, system messages (approval banner), input bar with attachments

### 6. Map View
- Full-width dark map (Mapbox dark style)
- Property pins with icon + label
- Cluster bubbles with gradient (orange→pink) showing count
- Right panel: stepped workflow, search + filter, property list cards

## Fleming Nav Items
1. Dashboard
2. Enquiries
3. Properties
4. Landlords
5. Tenants
6. BDM
7. Maintenance
8. Tasks
9. Financials
10. Settings

## V3 Route Structure
All V3 at `/v3/*`:
- `/v3` — Dashboard
- `/v3/enquiries` — Messenger/chat layout
- `/v3/properties` — Grid + map toggle
- `/v3/properties/:id` — Property detail
- `/v3/landlords` — Grid view
- `/v3/landlords/:id` — Landlord detail
- `/v3/tenants` — List/grid view
- `/v3/tenants/:id` — Tenant detail/edit
- `/v3/bdm` — Pipeline grid
- `/v3/maintenance` — Task list
- `/v3/tasks` — Task list with progress
- `/v3/financials` — Financial overview
- `/v3/settings` — User settings/profile
