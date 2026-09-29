/** Open a PDF inside a branded HTML tab; raw PDF tabs use the browser's own icon. */
export function showDocumentTab(tab: Window, url: string, title: string) {
  tab.opener = null;
  const doc = tab.document;
  doc.title = title;
  const icon = doc.createElement('link'); icon.rel = 'icon'; icon.href = new URL('/logo-icon.png', window.location.origin).href;
  doc.head.append(icon);
  doc.body.style.cssText = 'margin:0;height:100vh;display:flex;flex-direction:column;font:14px Arial,sans-serif;background:#eee';
  const header = doc.createElement('header'); header.style.cssText = 'padding:12px 18px;background:white;display:flex;align-items:center;gap:12px';
  const logo = doc.createElement('img'); logo.src = icon.href; logo.alt = 'Fleming Lettings'; logo.width = 24; logo.height = 24;
  const heading = doc.createElement('strong'); heading.textContent = title; heading.style.flex = '1';
  const download = doc.createElement('a'); download.href = url; download.download = title.endsWith('.pdf') ? title : title + '.pdf'; download.textContent = 'Download PDF';
  const close = doc.createElement('button'); close.textContent = 'Close'; close.onclick = () => tab.close();
  header.append(logo, heading, download, close);
  const iframe = doc.createElement('iframe'); iframe.src = url; iframe.title = title; iframe.style.cssText = 'width:100%;flex:1;border:0';
  doc.body.replaceChildren(header, iframe);
}
