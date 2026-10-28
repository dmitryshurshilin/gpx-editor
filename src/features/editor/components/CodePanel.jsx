import { useRef } from "react";
import { useEditor, useEditorSnapshot } from "../model/EditorContext.jsx";

export function CodePanel() {
  const editor = useEditor(),
    state = useEditorSnapshot();
  const textarea = useRef(null);
  async function copy() {
    if (!(await editor.copy())) {
      textarea.current.focus();
      textarea.current.select();
    }
  }
  return (
    <section className="code-panel">
      <div className="code-heading">
        <div>
          <span className="code-icon">〈/〉</span>
          <strong>GPX-код</strong>
          <span className="badge" id="code-state">
            {!state.loaded
              ? "Нет файла"
              : state.changed
                ? "Скорректирован"
                : "Исходный файл"}
          </span>
        </div>
        <div className="code-actions">
          <button
            id="copy"
            className="code-action"
            disabled={!state.pointCount}
            onClick={copy}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="8" y="8" width="12" height="13" rx="2" />
              <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
            </svg>
            <span>Скопировать код</span>
          </button>
          <button
            id="download-code"
            className="code-action"
            disabled={!state.pointCount}
            onClick={() => editor.download()}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
            </svg>
            <span>Скачать GPX-трек</span>
          </button>
        </div>
      </div>
      <textarea
        id="xml"
        ref={textarea}
        value={state.xml}
        readOnly
        spellCheck="false"
        aria-label="GPX-код трека"
        placeholder="Здесь появится GPX-код загруженного трека…"
      ></textarea>
      <div className="code-footer">
        <span>Координаты, время и метаданные сохраняются при коррекции</span>
        <span>UTF-8 · GPX</span>
      </div>
    </section>
  );
}
