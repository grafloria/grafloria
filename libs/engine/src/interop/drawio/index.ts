// .drawio (mxGraph XML) import — the migration on-ramp from draw.io files.
// IMPORT ONLY; every dropped construct surfaces as a named warning.
export { importDrawio, stripHtmlToText, type DrawioImportResult, type DrawioPage } from './importDrawio';
// The XML reader (xml.ts) is internal machinery, deliberately NOT re-exported:
// its contract is "exactly the mxGraph subset", which is not a promise the
// public API should make about general XML.
