import fs from 'fs';

// Prefer Arial in the release image and on macOS. Liberation Sans is a
// metrically compatible fallback for other development environments.
export function pdfFontPath(bold = false): string {
  const paths = bold ? [process.env.PDF_ARIAL_BOLD, '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']
    : [process.env.PDF_ARIAL_REGULAR, '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'];
  const found=paths.find(file=>file && fs.existsSync(file));
  if(!found)throw new Error('The application PDF font is unavailable');
  return found;
}
