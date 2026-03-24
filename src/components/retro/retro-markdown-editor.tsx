import CodeMirror from "@uiw/react-codemirror";
import { draftly, ThemeEnum } from "draftly/editor";
import { essentialPlugins } from "draftly/plugins";

interface RetroMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const retroDraftExtensions = [
  draftly({
    theme: ThemeEnum.AUTO,
    plugins: essentialPlugins,
    lineWrapping: true,
    history: true,
    indentWithTab: true,
    baseStyles: true,
  }),
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
      }}
    />
  );
}
