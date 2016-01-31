import {run} from '@cycle/core';
import Rx from 'rx';
import restartable from './restartable';

function restart (main, drivers, {sources, sinks}, isolate = {}, timeToTravelTo = null) {
  sources.dispose();
  sinks && sinks.dispose();

  if (typeof isolate === 'function' && 'reset' in isolate) {
    isolate.reset();
  }

  for (let driverName in drivers) {
    const driver = drivers[driverName];

    if (driver.onPreReplay) {
      driver.onPreReplay();
    }
  }

  const newSourcesAndSinks = run(main, drivers);

  setTimeout(() => {
    const scheduler = new Rx.HistoricalScheduler();

    for (let driverName in drivers) {
      const driver = drivers[driverName];

      if (driver.replayLog) {
        const log$ = sources[driverName].log$;

        driver.replayLog(scheduler, log$, timeToTravelTo);
      }
    }

    scheduler.scheduleAbsolute({}, new Date(), () => {
      // TODO - remove this setTimeout, figure out how to tell when an async app is booted
      setTimeout(() => {
        for (let driverName in drivers) {
          const driver = drivers[driverName];

          if (driver.onPostReplay) {
            driver.onPostReplay();
          }
        }
      }, 500);
    });

    scheduler.start();
  });

  return newSourcesAndSinks;
}

module.exports = {
  restart,
  restartable
}
