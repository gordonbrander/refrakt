/// A stopwatch using Store with fx
/// Demonstrates using state() within an effect to read current state
/// and cancel the effect when isRunning becomes false.
import { type Update, store, tx, unreachable } from "refrakt/store.js";
import { effect } from "refrakt/signal.js";

type Model = {
  isRunning: boolean;
  elapsed: number;
};

type Action =
  | { type: "start" }
  | { type: "stop" }
  | { type: "reset" }
  | { type: "tick" };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const update: Update<Model, Action, void> = (state, action) => {
  switch (action.type) {
    case "start":
      return tx(
        { ...state, isRunning: true } as Model,
        async function* (state) {
          // Tick every second while running.
          // state() reads current store state, so we can check the
          // isRunning flag to know when to stop.
          while (state().isRunning) {
            await delay(1000);
            // Check again after the delay, since state may have changed
            if (state().isRunning) {
              yield { type: "tick" };
            }
          }
        },
      );
    case "stop":
      return tx({ ...state, isRunning: false } as Model);
    case "reset":
      return tx({ ...state, elapsed: 0, isRunning: false } as Model);
    case "tick":
      return tx({ ...state, elapsed: state.elapsed + 1 } as Model);
    default:
      return unreachable(state, action);
  }
};

const stopwatch = store(update, { isRunning: false, elapsed: 0 });

// Log state changes
effect(() => {
  const { isRunning, elapsed } = stopwatch.get();
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const time = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  console.log(`${time} ${isRunning ? "(running)" : "(stopped)"}`);
});

// Start the stopwatch
stopwatch.send({ type: "start" });

// Stop after 5 seconds
setTimeout(() => {
  stopwatch.send({ type: "stop" });
  console.log("Stopped");

  // Reset after another second
  setTimeout(() => {
    stopwatch.send({ type: "reset" });
    console.log("Reset");
  }, 1000);
}, 5000);
