/* globals describe, it, before, after */
import assert from 'assert';
import {restartable} from '../../src/restart';
import {Observable, Subject, HistoricalScheduler} from 'rx';


describe('restartable', () => {
  it('handles write only drivers', (done) => {
    const testDriver = () => {};

    restartable(testDriver)(Observable.empty());

    done();
  });

  it('handles read only drivers', (done) => {
    const testDriver = () => Observable.empty();

    restartable(testDriver)();

    done();
  });

  it('supports drivers that use startWith', (done) => {
    const testDriver = () => Observable.just('bar').delay(30).startWith('boo');

    restartable(testDriver)().take(1).subscribe((val) => {
      assert.equal(val, 'boo');

      done();
    });
  });

  it('supports selector style drivers that use startWith', (done) => {
    const testDriver = () => ({foo: (val) => Observable.just('bar').delay(30).startWith(val)});

    restartable(testDriver, {replayFirst: true})().foo('boo').take(1).subscribe((val) => {
      assert.equal('boo', val);

      done();
    });
  });

  it('supports drivers that dont need a replay', (done) => {
    const testSubject = new Subject();
    const testDriver = () => testSubject;

    testSubject.onNext('bar');

    restartable(testDriver)().take(1).subscribe((val) => {
      assert.equal('boo', val);

      restartable(testDriver)().take(1).subscribe((val) => {
        assert.equal('snaz', val);

        done();
      });

      testSubject.onNext('snaz');
    });

    testSubject.onNext('boo');
  });

  it('supports selector style drivers that dont need a replay', (done) => {
    const testSubject = new Subject();
    const testDriver = () => ({foo: (val) => testSubject});

    testSubject.onNext('bar');

    restartable(testDriver)().foo('boo').take(1).subscribe((val) => {
      assert.equal('boo', val);

      done();
    });

    testSubject.onNext('boo');
  });

  describe('sources.log$', () => {
    it('is observable', (done) => {
      const testSubject = new Subject();
      const testDriver = () => testSubject;

      const driver = restartable(testDriver)();

      driver.log$.subscribe(log => {
        assert.deepEqual(log, []);
        done();
      });
    });

    it('emits updates', (done) => {
      const testSubject = new Subject();
      const testDriver = () => testSubject;

      const driver = restartable(testDriver)();

      driver.log$.take(1).subscribe(log => {
        assert.deepEqual(log, []);
      });

      driver.log$.skip(1).take(1).subscribe(log => {
        const loggedEvent = log[0];

        assert.deepEqual(loggedEvent.identifier, ':root');
        assert.deepEqual(loggedEvent.event, 'foo');
        done();
      });

      testSubject.onNext('foo');
    });

    it('shares the last value upon subscription', (done) => {
      const testSubject = new Subject();
      const testDriver = () => testSubject;

      const driver = restartable(testDriver)();

      testSubject.onNext('foo');
      testSubject.onNext('foo');

      driver.log$.subscribe(log => {
        assert.equal(log.length, 2);
        done();
      });
    });

    it('handles selector style drivers', (done) => {
      const testSubject = new Subject();
      const testDriver = () => {
        return {
          select: (foo) => testSubject
        };
      };

      const driver = restartable(testDriver)();

      driver.select('snaz');

      testSubject.onNext('foo');
      testSubject.onNext('foo');

      driver.log$.subscribe(log => {
        assert.equal(log[0].identifier, 'snaz');
        assert.equal(log[0].event, 'foo');

        assert.equal(log.length, 2);

        done();
      });
    });
  });

  describe('replayLog', () => {
    it('schedules the events in the provided log$', (done) => {
      const scheduler = new HistoricalScheduler();

      const testSubject = new Subject();
      const testDriver = () => testSubject;
      const restartableTestDriver = restartable(testDriver);

      const driver = restartableTestDriver();

      testSubject.onNext('snaz');

      assert.equal(scheduler.queue.length, 0);

      restartableTestDriver.replayLog(scheduler, driver.log$);

      assert.equal(scheduler.queue.length, 1);

      driver.skip(1).subscribe(val => {
        assert.equal(val, 'snaz');
        done();
      });

      scheduler.start();
    });

    it('options takes a time to replay to', (done) => {
      const scheduler = new HistoricalScheduler();

      const testSubject = new Subject();
      const testDriver = () => testSubject;
      const restartableTestDriver = restartable(testDriver);

      const driver = restartableTestDriver();

      testSubject.onNext('snaz');

      const timeToResetTo = new Date();

      setTimeout(() => {
        testSubject.onNext('snaz2');

        setTimeout(() => {
          restartableTestDriver.replayLog(scheduler, driver.log$, timeToResetTo);

          driver.debounce(50).subscribe(val => {
            assert.equal(val, 'snaz');
            done();
          });

          scheduler.start();
        }, 50);
      });
    });
  });
});
