import { useState } from "react";
import { useEditor, useEditorSnapshot } from "../model/EditorContext.jsx";

export function UploadPanel() {
  const editor = useEditor(),
    state = useEditorSnapshot();
  const [over, setOver] = useState(false);
  return (
    <section className="panel">
      <div className="step">
        01 <span>Загрузите трек</span>
      </div>
      <label
        className={over ? "dropzone over" : "dropzone"}
        id="drop"
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          editor.loadFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          id="file"
          onChange={(event) => {
            editor.loadFile(event.target.files[0]);
            event.target.value = "";
          }}
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
        />
        <span className="upload-icon">↥</span>
        <strong>Перетащите GPX сюда</strong>
        <span>
          или <u>выберите файл</u>
        </span>
        <small>.gpx · до 20 МБ</small>
      </label>
      <button
        className="text-button"
        id="demo"
        onClick={() => editor.loadDemo()}
      >
        Попробовать на примере ↗
      </button>
      <div id="file-info" hidden={!state.loaded}>
        <span className="file-symbol">GPX</span>
        <div>
          <strong id="filename">{state.filename}</strong>
          <small id="filesize">
            {(state.fileSize / 1024).toFixed(1)} КБ · GPX
          </small>
        </div>
        <span className="check">✓</span>
      </div>
    </section>
  );
}
