/* globals describe, it, before, after */
import assert from 'assert';
import {run} from '@cycle/core';
import {makeHTTPDriver} from '@cycle/http';

const http = require('http');

import {rerunner, restartable} from '../../src/restart';

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
      HTTP: restartable(makeHTTPDriver({eager: true}))
    };

    assert.equal(requestCount, 0);

    let rerun = rerunner(run);
    rerun(main, drivers);

    setTimeout(() => {
      assert.equal(
        requestCount, 1,
        `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
      );

      rerun(main, drivers);

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
      HTTP: restartable(makeHTTPDriver())
    };

    assert.equal(requestCount, 0);

    let rerun = rerunner(run);
    const {sinks} = rerun(main, drivers);

    sinks.responses$.take(1).subscribe(text => {
      assert.equal(text, 'Hello, world! - 1');

      assert.equal(
        requestCount, 1,
        `Expected requestCount to be 1 prior to restart, was ${requestCount}.`
      );

      const restartedSinks = rerun(main, drivers).sinks;

      restartedSinks.responses$.take(1).subscribe(text => {
        assert.equal(text, 'Hello, world! - 1');
        assert.equal(
          requestCount, 1,
          `Expected requestCount to be 1 after restart, was ${requestCount}.`
        );

        done();
      });
    });
  });

  function requestMain ({HTTP}) {
    const request$ = HTTP.flatMap(res$ => res$, (outer, inner) => {
      return inner.request;
    });

    return {
      HTTP: Observable.just('localhost:8532/a'),
      request$
    };
  }

  it('has the request available on the response', (done) => {
    requestCount = 0;

    const drivers = {
      HTTP: restartable(makeHTTPDriver())
    };

    assert.equal(requestCount, 0);

    let rerun = rerunner(run);
    const {sinks} = rerun(requestMain, drivers);

    sinks.request$.take(1).subscribe(text => {
      assert.equal(text.url, 'localhost:8532/a');

      const restartedSinks = rerun(requestMain, drivers).sinks;

      restartedSinks.request$.take(1).subscribe(text => {
        assert.equal(text.url, 'localhost:8532/a');

        done();
      });
    });
  });
});
