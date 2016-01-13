import {Observable, ReplaySubject} from 'rx';

function disposeAllStreams (streams) {
  console.log('dispose all!');
  Object.keys(streams).forEach(key => {
    const value = streams[key];

    delete streams[key];

    value.dispose();
  });
}

export default function restartable (driver, opts={}) {
  const log = [];
  const streams = {};

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
      scope = scope.concat([name], args);

      const returnValue = f.bind(context, ...args)();

      if (typeof returnValue === 'object') {
        if (typeof returnValue.subscribe === 'function') {
          const ident = scope.join('/');

          if (streams[ident] === undefined) {
            streams[ident] = new ReplaySubject();
          }

          const stream = streams[ident];

          returnValue.subscribe(event => {
            log.push({event, time: new Date(), ident, stream});

            stream.onNext(event);
          });

          return stream;
        }

        return wrapSource(returnValue, scope);
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
        })

        source$.onNext(loggedEvent$);
      });

      returnValue = source$;
    } else {
      returnValue = wrapSource(source);
    }

    returnValue.history = () => log

    return returnValue;
  }

  restartableDriver.aboutToReplay = function () {
    console.log('starting replay');
    replaying = true;
  };

  restartableDriver.replayHistory = function (scheduler, newHistory) {
    function scheduleEvent (historicEvent) {
      scheduler.scheduleAbsolute({}, historicEvent.time, () => {
        streams[historicEvent.ident].onNext(historicEvent.event);
      });
    }

    console.log('and here we go!');
    log.forEach(scheduleEvent);
  };

  restartableDriver.replayFinished = function () {
    console.log('done')
    replaying = false;
  };

  return restartableDriver;
}
