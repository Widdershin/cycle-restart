import {Observable, ReplaySubject} from 'rx';

function disposeAllStreams (streams) {
  Object.keys(streams).forEach(key => {
    const value = streams[key];

    delete streams[key];

    value.dispose();
  });
}

export default function restartable (driver, opts={}) {
  const log = [];
  const streams = {};
  let subscriptions = [];

  const pauseSinksWhileReplaying = opts.pauseSinksWhileReplaying === undefined ? true : opts.pauseSinksWhileReplaying

  let replaying;

  function wrapSource (source, scope=[]) {
    const returnValue = {};

    Object.keys(source).forEach(key => {
      const value = source[key];

      if (key === 'dispose') {
        returnValue[key] = () => {
          value();
          disposeAllStreams(streams);
          subscriptions.forEach(sub => sub.dispose());
          subscriptions = [];
        };
      } else if (value === null) {
        returnValue[key] = value;
      } else if (typeof value.subscribe === 'function') {
        returnValue[key] = value;
      } else if (typeof value === 'function') {
        returnValue[key] = wrapSourceFunction(key, value, returnValue, scope);
      } else {
        returnValue[key] = value;
      }
    });

    return returnValue;
  }

  function wrapSourceFunction (name, f, context, scope = []) {
    return function (...args) {
      let newScope;

      if (typeof args[0] === 'string') {
        newScope = scope.concat([args[0]]);
      }

      const returnValue = f.bind(context, ...args)();

      if (name.indexOf('isolate') !== -1) {
        return returnValue;
      }

      if (typeof returnValue === 'object') {
        if (typeof returnValue.subscribe === 'function') {
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
        }

        return wrapSource(returnValue, newScope);
      } else {
        return returnValue;
      }
    };
  }

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
      returnValue = wrapSource(source);
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
