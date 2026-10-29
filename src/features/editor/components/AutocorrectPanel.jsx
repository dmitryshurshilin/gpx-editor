import { useEditor, useEditorSnapshot } from "../model/EditorContext.jsx";

export function AutocorrectPanel() {
  const editor = useEditor(),
    state = useEditorSnapshot(),
    preview = state.autocorrectPreview;
  return (
    <div className="autocorrect-panel">
      <div className="autocorrect-threshold">
        <label htmlFor="autocorrect-threshold">Порог автокоррекции, м</label>
        <input
          id="autocorrect-threshold"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={state.autocorrectThresholdInput}
          onChange={(event) =>
            editor.setAutocorrectThreshold(event.target.value)
          }
          aria-invalid={!state.autocorrectThresholdValid}
          aria-describedby={
            state.autocorrectThresholdValid
              ? "autocorrect-threshold-hint"
              : "autocorrect-threshold-error"
          }
        />
        <small id="autocorrect-threshold-hint">По умолчанию — 500 м.</small>
        {!state.autocorrectThresholdValid && (
          <p id="autocorrect-threshold-error" role="alert">
            Укажите целое число метров больше нуля.
          </p>
        )}
      </div>
      <button
        id="autocorrect"
        className="autocorrect"
        disabled={!state.canAutocorrect}
        onClick={() => editor.autocorrect()}
      >
        ✦ Автокоррекция · {state.autocorrectThreshold ?? "—"} м
      </button>
      <p className="auto-warning">
        <span aria-hidden="true">⚠</span> Автокоррекция не всегда работает
        точно. Проверьте результат на карте.
      </p>
      <p className="auto-help">
        Находит вылет между двумя скачками больше заданного порога. Возврат
        подтверждается следующим интервалом меньше этого порога.
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
          <p>Порог: {preview.threshold} м.</p>
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
