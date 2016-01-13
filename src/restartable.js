import {Observable, Subject} from 'rx';

export default function restartable (driver) {
  const log = [];

  let source$;
  let replaying;

  function restartableDriver (sink$) {
    const source = driver(sink$.do(console.log.bind(console, 'request')).filter(_ => !replaying));

    source$ = new Subject();

    if (typeof source.subscribe === 'function') {
      source.subscribe(event => {
        const loggedEvent$ = event.do(response => {
          log.push({event: Observable.just(response), time: new Date()});
        })

        source$.onNext(loggedEvent$);
      });
    }

    source$.history = function () {
      return log;
    };

    return source$;
  }

  restartableDriver.aboutToReplay = function () {
    console.log('starting replay');
    replaying = true;
  };

  restartableDriver.replayHistory = function (scheduler, newHistory) {
    function scheduleEvent (historicEvent) {
      scheduler.scheduleAbsolute({}, historicEvent.time, () => {
        source$.onNext(historicEvent.event);
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
