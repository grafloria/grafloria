/**
 * `<GrafloriaDiagram>` — the generic kit host, the Vue way:
 *
 * ```vue
 * <GrafloriaDiagram :spec="erDiagram({ entities, relationships })" @ready="…" />
 * ```
 *
 * A CHANGED spec (or options) replaces the diagram and fires `ready` again; an
 * equal one built again on a re-render does not.
 */
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import { render as renderSpec, type RenderSpec, type RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { specKey } from './spec-key';

export const GrafloriaDiagram = defineComponent({
  name: 'GrafloriaDiagram',
  props: {
    /** Any kit spec — erDiagram(...), umlDiagram(...), dashboard(...), or DSL text. */
    spec: { type: [Object, String] as PropType<RenderSpec>, required: true },
    options: { type: Object as PropType<RenderOptions>, default: () => ({}) },
  },
  emits: ['ready'],
  setup(props, { emit, expose }) {
    const container = ref<HTMLElement | null>(null);
    let instance: DiagramInstance | null = null;
    let mountedKey = '';

    const mount = () => {
      if (!container.value) return;
      instance?.dispose();
      mountedKey = specKey(props.spec, props.options);
      instance = renderSpec(props.spec, container.value, props.options) as DiagramInstance;
      emit('ready', instance);
    };

    onMounted(mount);
    // A new spec/options object remounts only when its VALUE changed.
    watch(
      () => [props.spec, props.options],
      () => {
        if (instance && specKey(props.spec, props.options) !== mountedKey) mount();
      }
    );

    onBeforeUnmount(() => {
      instance?.dispose();
      instance = null;
    });

    expose({ getInstance: () => instance });

    return () => h('div', { ref: container, class: 'grafloria-diagram', style: 'width:100%;height:100%;position:relative' });
  },
});
