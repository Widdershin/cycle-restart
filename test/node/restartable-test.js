/* globals describe, it*/
import assert from 'assert';
import xs from 'xstream';
import debounce from 'xstream/extra/debounce';
import xstreamAdapter from '@cycle/xstream-adapter';

import {restartable} from '../../src/restart';

const shittyListener = {
  next: () => {},
  error: () => {},
  complete: () => {}
};

function Scheduler () {
  const state = {
    queue: []
  }

  return {
    queue: state.queue,
    scheduleAbsolute (argument, time, f) {
      state.queue.push({argument, time, f});
    },
    start () {
      state.queue.sort((a, b) => a.time < b.time).forEach(entry => {
        entry.f(entry.argument)
      })
    }
  }
}

describe('restartable', () => {
  // TODO - how to check if stream is disposed in xstream
  xit('disposes cleanly', (done) => {
    const testDriver = () => xs.create();

    const source = restartable(testDriver)();

    source.dispose();
    assert.equal(source.isDisposed, true);

    done();
  });

  xit('totally disposes sources as well', (done) => {
    const testDriver = () => ({foo: () => xs.create()});

    const source = restartable(testDriver)();

    const stream = source.foo()

    assert.equal(stream._ils.length, 1);

    source.dispose();

    assert(stream.isDisposed);

    done();
  });

  it('handles write only drivers', (done) => {
    const testDriver = () => {};

    restartable(testDriver)(xs.empty());

    done();
  });

  it('handles read only drivers', (done) => {
    const testDriver = () => xs.empty();

    restartable(testDriver)();

    done();
  });

  it('pauses sinks', (done) => {
    let callCount = 0;
    const call$ = xs.create();
    const pause$ = xs.createWithMemory();

    pause$.shamefullySendNext(true);

    const testDriver = (sink$) => sink$.addListener({
      next: () => callCount++,
      error: done,
      complete: () => {}
    });

    restartable(testDriver, {pause$})(call$);

    assert.equal(callCount, 0);

    call$.shamefullySendNext();

    assert.equal(callCount, 1);

    pause$.shamefullySendNext(false);

    call$.shamefullySendNext();

    assert.equal(callCount, 1);

    done();
  });

  it('pauses sources', (done) => {
    const source$ = xs.create();
    const pause$ = xs.createWithMemory();

    pause$.shamefullySendNext(true);

    const testDriver = () => source$;

    const source = restartable(testDriver, {pause$})();

    const expected = [1, 3];

    source.take(expected.length).addListener({
      next (ev) {
        assert.equal(ev, expected.shift());
      },

      error (err) {
        done(err);
      },

      complete () {
        done();
      }
    });

    source$.shamefullySendNext(1);

    pause$.shamefullySendNext(false);

    setTimeout(() => {
      source$.shamefullySendNext(2);

      pause$.shamefullySendNext(true);

      source$.shamefullySendNext(3);
    }, 5);
  });

  describe('sources.log$', () => {
    it('is observable', (done) => {
      const testSubject = xs.create();
      const testDriver = () => testSubject;

      const driver = restartable(testDriver)();

      driver.log$.take(1).addListener({
        next (log) {
          assert.deepEqual(log, []);
        },

        error (err) {
          done(err);
        },

        complete () {
          done();
        }
      });
    });

    it('emits updates', (done) => {
      const testSubject = xs.create();
      const testDriver = () => testSubject;

      const driver = restartable(testDriver)();
      driver.addListener(shittyListener);

      const expectations = [
        log => assert.deepEqual(log, []),
        log => {
          const loggedEvent = log[0];

          assert.deepEqual(loggedEvent.identifier, ':root');
          assert.deepEqual(loggedEvent.event, 'foo');
        }
      ];

      driver.log$.take(expectations.length).addListener({
        next (log) {
          expectations.shift()(log);
        },

        error: done,

        complete: done
      });

      testSubject.shamefullySendNext('foo');
    });

    it('shares the last value upon subscription', (done) => {
      const testSubject = xs.create();
      const testDriver = () => testSubject;

      const driver = restartable(testDriver)();
      driver.addListener(shittyListener);

      testSubject.shamefullySendNext('foo');
      testSubject.shamefullySendNext('foo');

      const expectations = [
        log => assert.deepEqual(log.length, 2)
      ];

      driver.log$.take(expectations.length).addListener({
        next (log) {
          expectations.shift()(log);
        },

        error: done,
        complete: done
      });
    });

    it('handles selector style drivers', (done) => {
      const testSubject = xs.create();
      const testDriver = () => {
        return {
          select: (foo) => testSubject
        };
      };

      const driver = restartable(testDriver)();

      driver.select('snaz').addListener(shittyListener);

      testSubject.shamefullySendNext('foo');
      testSubject.shamefullySendNext('foo');

      const expectations = [
        log => {
          assert.equal(log[0].identifier, 'snaz');
          assert.equal(log[0].event, 'foo');

          assert.equal(log.length, 2);
        }
      ];

      driver.log$.take(expectations.length).addListener({
        next (log) {
          expectations.shift()(log);
        },

        error: done,
        complete: done
      });
    });
  });

  describe('replayLog', () => {
    it('schedules the events in the provided log$', (done) => {
      const scheduler = Scheduler();

      const testSubject = xs.create();
      const testDriver = () => testSubject;
      const restartableTestDriver = restartable(testDriver);

      const driver = restartableTestDriver();

      driver.drop(1).take(1).addListener({
        next (val) {
          assert.equal(val, 'snaz');
          done();
        },

        error: done,
        complete: () => {}
      });

      testSubject.shamefullySendNext('snaz');

      assert.equal(scheduler.queue.length, 0, 'schedule is empty to start');

      restartableTestDriver.replayLog(scheduler, driver.log$);

      assert.equal(scheduler.queue.length, 1, 'schedule has an event after replayLog');

      scheduler.start();
    });

    it('options takes a time to replay to', (done) => {
      const scheduler = Scheduler();

      const testSubject = xs.create();
      const testDriver = () => testSubject;
      const restartableTestDriver = restartable(testDriver);

      const driver = restartableTestDriver();

      driver.drop(2).take(1).addListener({
        next (val) {
          assert.equal(val, 'snaz');
          done();
        },

        error: done,
        complete: () => {}
      });

      testSubject.shamefullySendNext('snaz');

      const timeToResetTo = new Date();

      setTimeout(() => {
        testSubject.shamefullySendNext('snaz2');

        setTimeout(() => {
          restartableTestDriver.replayLog(scheduler, driver.log$, timeToResetTo);

          scheduler.start();
        }, 50);
      });
    });
  });
});
