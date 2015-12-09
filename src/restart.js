import {run} from '@cycle/core';

export default function restart (main, sources, drivers) {
  sources.dispose();

  for (let driverName in drivers) {
    const driver = drivers[driverName];

    if (driver.setHistory && sources[driverName]) {
      driver.setHistory(sources[driverName].history());
    }
  }

  run(main, drivers);

  setTimeout(() => {
    for (let driverName in drivers) {
      const driver = drivers[driverName];

      if (driver.processHistory) {
        driver.processHistory();
      }
    }
  }, 10);
}
