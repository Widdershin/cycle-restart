import {run} from '@cycle/core';

export default function restart (main, sources, drivers, isolate = {}) {
  sources.dispose();

  if ('reset' in isolate) {
    isolate.reset();
  }

  for (let driverName in drivers) {
    const driver = drivers[driverName];

    if (driver.replayHistory) {
      driver.aboutToReplay();
    }
  }

  const newSourcesAndSinks = run(main, drivers);

  setTimeout(() => {
    for (let driverName in drivers) {
      const driver = drivers[driverName];

      if (driver.replayHistory) {
        const history = sources[driverName].history();

        driver.replayHistory(history);
      }
    }
  });

  return newSourcesAndSinks;
}
