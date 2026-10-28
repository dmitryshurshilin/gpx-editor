import { useEffect } from "react";
export function useEditorMap(container, editor) {
  useEffect(() => {
    let disposed = false,
      controller;
    import("../services/EditorMapController.js")
      .then(({ createEditorMapController }) => {
        if (!disposed)
          controller = createEditorMapController(container.current, editor);
      })
      .catch((error) => {
        if (!disposed)
          editor.setStatus("Не удалось открыть карту: " + error.message, true);
      });
    return () => {
      disposed = true;
      controller?.destroy();
    };
  }, [container, editor]);
}
