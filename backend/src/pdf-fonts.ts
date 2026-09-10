import fs from 'fs';

// Arial is used where installed; Liberation Sans is its metrically compatible
// open-source replacement on the Linux release image.
export function pdfFontPath(bold = false): string {
  const paths = bold ? [process.env.PDF_ARIAL_BOLD, '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']
    : [process.env.PDF_ARIAL_REGULAR, '/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'];
  const found=paths.find(file=>file && fs.existsSync(file));
  if(!found)throw new Error('The application PDF font is unavailable');
  return found;
}
