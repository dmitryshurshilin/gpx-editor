import { useEditor, useEditorSnapshot } from "../model/EditorContext.jsx";

export function EditingPanel() {
  const editor = useEditor(),
    state = useEditorSnapshot();

  return (
    <section className="panel">
      <div className="step">
        02 <span>Очистите маршрут</span>
      </div>
      <p className="instruction">
        Нажмите на линию, чтобы добавить точку. Перетащите точку, чтобы изменить
        маршрут. Дважды нажмите на точку для удаления или включите выделение.
      </p>
      <button
        id="autocorrect"
        onClick={() => editor.autocorrect()}
        className="autocorrect"
        disabled={!state.canAutocorrect}
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
      <div className="mode-switch">
        <button
          id="pan"
          className={state.mode === "pan" ? "active" : ""}
          aria-pressed={state.mode === "pan"}
          onClick={() => editor.setMode("pan")}
        >
          ✥ Редактирование
        </button>
        <button
          id="select"
          className={state.mode === "select" ? "active" : ""}
          aria-pressed={state.mode === "select"}
          onClick={() => editor.setMode("select")}
        >
          ▧ Выделение
        </button>
      </div>
      <div className="selection-info">
        <span>Выбрано точек</span>
        <strong id="selected">{state.selectedCount}</strong>
      </div>
      <div className="actions">
        <button
          id="reset"
          onClick={() => editor.clearSelection()}
          disabled={!state.selectedCount}
        >
          Сбросить
        </button>
        <button
          id="remove"
          className="danger"
          onClick={() => editor.remove()}
          disabled={!state.selectedCount}
        >
          Удалить точки
        </button>
      </div>
      <div className="tip">
        <span>↳</span>
        <p>
          Соседние точки соединятся автоматически — маршрут останется
          непрерывным.
        </p>
      </div>
    </section>
  );
}
