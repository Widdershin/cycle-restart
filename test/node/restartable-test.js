/* globals describe, it*/
import assert from 'assert';
import xs from 'xstream';
import debounce from 'xstream/extra/debounce';
import {mockTimeSource} from '@cycle/time';

import {restartable} from '../../src/restart';

const blankListener = {
  next: () => {},
  error: () => {},
  complete: () => {}
};

describe('restartable', () => {
  // TODO - how to check if stream is disposed in xstream
  it('disposes cleanly', (done) => {
    const Time = mockTimeSource();

    const emptyStream = xs.create();
    const testDriver = () => emptyStream;

    let called = false;

    emptyStream.dispose = () => {
      if (!called) {
        called = true;
        done();
      }
    }

    const source = restartable(testDriver)(xs.empty(), Time);

    source.dispose();
  });

  xit('totally disposes sources as well', (done) => {
    const Time = mockTimeSource();

    const testDriver = () => ({foo: () => xs.create()});

    const source = restartable(testDriver)(xs.empty(), Time);

    const stream = source.foo()

    assert.equal(stream._ils.length, 1);

    source.dispose();

    assert(stream.isDisposed);

    done();
  });

  it('handles write only drivers', (done) => {
    const Time = mockTimeSource();

    const testDriver = () => {};

    restartable(testDriver)(xs.empty(), Time);

    done();
  });

  it('handles read only drivers', (done) => {
    const Time = mockTimeSource();

    const testDriver = () => xs.empty();

    restartable(testDriver)();

    done();
  });

  it('pauses sinks', (done) => {
    const Time = mockTimeSource();

    let callCount = 0;
    const call$ = xs.create();
    const pause$ = xs.createWithMemory();

    pause$.shamefullySendNext(true);

    const testDriver = (sink$) => sink$.addListener({
      next: () => callCount++,
      error: done,
      complete: () => {}
    });

    restartable(testDriver, {pause$})(call$, Time);

    assert.equal(callCount, 0);

    call$.shamefullySendNext();

    assert.equal(callCount, 1);

    pause$.shamefullySendNext(false);

    call$.shamefullySendNext();

    assert.equal(callCount, 1);

    done();
  });

  it('pauses sources', (done) => {
    const Time = mockTimeSource();

    const source$ = xs.create();
    const pause$ = xs.createWithMemory();

    pause$.shamefullySendNext(true);

    const testDriver = () => source$;

    const source = restartable(testDriver, {pause$})(xs.empty(), Time);

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

    source$.shamefullySendNext(2);

    pause$.shamefullySendNext(true);

    source$.shamefullySendNext(3);
  });

  describe('sources.log$', () => {
    it('is observable', (done) => {
      const Time = mockTimeSource();
      const testSubject = xs.create();
      const testDriver = () => testSubject;

      const driver = restartable(testDriver)(xs.empty(), Time);

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
      driver.addListener(blankListener);

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
      driver.addListener(blankListener);

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

      const Time = mockTimeSource();

      const driver = restartable(testDriver)(xs.empty(), Time);

      driver.select('snaz').addListener(blankListener);

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
      const Time = mockTimeSource();

      const testSubject = xs.create();
      const testDriver = () => testSubject;
      const restartableTestDriver = restartable(testDriver);

      const driver = restartableTestDriver(xs.empty(), Time);

      driver.drop(1).take(1).addListener({
        next (val) {
          assert.equal(val, 'snaz');
          done();
        },

        error: done,
        complete: () => {}
      });

      testSubject.shamefullySendNext('snaz');

      restartableTestDriver.replayLog(Time._scheduler, driver.log$);

      Time.run();
    });

    xit('options takes a time to replay to', (done) => {
      const Time = mockTimeSource();

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
          restartableTestDriver.replayLog(Time._scheduler, driver.log$, timeToResetTo);

          Time.run();
        }, 50);
      });
    });
  });
});
