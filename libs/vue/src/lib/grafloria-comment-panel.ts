/**
 * `<GrafloriaCommentPanel>` — the conversation UI for a comment store, the
 * Vue way:
 *
 * ```vue
 * <GrafloriaCommentPanel :store="store" @select="focus" />
 * ```
 */
import { defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType } from 'vue';
import type { CommentStore } from '@grafloria/engine';
import { CommentPanelView, type CommentPanelOptions } from '@grafloria/renderer';

export const GrafloriaCommentPanel = defineComponent({
  name: 'GrafloriaCommentPanel',
  props: {
    store: { type: Object as PropType<CommentStore>, required: true },
    options: { type: Object as PropType<CommentPanelOptions>, default: () => ({}) },
  },
  emits: ['select'],
  setup(props, { emit, expose }) {
    const container = ref<HTMLElement | null>(null);
    let panel: CommentPanelView | null = null;
    let off: (() => void) | null = null;

    onMounted(() => {
      if (!container.value) return;
      panel = new CommentPanelView(container.value, props.store, {
        ...props.options,
        onSelect: (threadId) => {
          props.options.onSelect?.(threadId);
          emit('select', threadId);
        },
      });
      off = props.store.onChange(() => panel?.update());
    });

    onBeforeUnmount(() => {
      off?.();
      off = null;
      panel?.dispose();
      panel = null;
    });

    expose({ select: (threadId: string | null) => panel?.select(threadId, { focus: true }) });

    return () => h('div', { ref: container, class: 'grafloria-comment-panel' });
  },
});
