// Vector PDF export.
//
// The barrel is EXPLICIT, not `export *`. The PDF internals (`num`, the path emitters, the
// WinAnsi codec) share names with the canvas geometry module and the theme colour parser —
// re-exporting them wholesale collides in the top-level `@grafloria/renderer` barrel and breaks
// every downstream build. Only the public surface leaves this directory.
export { exportPdf } from './pdf-export';
export type { PdfExportOptions, PdfExportResult, PdfMetadata } from './pdf-export';
export { PAGE_SIZES, pageDimensions } from './pdf-primitives';
export type { PageSize, Orientation, BaseFont, PdfRgb } from './pdf-primitives';
