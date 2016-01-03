/* globals describe, it, before, after */
import assert from 'assert';
import {run} from '@cycle/core';
import {makeHTTPDriver} from '@cycle/http';

const http = require('http');

import restart from '../../src/restart';

import {Observable} from 'rx';

let requestCount = 0;

const server = http.createServer(function (req, res) {
  requestCount += 1;

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello, world! - ' + requestCount);
});

const PORT = 8532;

describe('restarting a cycle app that makes http requests', () => {
  before(() => server.listen(PORT));
  after(() => server.close());

  function main ({HTTP}) {
    const responses$ = HTTP.mergeAll().map(res => res.text);

    return {
      HTTP: Observable.just('localhost:8532/a'),
      responses$: responses$
    };
  }

  it('only makes requests the first time', (done) => {
    const drivers = {
      HTTP: makeHTTPDriver({eager: true})
    };

    assert.equal(requestCount, 0);

    const {sources} = run(main, drivers);

    setTimeout(() => {
      assert.equal(
        requestCount, 1,
        `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
      );

      restart(main, drivers, {sources});

      setTimeout(() => {
        assert.equal(
          requestCount, 1,
          `Expected requestCount to be 1 after restart, was ${requestCount}.`
        );

        done();
      }, 50);
    }, 50);
  });

  it('replays responses', (done) => {
    requestCount = 0;

    const drivers = {
      HTTP: makeHTTPDriver()
    };

    assert.equal(requestCount, 0);

    const {sources, sinks} = run(main, drivers);

    setTimeout(() => {
      sinks.responses$.take(1).subscribe(text => {
        assert.equal(text, 'Hello, world! - 1');

        assert.equal(
          requestCount, 1,
          `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
        );

        const restartedSinks = restart(main, drivers, {sources}).sinks;

        restartedSinks.responses$.take(1).subscribe(text => {
          assert.equal(text, 'Hello, world! - 1');
          assert.equal(
            requestCount, 1,
            `Expected requestCount to be 1 after restart, was ${requestCount}.`
          );

          done();
        });
      });
    }, 50);
  });
});
