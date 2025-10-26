/**
 * Mock LemonadeJS for testing
 * In real applications, LemonadeJS runs in the browser
 */

export const element = (template: string, self: any, components?: any): HTMLElement => {
  // Create a simple DOM element for testing
  const div = document.createElement('div');

  // Apply basic template rendering (replace {{...}} with values)
  let html = template;
  const matches = template.matchAll(/\{\{([^}]+)\}\}/g);

  for (const match of matches) {
    const path = match[1].trim();
    const value = getValueByPath(self, path);
    html = html.replace(match[0], String(value ?? ''));
  }

  div.innerHTML = html;

  // Return the first child if it exists, otherwise the div
  return (div.firstElementChild as HTMLElement) || div;
};

export const apply = () => {};
export const render = () => {};
export const path = () => {};
export const track = () => {};
export const setPath = () => [];
export const onload = () => {};
export const onchange = () => {};
export const setComponents = () => {};
export const get = () => {};
export const set = () => {};
export const dispatch = () => {};
export const createWebComponent = () => {};

export const events = {
  create: () => new Event('test'),
  dispatch: () => {},
};

// Helper function to get nested values
function getValueByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

export default {
  element,
  apply,
  render,
  path,
  track,
  setPath,
  onload,
  onchange,
  setComponents,
  get,
  set,
  dispatch,
  createWebComponent,
  events,
};
