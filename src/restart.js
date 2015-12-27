import {run} from '@cycle/core';
import isolate from '@cycle/isolate';
import Rx from 'rx';

export default function restart (main, sources, drivers) {
  sources.dispose();


  for (let driverName in drivers) {
    const driver = drivers[driverName];
    const history = sources[driverName].history();

    function usingIsolate () {
      return Object
        .keys(history)
        .some(key => key.match(/cycle-scope/))
    }

    function first (array) {
      return array[0];
    }

    function last (array) {
      return array[array.length - 1];
    }

    function getScopeId (selector) {
      return parseInt(/.cycle-scope-cycle(\d+).*/.exec(selector)[1], 10);
    }


    if (usingIsolate()) {
      console.log('updating scopes');
      const firstScope = getScopeId(first(Object.keys(history)));
      const lastScope = getScopeId(last(Object.keys(history)));

      const scopeCount = lastScope - (firstScope - 1);

      const newHistory = {};

      for (let selector in history) {
        const selectorHistory = history[selector];

        const scopeId = getScopeId(selector);

        const newSelector = selector.replace(
          '.cycle-scope-cycle' + scopeId,
          '.cycle-scope-cycle' + (scopeId + scopeCount)
        );

        console.log(selectorHistory);
        const newSelectorHistory = {};

        for (let eventName in selectorHistory) {
          const eventHistory = selectorHistory[eventName];

          newSelectorHistory[eventName] = {
            events: eventHistory.events,
            stream: new Rx.Subject()
          }

          eventHistory.stream.dispose();
        }

        newHistory[newSelector] = newSelectorHistory;
      }

      for (let driverName in drivers) {
        const driver = drivers[driverName];
        const history = sources[driverName].history();

        console.log('changing history');
        if (driver.setHistory) {
          driver.setHistory(newHistory);
        }
      }
    }
  }

  run(main, drivers);

  if ('reset' in isolate) {
    isolate.reset();
  } else {
    console.warn('Isolate has no reset support')
  }

  setTimeout(() => {
    for (let driverName in drivers) {
      const driver = drivers[driverName];

      console.log('replaying events');
      if (driver.replayHistory) {
        driver.replayHistory();
      }
    }
  });
}
