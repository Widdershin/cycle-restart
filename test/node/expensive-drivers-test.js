/* globals describe, it, before, after */
import assert from 'assert';
import {setup} from '@cycle/run';
import {restartable, restart, rerunner} from '../../src/restart';
import xs from 'xstream';

const subscribe = (f) => ({
  next: f,
  error: () => {},
  complete: () => {}
});

describe('drivers with costly sinks', () => {
  it('optionally filters all but the last sink', (done) => {
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

    const rerun = rerunner(setup, driversFn);
    rerun(main, () => {
      assert.equal(callCount, 5);

      rerun(main, () => {
        assert.equal(callCount, 6);

        done();
      });
    });
  });
});
