// Reuse the same rendered pages in the pop-out so no document is fetched twice.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-document-popout]').forEach(button => {
    const viewer = document.getElementById(button.dataset.documentPopout);
    if (!viewer) return;
    const marker = document.createComment('Document position');
    viewer.before(marker);
    const dialog = document.createElement('dialog');
    dialog.className = 'document-popout';
    dialog.setAttribute('aria-label', 'Agreement Preview');
    const header = document.createElement('div');
    header.className = 'document-popout-header';
    const title = document.createElement('strong');
    title.textContent = 'Agreement Preview';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'open-link';
    close.textContent = 'Close ✕';
    const links = document.createElement('div');
    links.className = 'document-links';
    const download = document.createElement('a');
    download.className = 'open-link';
    download.textContent = 'Open PDF ↗';
    download.target = '_blank';
    download.rel = 'noopener noreferrer';
    links.append(download, close);
    header.append(title, links);
    dialog.append(header);
    document.body.append(dialog);
    let originalScroll = 0;
    button.addEventListener('click', () => {
      const source = document.getElementById(button.dataset.documentDownload);
      const href = source?.getAttribute('href');
      download.hidden = !href;
      if (href) download.href = href;
      originalScroll = viewer.scrollTop;
      dialog.append(viewer);
      dialog.showModal();
      viewer.scrollTop = originalScroll;
      close.focus();
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      const currentScroll = viewer.scrollTop;
      marker.after(viewer);
      viewer.scrollTop = currentScroll;
      button.focus();
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    });
  });
});
