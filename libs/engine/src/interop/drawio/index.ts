// .drawio (mxGraph XML) import — the migration on-ramp from draw.io files.
// v1 is IMPORT ONLY; every dropped construct surfaces as a named warning.
export { importDrawio, stripHtmlToText, type DrawioImportResult } from './importDrawio';
// The XML reader (xml.ts) is internal machinery, deliberately NOT re-exported:
// its contract is "exactly the mxGraph subset", which is not a promise the
// public API should make about general XML.
