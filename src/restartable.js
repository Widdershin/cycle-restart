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

function record ({streams, addLogEntry}, streamToRecord, identifier) {
  if (streams[identifier] === undefined) {
    streams[identifier] = new Subject();
  }

  const stream = streams[identifier];

  const subscription = streamToRecord.subscribe(event => {
    addLogEntry({event, time: new Date(), identifier, stream});

    stream.onNext(event);
  });

  onDispose(stream, () => subscription.dispose());

  return stream;
}

function recordObservableSource ({streams, addLogEntry}, source) {
  const source$ = new ReplaySubject(1);

  streams[':root'] = source$;

  const subscription = source.subscribe(event => {
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

function wrapSourceFunction ({streams, addLogEntry}, name, f, context, scope = []) {
  return function newSource (...args) {
    const newScope = scope.concat(args);

    const returnValue = f.bind(context, ...args)();

    if (name.indexOf('isolate') !== -1 || typeof returnValue !== 'object') {
      return returnValue;
    }

    if (typeof returnValue.subscribe !== 'function') {
      return wrapSource({streams, addLogEntry}, returnValue, newScope);
    }

    const identifier = newScope.join('/');

    return record({streams, addLogEntry}, returnValue, identifier);
  };
}

function wrapSource ({streams, addLogEntry}, source, scope = []) {
  const returnValue = {};

  Object.keys(source).forEach(key => {
    const value = source[key];

    if (key === 'dispose') {
      returnValue[key] = makeDispose({streams}, value);
    } else if (typeof value === 'function') {
      returnValue[key] = wrapSourceFunction({streams, addLogEntry}, key, value, returnValue, scope);
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

  let replaying;

  function restartableDriver (sink$) {
    let filteredSink$ = sink$;

    if (sink$ && pauseSinksWhileReplaying) {
      filteredSink$ = sink$.filter(_ => !replaying);
    }

    const source = driver(filteredSink$);

    let returnValue;

    if (source === undefined || source === null) {
      return source;
    } else if (typeof source.subscribe === 'function') {
      returnValue = recordObservableSource({streams, addLogEntry}, source);
    } else {
      returnValue = wrapSource({streams, addLogEntry}, source);
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
            streams[historicEvent.identifier].onNext(historicEvent.event);
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
