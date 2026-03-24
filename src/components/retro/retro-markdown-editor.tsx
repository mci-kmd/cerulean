import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { draftly, ThemeEnum } from "draftly/editor";
import { essentialPlugins } from "draftly/plugins";

interface RetroMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const retroHeadingSpacingTheme = EditorView.theme({
  "&.cm-draftly .cm-content .cm-draftly-h1": {
    fontSize: "1.5rem",
  },
  "&.cm-draftly .cm-content .cm-draftly-h2": {
    fontSize: "1.25rem",
  },
  "&.cm-draftly .cm-content .cm-draftly-h3": {
    fontSize: "1rem",
  },
  "&.cm-draftly .cm-content .cm-draftly-h4": {
    fontSize: "0.75rem",
  },
  "&.cm-draftly .cm-content .cm-draftly-h5": {
    fontSize: "0.5rem",
  },
  "&.cm-draftly .cm-content .cm-draftly-h6": {
    fontSize: "0.25rem",
  },
  "&.cm-draftly .cm-content .cm-draftly-line-h1": {
    paddingTop: "0.125em",
    paddingBottom: "0.125em",
  },
  "&.cm-draftly .cm-content .cm-draftly-line-h2": {
    paddingTop: "0.125em",
    paddingBottom: "0.125em",
  },
  "&.cm-draftly .cm-content .cm-draftly-line-h3, &.cm-draftly .cm-content .cm-draftly-line-h4, &.cm-draftly .cm-content .cm-draftly-line-h5, &.cm-draftly .cm-content .cm-draftly-line-h6":
    {
      paddingTop: "0.125em",
      paddingBottom: "0.125em",
    },
});

const retroDraftExtensions = [
  draftly({
    theme: ThemeEnum.AUTO,
    plugins: essentialPlugins,
    lineWrapping: true,
    history: true,
    indentWithTab: true,
    baseStyles: true,
  }),
  retroHeadingSpacingTheme,
];

export function RetroMarkdownEditor({
  value,
  onChange,
  placeholder = "Retro draft will appear here.",
}: RetroMarkdownEditorProps) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={retroDraftExtensions}
      basicSetup={false}
      theme="none"
      placeholder={placeholder}
      minHeight="28rem"
      className={[
        "rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "[&_.cm-editor]:min-h-[28rem] [&_.cm-editor]:bg-transparent",
        "[&_.cm-editor.cm-focused]:outline-none",
        "[&_.cm-scroller]:font-sans [&_.cm-scroller]:leading-relaxed",
        "[&_.cm-content]:min-h-[28rem] [&_.cm-content]:p-3",
        "[&_.cm-activeLine]:bg-transparent [&_.cm-activeLineGutter]:bg-transparent",
      ].join(" ")}
      onCreateEditor={(view) => {
        view.contentDOM.setAttribute("role", "textbox");
        view.contentDOM.setAttribute("aria-label", "Draft markdown");
        view.contentDOM.setAttribute("aria-multiline", "true");
        view.contentDOM.setAttribute("spellcheck", "true");
      }}
    />
  );
}
