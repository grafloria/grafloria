import { DASHBOARD_KIT_CSS } from './styles';

/** The default chrome of 0.4.36: header bands on cards, pill tabs, one radius. */
describe('dashboard kit default styling', () => {
  const rule = (selector: string): string => {
    const i = DASHBOARD_KIT_CSS.indexOf(`\n${selector} {`);
    expect(i).toBeGreaterThanOrEqual(0);
    return DASHBOARD_KIT_CSS.slice(i, DASHBOARD_KIT_CSS.indexOf('}', i));
  };
  it('the widget header is a band: tinted ground, hairline, sentence case', () => {
    const h = rule('.axdb-widget-h');
    expect(h).toMatch(/background: var\(--axdb-head-bg/);
    expect(h).toMatch(/border-bottom: 1px solid var\(--axdb-line\)/);
    expect(h).not.toMatch(/uppercase/);
    expect(rule('.axdb-widget')).toMatch(/--axdb-head-bg:/);
  });
  it('tabs are pills on a track: the active one lifted, the rest quiet', () => {
    expect(rule('.axdb-tab')).toMatch(/border-radius: var\(--axdb-tab-radius, 6px\)/);
    expect(rule('.axdb-tab.axdb-tab--on')).toMatch(/font-weight: 600/);
    expect(rule('.axdb-tab.axdb-tab--on')).toMatch(/box-shadow: 0 1px 2px/);
  });
  it('one corner radius for cards, placeholders and handles — 8 px by default', () => {
    expect(DASHBOARD_KIT_CSS).not.toMatch(/--axdb-rs-radius, 3px\)/);
    expect((DASHBOARD_KIT_CSS.match(/--axdb-rs-radius, 8px\)/g) ?? []).length).toBeGreaterThan(5);
  });
  it('dark cards carry the band tokens too', () => {
    const dark = DASHBOARD_KIT_CSS.slice(DASHBOARD_KIT_CSS.lastIndexOf('@media (prefers-color-scheme: dark)'));
    expect(dark).toMatch(/--axdb-head-bg:/);
    expect(dark).toMatch(/--axdb-card: #161a22/);
  });
});

// The sheet's constant is part of the package surface: a host reads it to
// derive or override the chrome. 0.4.36 exported it from the styles module
// only — the raw-import check on the registry tarball found it undefined.
describe('the kit sheet on the package index', () => {
  it('DASHBOARD_KIT_CSS is exported from @grafloria/element', async () => {
    const pkg = (await import('../../index')) as { DASHBOARD_KIT_CSS?: unknown };
    expect(typeof pkg.DASHBOARD_KIT_CSS).toBe('string');
    expect(pkg.DASHBOARD_KIT_CSS as string).toContain('--axdb-head-bg');
  });
});
