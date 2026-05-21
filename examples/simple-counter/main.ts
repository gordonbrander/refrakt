/// A simple counter using Reducer
import { type Reducer, reducer } from "refrakt/reducer.js";
import { effect } from "refrakt/signal.js";
import { assertNever } from "refrakt/never.js";

type Action = { type: "increment" } | { type: "decrement" } | { type: "reset" };

const update: Reducer<number, Action> = (state, action) => {
  switch (action.type) {
    case "increment":
      return state + 1;
    case "decrement":
      return state - 1;
    case "reset":
      return 0;
    default:
      return assertNever(action);
  }
};

const counter = reducer(update, 0);

// Use an effect to log state changes
effect(() => {
  console.log("Count:", counter.get());
});

counter.send({ type: "increment" });
counter.send({ type: "increment" });
counter.send({ type: "increment" });
counter.send({ type: "decrement" });
counter.send({ type: "reset" });
