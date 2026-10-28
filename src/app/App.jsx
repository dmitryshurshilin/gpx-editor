import { useState } from "react";
import { EditorContext } from "../features/editor/model/EditorContext.jsx";
import { EditorStore } from "../features/editor/model/EditorStore.js";
import { UploadPanel } from "../features/editor/components/UploadPanel.jsx";
import { EditingPanel } from "../features/editor/components/EditingPanel.jsx";
import { CodePanel } from "../features/editor/components/CodePanel.jsx";
import { MapPanel } from "../features/map/components/MapPanel.jsx";
import {
  useEditor,
  useEditorSnapshot,
} from "../features/editor/model/EditorContext.jsx";
import { Header } from "./Header.jsx";
import { HelpDialog } from "./HelpDialog.jsx";
export function App() {
  const [editor] = useState(() => new EditorStore());
  return (
    <EditorContext.Provider value={editor}>
      <EditorApp />
    </EditorContext.Provider>
  );
}
function EditorApp() {
  const editor = useEditor(),
    state = useEditorSnapshot(),
    [helpOpen, setHelpOpen] = useState(false);
  return (
    <>
      <Header
        onHelp={() => {
          editor.prepare();
          setHelpOpen(true);
        }}
      />
      <main>
        <div className="heading">
          <div>
            <h1>Скорректируйте трек</h1>
          </div>
          <button
            id="download"
            className="primary"
            disabled={!state.pointCount}
            onClick={() => editor.download()}
          >
            ↓ Скачать GPX
          </button>
        </div>
        <div className="workspace">
          <aside>
            <UploadPanel />
            <EditingPanel />
            <section className="help">
              <span className="help-icon">◎</span>
              <div>
                <p>
                  Файл обрабатывается на устройстве и не загружается на сервер.
                </p>
              </div>
            </section>
          </aside>
          <MapPanel />
        </div>
        <CodePanel />
        <div
          id="message"
          className={state.status.error ? "error" : ""}
          role="status"
          aria-live="polite"
        >
          {state.status.text}
        </div>
        <footer>
          <span>GPX Editor</span>
        </footer>
      </main>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
