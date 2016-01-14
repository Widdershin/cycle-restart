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
  }
}

function wrapSourceFunction ({streams, subscriptions, log}, name, f, context, scope = []) {
  return function (...args) {
    const newScope = scope.concat(args);

    const returnValue = f.bind(context, ...args)();

    if (name.indexOf('isolate') !== -1 || typeof returnValue !== 'object') {
      return returnValue;
    }

    if (typeof returnValue.subscribe !== 'function') {
      return wrapSource({streams, subscriptions, log}, returnValue, newScope);
    }

    const ident = newScope.join('/');

    if (streams[ident] === undefined) {
      streams[ident] = new ReplaySubject();
    }

    const stream = streams[ident];

    const subscription = returnValue.subscribe(event => {
      log.push({event, time: new Date(), ident, stream});

      stream.onNext(event);
    });

    subscriptions.push(subscription);

    return stream;
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
    const source$ = new ReplaySubject(1);

    streams[':root'] = source$;
    let returnValue;

    if (typeof source.subscribe === 'function') {
      source.subscribe(event => {
        const loggedEvent$ = event.do(response => {
          log.push({event: Observable.just(response), time: new Date(), stream: source$, ident: ':root'});
        });

        source$.onNext(loggedEvent$);
      });

      returnValue = source$;
    } else {
      returnValue = wrapSource({streams, subscriptions, log}, source);
    }

    returnValue.history = () => log;

    return returnValue;
  }

  restartableDriver.aboutToReplay = function () {
    replaying = true;
  };

  restartableDriver.replayHistory = function (scheduler, newHistory) {
    function scheduleEvent (historicEvent) {
      scheduler.scheduleAbsolute({}, historicEvent.time, () => {
        streams[historicEvent.ident].onNext(historicEvent.event);
      });
    }

    log.forEach(scheduleEvent);
  };

  restartableDriver.replayFinished = function () {
    replaying = false;
  };

  return restartableDriver;
}
