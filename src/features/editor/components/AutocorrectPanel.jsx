import { useEditor, useEditorSnapshot } from "../model/EditorContext.jsx";

export function AutocorrectPanel() {
  const editor = useEditor(),
    state = useEditorSnapshot(),
    preview = state.autocorrectPreview;
  return (
    <div className="autocorrect-panel">
      <button
        id="autocorrect"
        className="autocorrect"
        disabled={!state.canAutocorrect}
        onClick={() => editor.autocorrect()}
      >
        ✦ Автокоррекция · 500 м
      </button>
      <p className="auto-warning">
        <span aria-hidden="true">⚠</span> Автокоррекция не всегда работает
        точно. Проверьте результат на карте.
      </p>
      <p className="auto-help">
        Находит вылет между двумя скачками больше 500 м. Возврат подтверждается
        следующим интервалом меньше 500 м.
      </p>
      {preview && (
        <section
          className="autocorrect-preview"
          aria-labelledby="autocorrect-preview-title"
        >
          <strong id="autocorrect-preview-title">
            Предпросмотр автокоррекции
          </strong>
          <p role="status">
            Найдено точек:{" "}
            <b id="autocorrect-preview-count">{preview.pointCount}</b> ·
            Фрагментов: {preview.fragmentCount}
          </p>
          <p>
            Оранжевым отмечены вылеты, зелёным пунктиром — будущие соединения.
            GPX ещё не изменён.
          </p>
          <div className="preview-actions">
            <button
              id="autocorrect-apply"
              className="danger"
              disabled={state.fullscreen}
              onClick={() => editor.applyAutocorrect()}
            >
              Удалить найденные точки
            </button>
            <button
              id="autocorrect-cancel"
              onClick={() => editor.cancelAutocorrectPreview()}
            >
              Отменить
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
