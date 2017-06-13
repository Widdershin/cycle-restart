import xs, { MemoryStream } from 'xstream';

function pausable (pause$) {
  return function (stream) {
    return pause$
      .map(paused => stream.filter(() => paused))
      .flatten();
  };
}

function disposeAllStreams (streams) {
  keys(streams).forEach(key => {
    const value = streams[key];

    delete streams[key];

    value && value.dispose && value.dispose();
  });
}

function makeDispose ({streams}, originalDispose, context) {
  return function dispose () {
    originalDispose.bind(context)();
    disposeAllStreams(streams);
  };
}

function record ({streams, addLogEntry, pause$, Time}, streamToRecord, identifier) {
  const stream = streamToRecord.compose(pausable(pause$.startWith(true))).map(event => {
    if (typeof event.subscribe === 'function') {
      const eventStream = event.debug((innerEvent) => {
        const response$ = xs.of(innerEvent);

        response$.request = event.request;

        addLogEntry({event: response$, time: Time._time(), identifier, stream});
      });

      eventStream.request = event.request;

      return eventStream;
    }

    addLogEntry({event, time: Time._time(), identifier, stream}); // TODO - stream is undefined and unused

    return event;
  });

  streams[identifier] = stream;

  return stream.debug(() => {});
}

function wrapSourceFunction ({streams, addLogEntry, pause$, Time}, name, f, context, scope = []) {
  return function newSource (...args) {
    const newScope = scope.concat(args);

    const returnValue = f.bind(context, ...args)();

    if (name.indexOf('isolate') !== -1 || typeof returnValue !== 'object') {
      return returnValue;
    }

    if (typeof returnValue.addListener !== 'function') {
      return wrapSource({streams, addLogEntry, pause$, Time}, returnValue, newScope);
    }

    const identifier = newScope.join('/');

    return record({streams, addLogEntry, pause$, Time}, returnValue, identifier);
  };
}

function keys (obj) {
  const _keys = [];

  for (let prop in obj) {
    _keys.push(prop);
  }

  return _keys;
}

function wrapSource ({streams, addLogEntry, pause$, Time}, source, scope = []) {
  const returnValue = {};

  keys(source).forEach(key => {
    const value = source[key];

    if (key === 'dispose') {
      returnValue[key] = makeDispose({streams}, value, source);
    } else if (typeof value === 'function') {
      returnValue[key] = wrapSourceFunction({streams, addLogEntry, pause$, Time}, key, value, returnValue, scope);
    } else {
      returnValue[key] = value;
    }
  });

  return returnValue;
}

const subscribe = (f) => ({
  next: f,
  error: (err) => console.error(err),
  complete: () => {}
});

function createLog$() {
  const logEntry$ = xs.create();
  const logEntryReducer$ = logEntry$.map(entry => (log) => log.concat(entry));

  const logReplace$ = xs.create();
  const logReplaceReducer$ = logReplace$.map(newLog => () => newLog);

  const logReducer$ = xs.merge(
    logEntryReducer$,
    logReplaceReducer$
  )

  const log$ = logReducer$
    .fold((log, reducer) => reducer(log), [])

  function addLogEntry (entry) {
    logEntry$.shamefullySendNext(entry);
  }

  function replaceLog (newLog) {
    logReplace$.shamefullySendNext(newLog);
  }

  return {log$, addLogEntry, replaceLog};
}

export default function restartable (driver, opts = {}) {
  const {log$, addLogEntry, replaceLog} = createLog$();
  // TODO - dispose log subscription
  log$.addListener(subscribe(() => {}));

  const streams = {};

  const pauseSinksWhileReplaying = opts.pauseSinksWhileReplaying === undefined ? true : opts.pauseSinksWhileReplaying;
  const pause$ = (opts.pause$ || xs.empty()).startWith(true);
  const replayOnlyLastSink = opts.replayOnlyLastSink || false;

  let replaying;
  const isReplaying = () => replaying;
  const setReplaying = (newReplaying) => replaying = newReplaying;
  const finishedReplay$ = xs.create();

  function restartableDriver (sink$, Time) {
    const filteredSink$ = xs.create();
    let lastSinkEvent$ = xs.createWithMemory();

    if (sink$) {
      if (isReplaying() && replayOnlyLastSink)  {
        lastSinkEvent$.map(lastEvent => finishedReplay$.mapTo(lastEvent)).flatten().take(1).addListener(subscribe((event) => {
          filteredSink$.shamefullySendNext(event);
        }));
      }

      if (pauseSinksWhileReplaying) {
        sink$.compose(pausable(pause$)).filter(() => !isReplaying()).addListener({
          next: (ev) => filteredSink$.shamefullySendNext(ev),
          error: (err) => console.error(err),
          complete: () => {}
        });
      } else {
        sink$.compose(pausable(pause$)).addListener(subscribe((ev) => filteredSink$.shamefullySendNext(ev)));
      }
    }

    // force sink$ to a normal stream with .filter() to prevent attempting
    // imitation of a MemoryStream which can't be imitated
    lastSinkEvent$.imitate(sink$.filter(() => {}));

    const source = driver(filteredSink$);

    let returnValue;

    if (source === undefined || source === null) {
      return source;
    } else if (typeof source.addListener === 'function') {
      returnValue = record({streams, addLogEntry, pause$, Time}, source, ':root');
    } else {
      returnValue = wrapSource({streams, addLogEntry, pause$, Time}, source);
    }

    const oldReturnValueDispose = source.dispose;

    returnValue.dispose = function () {
      oldReturnValueDispose && oldReturnValueDispose.bind(returnValue)();
      sink$ && sink$.dispose && sink$.dispose();

      disposeAllStreams(streams);
    }

    returnValue.log$ = log$;

    return returnValue;
  }

  function replayable (driver) {
    driver.onPreReplay = function () {
      setReplaying(true);
    };

    driver.replayLog = function (schedule, newLog$, timeToResetTo = null) {
      let logToReplaceWith;

      newLog$.take(1).addListener({
        next: newLog => {
          logToReplaceWith = newLog;

          function scheduleEvent (historicEvent) {
            const stream = streams[historicEvent.identifier];

            if (stream) {
              schedule.next(stream, historicEvent.time, historicEvent.event);
            } else {
              console.error('Missing replay stream ', historicEvent.identifier)
            }
          }

          newLog.filter(event => timeToResetTo === null || event.time <= timeToResetTo).forEach(scheduleEvent);
        },

        error: (err) => {
          console.error(err);
        },

        complete: () => {
          replaceLog(logToReplaceWith);
        }
      })
    };

    driver.onPostReplay = function () {
      setReplaying(false);
      finishedReplay$.shamefullySendNext();
    };

    return driver;
  }

  return replayable(restartableDriver);
}
