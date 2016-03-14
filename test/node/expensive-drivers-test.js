/* globals describe, it, before, after */
import assert from 'assert';
import {run} from '@cycle/core';
import {restartable, restart} from '../../src/restart';
import {Observable, Subject, HistoricalScheduler} from 'rx';

describe('drivers with costly sinks', () => {
  it('optionally filters all but the last sink', (done) => {
    let callCount = 0;

    const driver = (sinks$) => {
      sinks$.subscribe(_ => callCount++);

      return Observable.empty();
    };

    function main () {
      return {
        Foo: Observable.range(1, 5)
      };
    }

    const drivers = {
      Foo: restartable(driver, {replayOnlyLastSink: true, pauseSinksWhileReplaying: false})
    };

    const {sinks, sources} = run(main, drivers);

    setTimeout(() => {
      assert.equal(callCount, 5);

      restart(main, drivers, {sinks, sources});

      setTimeout(() => {
        assert.equal(callCount, 6);

        done();
      }, 600);
    }, 1);
  });
});
