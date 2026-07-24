/**
 * `<GrafloriaDiagram>` — the generic kit host, the Vue way:
 *
 * ```vue
 * <GrafloriaDiagram :spec="erDiagram({ entities, relationships })" @ready="…" />
 * ```
 */
import { defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType } from 'vue';
import { render as renderSpec, type RenderSpec, type RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';

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

    onMounted(() => {
      if (!container.value) return;
      instance = renderSpec(props.spec, container.value, props.options) as DiagramInstance;
      emit('ready', instance);
    });

    onBeforeUnmount(() => {
      instance?.dispose();
      instance = null;
    });

    expose({ getInstance: () => instance });

    return () => h('div', { ref: container, class: 'grafloria-diagram', style: 'width:100%;height:100%;position:relative' });
  },
});
