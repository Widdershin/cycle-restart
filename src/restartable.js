import {Observable, ReplaySubject} from 'rx';

function disposeAllStreams (streams) {
  Object.keys(streams).forEach(key => {
    const value = streams[key];

    delete streams[key];

    value.dispose();
  });
}

function makeDispose ({streams, subscriptions}, originalDispose) {
  return function dispose () {
    originalDispose();
    disposeAllStreams(streams);
    subscriptions.forEach(sub => sub.dispose());
    subscriptions = [];
  };
}

function record ({streams, subscriptions, log}, streamToRecord, identifier) {
  if (streams[identifier] === undefined) {
    streams[identifier] = new ReplaySubject();
  }

  const stream = streams[identifier];

  const subscription = streamToRecord.subscribe(event => {
    log.push({event, time: new Date(), identifier, stream});

    stream.onNext(event);
  });

  subscriptions.push(subscription);

  return stream;
}

function recordObservableSource ({streams, log}, source) {
  const source$ = new ReplaySubject(1);

  streams[':root'] = source$;

  source.subscribe(event => {
    const loggedEvent$ = event.do(response => {
      log.push({event: Observable.just(response), time: new Date(), stream: source$, identifier: ':root'});
    });

    source$.onNext(loggedEvent$);
  });

  return source$;
}

function wrapSourceFunction ({streams, subscriptions, log}, name, f, context, scope = []) {
  return function newSource (...args) {
    const newScope = scope.concat(args);

    const returnValue = f.bind(context, ...args)();

    if (name.indexOf('isolate') !== -1 || typeof returnValue !== 'object') {
      return returnValue;
    }

    if (typeof returnValue.subscribe !== 'function') {
      return wrapSource({streams, subscriptions, log}, returnValue, newScope);
    }

    const identifier = newScope.join('/');

    return record({streams, subscriptions, log}, returnValue, identifier);
  };
}

function wrapSource ({streams, subscriptions, log}, source, scope = []) {
  const returnValue = {};

  Object.keys(source).forEach(key => {
    const value = source[key];

    if (key === 'dispose') {
      returnValue[key] = makeDispose({streams, subscriptions}, value);
    } else if (typeof value === 'function') {
      returnValue[key] = wrapSourceFunction({streams, subscriptions, log}, key, value, returnValue, scope);
    } else {
      returnValue[key] = value;
    }
  });

  return returnValue;
}

export default function restartable (driver, opts = {}) {
  const log = [];
  const streams = {};
  let subscriptions = [];

  const pauseSinksWhileReplaying = opts.pauseSinksWhileReplaying === undefined ? true : opts.pauseSinksWhileReplaying;

  let replaying;

  function restartableDriver (sink$) {
    let filteredSink$ = sink$;

    if (pauseSinksWhileReplaying) {
      filteredSink$ = sink$.filter(_ => !replaying);
    }

    const source = driver(filteredSink$);

    let returnValue;

    if (typeof source.subscribe === 'function') {
      returnValue = recordObservableSource({streams, log}, source);
    } else {
      returnValue = wrapSource({streams, subscriptions, log}, source);
    }

    returnValue.log = () => log;

    return returnValue;
  }

  function replayable (driver) {
    driver.onPreReplay = function () {
      replaying = true;
    };

    driver.replayLog = function (scheduler, newLog) {
      function scheduleEvent (historicEvent) {
        scheduler.scheduleAbsolute({}, historicEvent.time, () => {
          streams[historicEvent.identifier].onNext(historicEvent.event);
        });
      }

      newLog.forEach(scheduleEvent);
    };

    driver.onPostReplay = function () {
      replaying = false;
    };

    return restartableDriver;
  }

  return replayable(restartableDriver);
}
