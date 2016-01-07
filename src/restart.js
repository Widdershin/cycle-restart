import {run} from '@cycle/core';
import Rx from 'rx';

export default function restart (main, drivers, {sources, sinks}, isolate = {}) {
  sources.dispose();
  sinks && sinks.dispose();

  if ('reset' in isolate) {
    isolate.reset();
  }

  for (let driverName in drivers) {
    const driver = drivers[driverName];

    if (driver.aboutToReplay) {
      driver.aboutToReplay();
    }
  }

  const newSourcesAndSinks = run(main, drivers);

  setTimeout(() => {
    const scheduler = new Rx.HistoricalScheduler();

    for (let driverName in drivers) {
      const driver = drivers[driverName];

      if (driver.replayHistory) {
        const history = sources[driverName].history();

        driver.replayHistory(scheduler, history);
      }
    }

    scheduler.scheduleAbsolute({}, new Date(), () => {
      for (let driverName in drivers) {
        const driver = drivers[driverName];

        if (driver.replayFinished) {
          driver.replayFinished();
        }
      }
    });

    scheduler.start();
  });

  return newSourcesAndSinks;
}
