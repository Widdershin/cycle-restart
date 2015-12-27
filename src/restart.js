import {run} from '@cycle/core';

export default function restart (main, sources, drivers, isolate={}) {
  sources.dispose();

  if ('reset' in isolate) {
    isolate.reset();
  }

  run(main, drivers);

  setTimeout(() => {
    for (let driverName in drivers) {
      const driver = drivers[driverName];
      const history = sources[driverName].history();

      if (driver.replayHistory) {
        driver.replayHistory(history);
      }
    }
  });
}
