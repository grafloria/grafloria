export interface CodeEditor {
  /** true when Monaco mounted; false when the plain textarea is the editor. */
  monaco: boolean;
  getValue(): string;
  setValue(value: string): void;
  layout(): void;
}

export interface CodeEditorOptions {
  /** 'mermaid' (default) or any Monaco language id: 'sql', 'xml', 'javascript', … */
  language?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** An empty element to mount into (style it display:none; the editor shows it).
   *  Required on a Qwik page: Qwik removes DOM it did not render from a parent it
   *  re-renders, but leaves a childless element's inside alone. */
  host?: HTMLElement | null;
}

/** Mount a coloured editor over a textarea the page (or framework) keeps binding. */
export function mountCodeEditor(textarea: HTMLTextAreaElement | null | undefined, options?: CodeEditorOptions): Promise<CodeEditor>;

/** Colour read-only text (a <pre> or <code>) in place; call again after its text changes. */
export function highlightBlock(el: HTMLElement | null | undefined, language?: string): Promise<boolean>;
