import {run} from '@cycle/core';

export default function restart (main, sources, drivers) {
  sources.dispose();

  run(main, drivers);

  setTimeout(() => {
    for (let driverName in drivers) {
      const driver = drivers[driverName];
      const history = sources[driverName].history()

      if (driver.replayHistory) {
        driver.replayHistory(history);
      }
    }
  }, 10);
}
