import run from '@cycle/xstream-run';
import xs from 'xstream';
import restartable from './restartable';
import {timeDriver, mockTimeSource} from '@cycle/time';

function restart (main, drivers, cb, {sources, sinks, dispose}, isolate = {}, timeToTravelTo = null) {
  dispose();

  if (typeof isolate === 'function' && 'reset' in isolate) {
    isolate.reset();
  }

  const realTime = timeDriver();
  realTime._pause();

  drivers.Time = () => realTime;

  for (let driverName in drivers) {
    const driver = drivers[driverName];

    const newDriver = (sink$, adapter) => driver(sink$, adapter, realTime);

    newDriver.replayLog = driver.replayLog;
    newDriver.onPostReplay = driver.onPostReplay;
    newDriver.log$ = driver.log$;

    drivers[driverName] = newDriver;

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

  if (typeof cb === 'object') {
    cb.start(sourcesAndSinksAndDispose);
  }

  for (let driverName in drivers) {
    const driver = drivers[driverName];

    if (driver.replayLog) {
      const log$ = sources[driverName].log$;

      driver.replayLog(realTime._scheduler, log$, timeToTravelTo);
    }
  }

  const timeToRunTo = (sources.Time && sources.Time._time()) || null;

  realTime._runVirtually((err) => {
    if (err) {
      throw err;
    }

    for (let driverName in drivers) {
      const driver = drivers[driverName];

      if (driver.onPostReplay) {
        driver.onPostReplay();
      }
    }

    setTimeout(() => {
      if (typeof cb === 'object') {
        cb.stop(err);
      } else {
        cb(err);
      }

      realTime._resume(timeToRunTo);
    });
  }, timeToRunTo);

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

      let realTime = timeDriver();
      drivers.Time = () => realTime;

      for (let driverName in drivers) {
        const driver = drivers[driverName];

        const newDriver = (sink$, adapter) => driver(sink$, adapter, realTime);

        drivers[driverName] = newDriver;
      }

      const {sources, sinks, run} = Cycle(main, drivers);

      realTime = sources.Time;

      const dispose = run();

      sourcesAndSinksAndDispose = {sources, sinks, dispose};

      first = false;

      if (typeof cb === 'object') {
        cb.start(sourcesAndSinksAndDispose);
      }

      setTimeout(() => {
        if (typeof cb === 'object') {
          cb.stop();
        } else {
          cb();
        }
      });
    } else {
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
