const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Acquire mic+cam for a call. Call this on "Accept" BEFORE mounting
 * CallOverlay so the camera isn't still locked by the ringing UI / another tab.
 */
export async function acquireCallMedia() {
  const attempts = [
    () => navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } }),
    () => navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
    () => navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
  ];

  for (let round = 0; round < 2; round++) {
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (err) {
        const retryable =
          err?.name === "NotReadableError" ||
          err?.name === "OverconstrainedError" ||
          err?.name === "AbortError";
        if (!retryable) throw err;
      }
    }
    await sleep(700);
  }
  return null;
}

export function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((t) => t.stop());
}
