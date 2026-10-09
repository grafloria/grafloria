/**
 * `connectionReasons: true` — while a connection is dragged over a port that
 * refuses it, say WHY beside that port.
 *
 * The reason is the drag state's `rejectionMessage`: the string a host
 * validator returned (`registerConnectionValidator(() => 'A model goes into a
 * Model slot')`), or the built-in rule's own words ("This port has reached its
 * connection limit."). The label is a plain element in the HTML layer, kept at
 * its CSS size whatever the zoom, styled by the class `grafloria-connect-reason`
 * and the variables `--grafloria-connect-reason-bg` / `-fg`.
 */
import type { NodeModel, PortModel } from '@grafloria/engine';
import { portWorldPosition } from '../../svg/port-positioning';
import type { Feature, FeatureContext } from './feature';

interface UpdatePayload {
  targetPort?: PortModel | null;
  isValid?: boolean;
  rejectionMessage?: string;
}

export function installConnectReason(ctx: FeatureContext): Feature {
  let label: HTMLElement | null = null;
  let port: PortModel | null = null;
  let message = '';

  const hide = (): void => {
    port = null;
    message = '';
    label?.remove();
    label = null;
  };

  const place = (): void => {
    if (!port || !message) return hide();
    const node: NodeModel | undefined = ctx.getModel().getNodeByPortId(port.id);
    if (!node) return hide();
    if (!label) {
      label = ctx.doc.createElement('div');
      label.className = 'grafloria-connect-reason';
      label.setAttribute('role', 'status');
      label.setAttribute('aria-live', 'polite');
      ctx.htmlLayer.appendChild(label);
    }
    if (label.textContent !== message) label.textContent = message;
    const at = portWorldPosition(port, node);
    const zoom = ctx.viewport.getZoom() || 1;
    // Anchored at its bottom-left, 10 screen px up and right of the port, and
    // counter-scaled so it reads at its CSS size at any zoom. Near the canvas's
    // right edge it flips to the port's LEFT instead of running off the canvas.
    const style = (flip: boolean) =>
      `position:absolute;left:${at.x}px;top:${at.y}px;` +
      (flip
        ? `transform:translate(calc(-100% - ${10 / zoom}px), calc(-100% - ${10 / zoom}px)) scale(${1 / zoom});transform-origin:100% 100%;`
        : `transform:translate(${10 / zoom}px, calc(-100% - ${10 / zoom}px)) scale(${1 / zoom});transform-origin:0 100%;`) +
      'pointer-events:none;white-space:nowrap;z-index:6;' +
        'background:var(--grafloria-connect-reason-bg, #b42318);color:var(--grafloria-connect-reason-fg, #fff);' +
        'font:500 12px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;padding:4px 8px;border-radius:6px;' +
        'box-shadow:0 2px 8px rgba(16, 24, 40, .2)';
    label.setAttribute('style', style(false));
    const box = label.getBoundingClientRect();
    const edge = ctx.container.getBoundingClientRect();
    if (box.width > 0 && box.right > edge.right - 4) label.setAttribute('style', style(true));
  };

  const onUpdate = (p: UpdatePayload): void => {
    const refused = !!p.targetPort && p.isValid === false && !!p.rejectionMessage;
    if (!refused) return hide();
    port = p.targetPort ?? null;
    message = p.rejectionMessage ?? '';
    place();
  };

  ctx.engine.on('connection:update', onUpdate);
  ctx.engine.on('connection:complete', hide);
  ctx.engine.on('connection:cancel', hide);

  return {
    sync: () => (port ? place() : undefined),
    camera: () => (port ? place() : undefined),
    dispose: () => {
      ctx.engine.off('connection:update', onUpdate);
      ctx.engine.off('connection:complete', hide);
      ctx.engine.off('connection:cancel', hide);
      hide();
    },
  };
}
