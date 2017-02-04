import run from '@cycle/xstream-run';
import xs from 'xstream';
import restartable from './restartable';
import {mockTimeSource} from '@cycle/time';

function restart (main, drivers, cb, {sources, sinks, dispose}, isolate = {}, timeToTravelTo = null) {
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

  const Time = mockTimeSource();

  for (let driverName in drivers) {
    const driver = drivers[driverName];

    if (driver.replayLog) {
      const log$ = sources[driverName].log$;

      driver.replayLog(Time._scheduler, log$, timeToTravelTo);
    }
  }

  Time.run((err) => {
    if (err) {
      throw err;
    }

    for (let driverName in drivers) {
      const driver = drivers[driverName];

      if (driver.onPostReplay) {
        driver.onPostReplay();
      }

      setTimeout(() => cb(err));
    }

    dispose();
  });

  return sourcesAndSinksAndDispose;
}

function rerunner (Cycle, driversFn, isolate) {
  let sourcesAndSinksAndDispose = {};
  let first = true;
  let drivers;
  function noop () {}

  return function(main, cb = noop, timeToTravelTo = null) {
    if (first) {
      drivers = driversFn();

      const {sources, sinks, run} = Cycle(main, drivers);

      const dispose = run();

      sourcesAndSinksAndDispose = {sources, sinks, dispose};

      first = false;

      setTimeout(() => cb());
    }
    else {
      drivers = driversFn();

      sourcesAndSinksAndDispose = restart(main, drivers, cb, sourcesAndSinksAndDispose, isolate, timeToTravelTo);
    }
    return sourcesAndSinksAndDispose;
  }
}

module.exports = {
  restart,
  restartable,
  rerunner
}
