/* globals describe, it, before, after */
import assert from 'assert';
import {restartable} from '../../src/restart';
import {Observable, Subject} from 'rx';


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

  describe('sources.log', () => {
    it('exists', () => {
      const testSubject = new Subject();
      const testDriver = () => testSubject;

      const driver = restartable(testDriver)();

      assert.deepEqual(driver.log(), []);

      testSubject.onNext('foo');

      assert.equal(driver.log().length, 1);

      const loggedEvent = driver.log()[0];

      assert.deepEqual(loggedEvent.identifier, ':root');
      assert.deepEqual(loggedEvent.event, 'foo');
    });
  });
});
