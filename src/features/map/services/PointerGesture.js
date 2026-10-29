// Capture helps route events, but losing it does not mean the user cancelled.
// Document listeners also receive a fast release outside the original target.
export class PointerGesture {
  constructor(owner) {
    this.owner = owner;
    this.document = owner.ownerDocument || document;
    this.view = this.document.defaultView;
    this.current = null;
  }

  start(event, callbacks) {
    if (this.current) return false;
    const abort = new AbortController();
    this.current = {
      id: event.pointerId,
      type: event.pointerType || "mouse",
      callbacks,
      abort,
    };
    const listen = (target, type, handler) =>
      target?.addEventListener(type, handler, {
        capture: true,
        signal: abort.signal,
      });
    listen(this.document, "pointermove", (event) => {
      if (event.pointerId !== this.current?.id) return;
      event.preventDefault();
      event.stopPropagation();
      // Recover a mouse release missed while the pointer was outside the window.
      if (this.current.type === "mouse" && !(event.buttons & 1))
        this.finish(event);
      else this.current.callbacks.onMove(event);
    });
    listen(this.document, "pointerup", (event) => {
      if (event.pointerId !== this.current?.id) return;
      event.preventDefault();
      event.stopPropagation();
      this.finish(event);
    });
    listen(this.document, "mouseup", (event) => {
      if (this.current?.type !== "mouse" || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.finish(event);
    });
    listen(this.document, "pointercancel", (event) => {
      if (event.pointerId === this.current?.id) this.cancel();
    });
    listen(this.view, "blur", () => this.cancel());
    listen(this.view, "pagehide", () => this.cancel());
    try {
      this.owner.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // A queued fast release may already have made the pointer inactive.
      if (error.name !== "NotFoundError") {
        this.cancel();
        throw error;
      }
    }
    return true;
  }

  release() {
    const gesture = this.current;
    if (!gesture) return null;
    this.current = null;
    gesture.abort.abort();
    if (this.owner.hasPointerCapture?.(gesture.id))
      this.owner.releasePointerCapture(gesture.id);
    return gesture;
  }
  finish(event) {
    const gesture = this.release();
    gesture?.callbacks.onEnd(event);
  }
  cancel() {
    const gesture = this.release();
    gesture?.callbacks.onCancel();
  }
  destroy() {
    this.cancel();
  }
}
