import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { codeMirrorProps, draftlyMock, editorViewThemeMock } = vi.hoisted(() => ({
  codeMirrorProps: [] as Array<Record<string, unknown>>,
  draftlyMock: vi.fn((config) => ({ extension: "draftly", config })),
  editorViewThemeMock: vi.fn((config) => ({ extension: "theme", config })),
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: (props: Record<string, unknown>) => {
    codeMirrorProps.push(props);
    return <div data-testid="retro-markdown-editor" />;
  },
}));

vi.mock("draftly/editor", () => ({
  draftly: draftlyMock,
  ThemeEnum: {
    AUTO: "auto",
  },
}));

vi.mock("draftly/plugins", () => ({
  essentialPlugins: ["essential-plugin"],
}));

vi.mock("@codemirror/view", () => ({
  EditorView: {
    theme: editorViewThemeMock,
  },
}));

describe("RetroMarkdownEditor", () => {
  it("configures Draftly for Typora-style markdown editing", async () => {
    codeMirrorProps.length = 0;
    draftlyMock.mockClear();
    const handleChange = vi.fn();
    const { RetroMarkdownEditor } = await import("./retro-markdown-editor");

    render(<RetroMarkdownEditor value="# Retro" onChange={handleChange} />);

    expect(draftlyMock).toHaveBeenCalledWith({
      theme: "auto",
      plugins: ["essential-plugin"],
      lineWrapping: true,
      history: true,
      indentWithTab: true,
      baseStyles: true,
    });

    expect(codeMirrorProps).toHaveLength(1);
    expect(codeMirrorProps[0]).toMatchObject({
      value: "# Retro",
      basicSetup: false,
      theme: "none",
      minHeight: "28rem",
      placeholder: "Retro draft will appear here.",
    });
    const themeConfig = editorViewThemeMock.mock.calls[0]?.[0];
    expect(themeConfig).toMatchObject({
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
    expect(codeMirrorProps[0].extensions).toEqual([
      { extension: "draftly", config: expect.any(Object) },
      { extension: "theme", config: expect.any(Object) },
    ]);

    const fakeView = {
      contentDOM: {
        setAttribute: vi.fn(),
      },
    };

    const onCreateEditor = codeMirrorProps[0].onCreateEditor as (view: typeof fakeView) => void;
    onCreateEditor(fakeView);

    expect(fakeView.contentDOM.setAttribute).toHaveBeenNthCalledWith(1, "role", "textbox");
    expect(fakeView.contentDOM.setAttribute).toHaveBeenNthCalledWith(2, "aria-label", "Draft markdown");
    expect(fakeView.contentDOM.setAttribute).toHaveBeenNthCalledWith(3, "aria-multiline", "true");

    const onChange = codeMirrorProps[0].onChange as (value: string) => void;
    onChange("## Updated");
    expect(handleChange).toHaveBeenCalledWith("## Updated");
  });
});
