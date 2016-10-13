import run from '@cycle/xstream-run';
import Rx from 'rx';
import xs from 'xstream';
import restartable from './restartable';

function restart (main, drivers, {sources, sinks, dispose}, isolate = {}, timeToTravelTo = null) {
  dispose();

  if (typeof isolate === 'function' && 'reset' in isolate) {
    isolate.reset();
  }

  for (let driverName in drivers) {
    const driver = drivers[driverName];

    if (driver.onPreReplay) {
      driver.onPreReplay();
    }
  }

  const newSourcesSinksAndRun = run(main, drivers);

  const newDispose = newSourcesSinksAndRun.run();

  const sourcesAndSinksAndDispose = {
    sources: newSourcesSinksAndRun.sources,
    sinks: newSourcesSinksAndRun.sinks,
    dispose: newDispose
  };

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
  }, 50);

  return sourcesAndSinksAndDispose;
}

function rerunner (Cycle, isolate) {
  let sourcesAndSinksAndDispose = {};
  let first = true;
  return function(main, drivers, timeToTravelTo = null) {
    if (first) {
      const {sources, sinks, run} = Cycle(main, drivers);

      const dispose = run();

      sourcesAndSinksAndDispose = {sources, sinks, dispose};

      first = false;
    }
    else {
      sourcesAndSinksAndDispose = restart(main, drivers, sourcesAndSinksAndDispose, isolate, timeToTravelTo);
    }
    return sourcesAndSinksAndDispose;
  }
}

module.exports = {
  restart,
  restartable,
  rerunner
}
