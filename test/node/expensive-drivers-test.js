/* globals describe, it, before, after */
import assert from 'assert';
import run from '@cycle/xstream-run';
import {restartable, restart, rerunner} from '../../src/restart';
import {HistoricalScheduler} from 'rx';
import xs from 'xstream';

const subscribe = (f) => ({
  next: f,
  error: () => {},
  complete: () => {}
});

describe('drivers with costly sinks', () => {
  it.only('optionally filters all but the last sink', (done) => {
    let callCount = 0;

    const driver = (sinks$) => {
      sinks$.addListener(subscribe(_ => {
        callCount++
      }));

      return xs.empty();
    };

    function main () {
      return {
        Foo: xs.of(1, 2, 3, 4, 5)
      };
    }

    const driversFn = () => ({
      Foo: restartable(driver, {replayOnlyLastSink: true, pauseSinksWhileReplaying: true})
    });

    const rerun = rerunner(run, driversFn);
    rerun(main);

    setTimeout(() => {
      assert.equal(callCount, 5);

      rerun(main);

      setTimeout(() => {
        assert.equal(callCount, 6);

        done();
      }, 600);
    }, 1);
  });
});
