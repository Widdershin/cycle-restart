
/* globals describe, it, before, after */
import assert from 'assert';
import {run} from '@cycle/core';
import {button, makeDOMDriver} from '@cycle/dom';

const request = require('../../node_modules/@cycle/http/node_modules/superagent');

let requestCount = 0;

const config = [
  {
    pattern: '/',

    fixtures: function (match, params, headers) {
      return 'Hello, world! - ' + ++requestCount;
    },

    get: function (match, data) {
      return {text: data};
    }
  }
];

const superagentMock = require('superagent-mock')(request, config);

import {makeHTTPDriver} from '@cycle/http';

import restart from '../../src/restart';

import {Observable} from 'rx';

import $ from 'jquery';

let testContainerCount = 34534;

function makeTestContainer () {
  const selector = 'test-' + testContainerCount;
  const container = $(`<div class="${selector}">`);

  $(document.body).append(container);

  testContainerCount++;

  return {container, selector: '.' + selector};
}

describe('restarting a cycle app that makes http requests trigged by dom events', () => {
  function main ({DOM, HTTP}) {
    const responses$ = HTTP.mergeAll().map(res => res.text);
    const click$ = DOM.select('.click').events('click');

    return {
      DOM: Observable.just(button('.click', 'Click me!')),
      HTTP: click$.map(_ => '/'),
      responses$
    };
  }

  it('replays responses', (done) => {
    const {container, selector} = makeTestContainer();

    const drivers = {
      HTTP: makeHTTPDriver({eager: true}),
      DOM: makeDOMDriver(selector)
    };

    assert.equal(requestCount, 0);

    const {sources, sinks} = run(main, drivers);

    setTimeout(() => {
      $('.click').click();

      let responseText;

      sinks.responses$.take(1).subscribe(text => {
        responseText = text;
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
