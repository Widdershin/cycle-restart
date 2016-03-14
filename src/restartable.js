import {Observable, ReplaySubject, Subject} from 'rx';

function disposeAllStreams (streams) {
  Object.keys(streams).forEach(key => {
    const value = streams[key];

    delete streams[key];

    value.dispose();
  });
}

function makeDispose ({streams}, originalDispose) {
  return function dispose () {
    originalDispose();
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

function record ({streams, addLogEntry, pause$}, streamToRecord, identifier) {
  if (streams[identifier] === undefined) {
    streams[identifier] = new Subject();
  }

  const stream = streams[identifier];

  const subscription = streamToRecord.pausable(pause$.startWith(true)).subscribe(event => {
    addLogEntry({event, time: new Date(), identifier, stream});

    stream.onNext(event);
  });

  onDispose(stream, () => subscription.dispose());

  return stream;
}

function recordObservableSource ({streams, addLogEntry, pause$}, source) {
  const source$ = new ReplaySubject(1);

  streams[':root'] = source$;
  

  const subscription = source.pausable(pause$.startWith(true)).subscribe(event => {
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

      source$.onNext(loggedEvent$);
    } else {
      source$.onNext(event);

      addLogEntry({event, time: new Date(), identifier: ':root'});
    }
  });

  onDispose(source$, () => subscription.dispose());

  return source$;
}

function wrapSourceFunction ({streams, addLogEntry, pause$}, name, f, context, scope = []) {
  return function newSource (...args) {
    const newScope = scope.concat(args);

    const returnValue = f.bind(context, ...args)();

    if (name.indexOf('isolate') !== -1 || typeof returnValue !== 'object') {
      return returnValue;
    }

    if (typeof returnValue.subscribe !== 'function') {
      return wrapSource({streams, addLogEntry, pause$}, returnValue, newScope);
    }

    const identifier = newScope.join('/');

    return record({streams, addLogEntry, pause$}, returnValue, identifier);
  };
}

function wrapSource ({streams, addLogEntry, pause$}, source, scope = []) {
  const returnValue = {};

  Object.keys(source).forEach(key => {
    const value = source[key];

    if (key === 'dispose') {
      returnValue[key] = makeDispose({streams}, value);
    } else if (typeof value === 'function') {
      returnValue[key] = wrapSourceFunction({streams, addLogEntry, pause$}, key, value, returnValue, scope);
    } else {
      returnValue[key] = value;
    }
  });

  return returnValue;
}

export default function restartable (driver, opts = {}) {
  const logEntry$ = new Subject();
  const log$ = logEntry$
    .startWith([])
    .scan((log, entry) => log.concat([entry]))
    .shareReplay(1);

  function addLogEntry (entry) {
    logEntry$.onNext(entry);
  }

  // TODO - dispose log subscription
  log$.subscribe();

  const streams = {};

  const pauseSinksWhileReplaying = opts.pauseSinksWhileReplaying === undefined ? true : opts.pauseSinksWhileReplaying;
  const pause$ = opts.pause$ || Observable.just(true)


  let replaying;

  function restartableDriver (sink$) {
    let filteredSink$ = sink$;

    if (!sink$ || !sink$.subscribe) {
      filteredSink$ = Observable.empty();
    }

    filteredSink$ = filteredSink$.pausable(pause$.startWith(true));

    if (pauseSinksWhileReplaying) {
      filteredSink$ = filteredSink$.filter(() => !replaying);
    }

    const source = driver(filteredSink$);

    let returnValue;

    if (source === undefined || source === null) {
      return source;
    } else if (typeof source.subscribe === 'function') {
      returnValue = recordObservableSource({streams, addLogEntry, pause$}, source);
    } else {
      returnValue = wrapSource({streams, addLogEntry, pause$}, source);
    }

    const oldReturnValueDispose = returnValue.dispose;

    returnValue.dispose = function () {
      oldReturnValueDispose && oldReturnValueDispose();
      sink$ && sink$.dispose();

      disposeAllStreams(streams);
    }

    returnValue.log$ = log$;

    return returnValue;
  }

  function replayable (driver) {
    driver.onPreReplay = function () {
      replaying = true;
    };

    driver.replayLog = function (scheduler, newLog$, timeToResetTo = null) {
      newLog$.take(1).subscribe(newLog => {
        function scheduleEvent (historicEvent) {
          scheduler.scheduleAbsolute({}, historicEvent.time, () => {
            if (streams[historicEvent.identifier]) {
              streams[historicEvent.identifier].onNext(historicEvent.event);
            } else {
              console.error('Missing replay stream ', historicEvent.identifier)
            }
          });
        }

        newLog.filter(event => timeToResetTo === null || event.time <= timeToResetTo).forEach(scheduleEvent);
      });
    };

    driver.onPostReplay = function () {
      replaying = false;
    };

    return restartableDriver;
  }

  return replayable(restartableDriver);
}
