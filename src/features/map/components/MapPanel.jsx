import { useLayoutEffect, useRef } from "react";
import {
  useEditor,
  useEditorSnapshot,
} from "../../editor/model/EditorContext.jsx";
import { useEditorMap } from "../hooks/useEditorMap.js";
import { formatCount, formatDistance } from "../../../shared/lib/format.js";
export function MapPanel() {
  const editor = useEditor(),
    state = useEditorSnapshot(),
    container = useRef(null),
    wrap = useRef(null),
    wasFullscreen = useRef(false),
    fullscreenButton = useRef(null);
  useEditorMap(container, editor);
  useLayoutEffect(() => {
    document.body.classList.toggle("map-fullscreen", state.fullscreen);
    if (state.fullscreen) wrap.current.focus({ preventScroll: true });
    else if (wasFullscreen.current)
      fullscreenButton.current?.focus({ preventScroll: true });
    wasFullscreen.current = state.fullscreen;
    return () => document.body.classList.remove("map-fullscreen");
  }, [state.fullscreen]);
  return (
    <section className="map-panel">
      <div className="map-top">
        <span>
          <i className="green-dot"></i> Карта маршрута
        </span>
        <div className="map-tools">
          <button id="fit" onClick={() => editor.command("fit")}>
            ⌖ Показать весь трек
          </button>
          <button
            id="fullscreen"
            ref={fullscreenButton}
            onClick={() => editor.setFullscreen(true)}
            disabled={
              !state.mapReady || !state.pointCount || state.mode !== "pan"
            }
            title="Только редактирование. Выход из полного экрана — Esc."
          >
            ⛶ На весь экран
          </button>
        </div>
      </div>
      <div className="map-wrap" ref={wrap} tabIndex={-1}>
        <div className="map-floating-tools">
          <button
            id="map-screenshot"
            aria-label="Скриншот области"
            className={state.capture.active ? "active" : ""}
            onClick={() => editor.command("capture")}
            aria-pressed={state.capture.active}
            disabled={!state.mapReady || state.capture.busy}
            title="Выделить область карты и сохранить PNG"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M9 5 7 8H3v12h18V8h-4l-2-3Z" />
              <circle cx="12" cy="14" r="4" />
            </svg>
          </button>
          <div
            className="basemap-switch"
            role="group"
            aria-label="Отображение карты"
          >
            <button
              id="basemap-street"
              className={state.basemap === "street" ? "active" : ""}
              aria-pressed={state.basemap === "street"}
              onClick={() => editor.setBasemap("street")}
              disabled={!state.mapReady}
            >
              Схема
            </button>
            <button
              id="basemap-satellite"
              className={state.basemap === "satellite" ? "active" : ""}
              aria-pressed={state.basemap === "satellite"}
              onClick={() => editor.setBasemap("satellite")}
              disabled={!state.mapReady}
            >
              Спутник
            </button>
          </div>
        </div>
        <div
          id="capture-status"
          className={
            "capture-feedback" +
            (state.captureFeedback ? " visible" : "") +
            (state.captureFeedback?.error ? " error" : "")
          }
          role="status"
          aria-live="polite"
        >
          {state.captureFeedback?.text}
        </div>
        <button
          id="fullscreen-exit"
          onClick={() => editor.setFullscreen(false)}
        >
          Вернуться в нормальный режим (Esc)
        </button>
        <div id="map" ref={container} aria-label="Карта маршрута"></div>
        <div id="map-hint">
          {!state.loaded
            ? "Загрузите трек или откройте пример"
            : state.mode === "select"
              ? "Обведите точки рамкой · Esc — сбросить"
              : "Клик по линии — добавить · перетаскивание точки — переместить"}
        </div>
        <div className="legend">
          <span>
            <i></i> Маршрут
          </span>
          <span>
            <i></i> К удалению
          </span>
        </div>
      </div>
      <div className="stats">
        <div>
          <small>ТОЧЕК В ТРЕКЕ</small>
          <strong id="count">
            {state.loaded ? formatCount(state.pointCount) : "—"}
          </strong>
        </div>
        <div>
          <small>ДЛИНА МАРШРУТА</small>
          <strong id="distance">
            {state.loaded ? formatDistance(state.distance) : "—"}
          </strong>
        </div>
        <div>
          <small>УДАЛЕНО ТОЧЕК</small>
          <strong id="deleted">{state.deletedCount}</strong>
        </div>
        <button
          id="undo"
          disabled={!state.canUndo}
          onClick={() => editor.undo()}
        >
          ↶ Отменить изменение
        </button>
      </div>
    </section>
  );
}
