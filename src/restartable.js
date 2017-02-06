import xs from 'xstream';

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

function onDispose (observable, disposeHandler) {
  const oldDispose = observable.dispose.bind(observable);

  observable.dispose = () => {
    disposeHandler();
    oldDispose();
  };

  return observable;
}

function record ({streams, addLogEntry, pause$, Time}, streamToRecord, identifier) {
  const stream = streamToRecord.compose(pausable(pause$.startWith(true))).map(event => {
    if (typeof event.subscribe === 'function') {
      const eventStream = event.debug((innerEvent) => {
        addLogEntry({event: xs.of(innerEvent), time: Time._time(), identifier, stream});
      });

      eventStream.request = event.request;

      return eventStream;
    }


    // TODO - need to use time from time driver
    addLogEntry({event, time: Time._time(), identifier, stream}); // TODO - stream is undefined and unused

    return event;
  });

  streams[identifier] = stream;

  return stream.debug(() => {});
}

function recordObservableSource ({streams, addLogEntry, pause$, Time}, source) {
  const source$ = source.compose(pausable(pause$.startWith(true))).debug(event => {
    if (typeof event.subscribe === 'function') {
      const loggedEvent$ = event.do(response => {
        addLogEntry({
          event: Object.assign(
            Observable.just(response),
            event
          ),
          time: new Date(),
          identifier: ':root'
        });
      });

      loggedEvent$.request = event.request;

      source$.shamefullySendNext(loggedEvent$);
    } else {
      addLogEntry({event, time: new Date(), identifier: ':root'});

      return event;
    }
  });

  streams[':root'] = source$;

  return source$;
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
  const logReplaceReducer$ = logReplace$.map(newLog => (log) => newLog);

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

  function restartableDriver (sink$, streamAdapter, Time) {
    const filteredSink$ = xs.create();
    const lastSinkEvent$ = xs.createWithMemory();

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

    lastSinkEvent$.imitate(sink$);

    const source = driver(filteredSink$, streamAdapter);

    let returnValue;

    if (source === undefined || source === null) {
      return source;
    } else if (typeof source.addListener === 'function') {
      returnValue = recordObservableSource({streams, addLogEntry, pause$, Time}, source);
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
