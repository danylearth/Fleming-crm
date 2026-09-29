import {showDocumentTab as original} from '../frontend/src/utils/documentViewer.ts';
export function showDocumentTab(tab,url,title){return original(tab,window.testSignedPdfUrl||'/assets/inventory-signing-test.pdf',title);}
