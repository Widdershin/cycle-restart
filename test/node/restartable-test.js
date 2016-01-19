/* globals describe, it, before, after */
import assert from 'assert';
import {restartable} from '../../src/restart';
import {Observable} from 'rx';


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
});
