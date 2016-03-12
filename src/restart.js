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
  }, 1);

  return newSourcesAndSinks;
}

function rerunner (run, isolate = {}) {
  let sourcesAndSinks = {};
  let first = true;
  return function(main, drivers, timeToTravelTo = null) {
    if (first) {
      sourcesAndSinks = run(main, drivers);
      first = false;
    }
    else {
      sourcesAndSinks = restart(main, drivers, sourcesAndSinks, isolate, timeToTravelTo);
    }
    return sourcesAndSinks;
  }
}

module.exports = {
  restart,
  restartable,
  rerunner
}
