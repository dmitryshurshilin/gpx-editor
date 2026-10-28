import { createContext, useContext, useSyncExternalStore } from "react";

export const EditorContext = createContext(null);
export function useEditor() {
  const store = useContext(EditorContext);
  if (!store) throw new Error("Editor components require EditorContext.");
  return store;
}
export function useEditorSnapshot() {
  const store = useEditor();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
