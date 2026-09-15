/**
 * Web Worker-based Timer Helper for Background-Safe Delays
 * 
 * Chrome and modern Chromium browsers aggressively throttle setTimeout / setInterval 
 * on inactive or background tabs (sometimes freezing them to 1 tick per minute).
 * 
 * Web Workers run on a separate background OS thread that is immune to background tab
 * throttling, allowing accurate second-by-second countdowns and reliable delays even
 * when the user switches tabs, minimizes Chrome, or works in other applications.
 */

export function createWorkerTimer() {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    // Fallback for SSR or environments without Web Worker support
    return {
      wait: async (
        seconds: number,
        onTick?: (remaining: number) => void,
        abortCheck?: () => boolean
      ): Promise<boolean> => {
        for (let cd = seconds; cd > 0; cd--) {
          if (abortCheck && abortCheck()) return false;
          if (onTick) onTick(cd);
          await new Promise((r) => setTimeout(r, 1000));
        }
        return true;
      },
      stop: () => {},
      cleanup: () => {},
    };
  }

  const workerBlob = new Blob(
    [
      `
      let intervalId = null;
      self.onmessage = function(e) {
        if (e.data.action === 'start') {
          if (intervalId) clearInterval(intervalId);
          let remaining = e.data.seconds;
          self.postMessage({ type: 'tick', remaining });
          intervalId = setInterval(() => {
            remaining--;
            self.postMessage({ type: 'tick', remaining });
            if (remaining <= 0) {
              clearInterval(intervalId);
              intervalId = null;
              self.postMessage({ type: 'done' });
            }
          }, 1000);
        } else if (e.data.action === 'stop') {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          self.postMessage({ type: 'stopped' });
        }
      };
    `,
    ],
    { type: "application/javascript" }
  );

  const workerUrl = URL.createObjectURL(workerBlob);
  let worker: Worker | null = null;
  try {
    worker = new Worker(workerUrl);
  } catch (err) {
    console.warn("Failed to instantiate Web Worker, using fallback:", err);
  }

  const wait = (
    seconds: number,
    onTick?: (remaining: number) => void,
    abortCheck?: () => boolean
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (seconds <= 0 || (abortCheck && abortCheck())) {
        resolve(true);
        return;
      }

      if (!worker) {
        // Fallback for environments where Worker failed to instantiate
        (async () => {
          for (let cd = seconds; cd > 0; cd--) {
            if (abortCheck && abortCheck()) {
              resolve(false);
              return;
            }
            if (onTick) onTick(cd);
            await new Promise((r) => setTimeout(r, 1000));
          }
          resolve(true);
        })();
        return;
      }

      let safetyTimeout: any = null;

      const cleanupListeners = () => {
        if (safetyTimeout) clearTimeout(safetyTimeout);
        worker?.removeEventListener("message", messageHandler);
        worker?.removeEventListener("error", errorHandler);
      };

      const errorHandler = (err: ErrorEvent) => {
        console.warn("Worker error during wait, continuing safely:", err);
        cleanupListeners();
        resolve(true);
      };

      const messageHandler = (e: MessageEvent) => {
        if (abortCheck && abortCheck()) {
          worker?.postMessage({ action: "stop" });
          cleanupListeners();
          resolve(false);
          return;
        }

        if (e.data.type === "tick") {
          if (onTick) onTick(e.data.remaining);
        } else if (e.data.type === "done") {
          cleanupListeners();
          resolve(true);
        } else if (e.data.type === "stopped") {
          cleanupListeners();
          resolve(false);
        }
      };

      // Safety timeout: if worker ever stalls, force resolve after seconds + 3s
      safetyTimeout = setTimeout(() => {
        console.warn("Worker timer safety timeout reached, continuing.");
        cleanupListeners();
        resolve(true);
      }, (seconds + 3) * 1000);

      worker.addEventListener("message", messageHandler);
      worker.addEventListener("error", errorHandler);
      worker.postMessage({ action: "start", seconds });
    });
  };

  const stop = () => {
    try {
      worker?.postMessage({ action: "stop" });
    } catch {}
  };

  const cleanup = () => {
    try {
      worker?.terminate();
      URL.revokeObjectURL(workerUrl);
    } catch {}
  };

  return { wait, stop, cleanup };
}
