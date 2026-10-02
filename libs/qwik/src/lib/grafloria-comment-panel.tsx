/**
 * `<GrafloriaCommentPanel>` — the conversation UI for a comment store, the
 * Qwik way:
 *
 * ```tsx
 * const store = useSignal(noSerialize(instance.getCommentStore()));
 * …
 * <GrafloriaCommentPanel store={store.value} onSelect$={$((id) => focus(id))} />
 * ```
 *
 * The store must be `noSerialize()`d — it is a live object with subscribers,
 * not serializable state.
 */
import {
  component$,
  noSerialize,
  useSignal,
  useVisibleTask$,
  type NoSerialize,
  type QRL,
} from '@builder.io/qwik';
import type { CommentStore } from '@grafloria/engine';
import { CommentPanelView, type CommentPanelOptions } from '@grafloria/renderer';
import { MOUNT_EAGERLY } from './visible-task-options';

export interface GrafloriaCommentPanelProps {
  /** The live comment store. Must be `noSerialize()`d. */
  store: NoSerialize<CommentStore>;
  options?: CommentPanelOptions;
  onSelect$?: QRL<(threadId: string | null) => void>;
  class?: string;
}

export const GrafloriaCommentPanel = component$<GrafloriaCommentPanelProps>((props) => {
  const containerRef = useSignal<HTMLElement>();
  const panelRef = useSignal<NoSerialize<CommentPanelView>>();

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const container = containerRef.value;
    const store = props.store;
    if (!container || !store) return;

    const panel = new CommentPanelView(container, store, {
      ...props.options,
      onSelect: (threadId) => {
        props.options?.onSelect?.(threadId);
        void props.onSelect$?.(threadId);
      },
    });
    panelRef.value = noSerialize(panel);

    const off = store.onChange(() => panel.update());

    cleanup(() => {
      off();
      panel.dispose();
      panelRef.value = undefined;
    });
  }, MOUNT_EAGERLY);

  return (
    <div
      ref={containerRef}
      class={['grafloria-comment-panel', props.class].filter(Boolean).join(' ')}
    />
  );
});
