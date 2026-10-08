// Generated cover art and attachment thumbnails for the Kanban studio — small
// SVG illustrations as data URIs, original and dependency-free. A cover is a
// mood, not a picture of anything real: a UI mock, a chart, an icon sheet.

const uri = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** A browser window with a settings panel sketched in it. */
function uiMock(a = '#6e5dc6', b = '#e774bb') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="320" height="160" fill="url(#g)"/>
<rect x="44" y="26" width="232" height="150" rx="10" fill="#fff" opacity=".96"/>
<circle cx="60" cy="40" r="4" fill="#f87168"/><circle cx="72" cy="40" r="4" fill="#f5cd47"/><circle cx="84" cy="40" r="4" fill="#4bce97"/>
<rect x="56" y="58" width="56" height="96" rx="6" fill="#f1f2f4"/>
<rect x="64" y="68" width="40" height="6" rx="3" fill="${a}" opacity=".8"/><rect x="64" y="82" width="32" height="6" rx="3" fill="#c7ccd6"/><rect x="64" y="96" width="36" height="6" rx="3" fill="#c7ccd6"/>
<rect x="124" y="60" width="90" height="8" rx="4" fill="#44546f"/>
<rect x="124" y="78" width="136" height="22" rx="5" fill="#f1f2f4"/><rect x="236" y="83" width="18" height="12" rx="6" fill="${a}"/>
<rect x="124" y="108" width="136" height="22" rx="5" fill="#f1f2f4"/><rect x="236" y="113" width="18" height="12" rx="6" fill="#c7ccd6"/>
</svg>`;
}

/** A bar chart climbing to the right. */
function chart(a = '#0c66e4', b = '#36b7b4') {
  const bars = [38, 52, 46, 70, 64, 88, 102].map((h, i) => `<rect x="${52 + i * 32}" y="${138 - h}" width="20" height="${h}" rx="4" fill="#fff" opacity="${0.55 + i * 0.06}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="320" height="160" fill="url(#g)"/>
<path d="M40 138H290" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>${bars}
<path d="M62 104 L94 92 L126 98 L158 72 L190 78 L222 52 L254 38" fill="none" stroke="#f5cd47" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/** A sheet of rounded app icons. */
function icons(a = '#1f845a', b = '#4bce97') {
  const colors = ['#fff', '#f5cd47', '#fea362', '#9f8fef', '#579dff', '#f87168'];
  let cells = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const col = colors[(r * 2 + c) % colors.length];
    cells += `<rect x="${34 + c * 44}" y="${22 + r * 44}" width="32" height="32" rx="9" fill="${col}" opacity="${col === '#fff' ? 0.9 : 0.95}"/>`;
    cells += `<circle cx="${50 + c * 44}" cy="${38 + r * 44}" r="7" fill="none" stroke="#172b4d" stroke-opacity=".35" stroke-width="2.5"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="320" height="160" fill="url(#g)"/>${cells}</svg>`;
}

/** A page of a document, for attachment thumbnails. */
function doc(color = '#579dff') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 80"><rect width="112" height="80" fill="${color}" opacity=".18"/>
<rect x="34" y="10" width="44" height="60" rx="3" fill="#fff"/><rect x="40" y="18" width="24" height="4" rx="2" fill="${color}"/>
<rect x="40" y="28" width="32" height="3" rx="1.5" fill="#c7ccd6"/><rect x="40" y="35" width="28" height="3" rx="1.5" fill="#c7ccd6"/><rect x="40" y="42" width="32" height="3" rx="1.5" fill="#c7ccd6"/></svg>`;
}

export const COVER_ART = {
  'ui-mock': uri(uiMock()),
  chart: uri(chart()),
  icons: uri(icons()),
};

/** A CSS background for a cover: a named illustration, else the colour or gradient itself. */
export const coverBackground = (cover) => (cover?.art ? `${COVER_ART[cover.art]} center / cover` : cover?.color ?? 'transparent');

/** Thumbnail for an attachment, by kind. */
export const attachmentThumb = (kind) =>
  kind === 'image' ? `${COVER_ART.chart} center / cover` : kind === 'design' ? `${COVER_ART['ui-mock']} center / cover` : `${uri(doc(kind === 'sheet' ? '#1f845a' : '#579dff'))} center / cover`;

/** The colours the cover picker offers (Trello's palette family, our own values). */
export const COVER_COLORS = ['#4bce97', '#f5cd47', '#fea362', '#f87168', '#9f8fef', '#579dff', '#6cc3e0', '#94c748', '#e774bb', '#8590a2'];
