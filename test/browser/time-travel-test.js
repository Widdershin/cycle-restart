/* globals describe, it*/
import assert from 'assert';
import {run} from '@cycle/core';
import {makeDOMDriver, div, button} from '@cycle/dom';

import {rerunner, restartable} from '../../src/restart';

import $ from 'jquery';

let testContainerCount = 88888;

function makeTestContainer () {
  const selector = 'test-' + testContainerCount;
  const container = $(`<div class="${selector}">`);

  $(document.body).append(container);

  testContainerCount++;

  return {container, selector: '.' + selector};
}

describe('restarting a cycle app', () => {
  function main ({DOM}) {
    const count$ = DOM
      .select('.add')
      .events('click')
      .map(() => 1)
      .scan((total, change) => total + change)
      .startWith(0);

    return {
      DOM: count$.map(count =>
        div('.app', [
          div('.count', count.toString()),
          button('.add', '+')
        ])
      )
    };
  }

  function newMain ({DOM}) {
    const count$ = DOM
      .select('.add')
      .events('click')
      .map(() => 2)
      .scan((total, change) => total + change)
      .startWith(0);

    return {
      DOM: count$.map(count =>
        div('.app', [
          div('.count', count.toString()),
          button('.add', '+')
        ])
      )
    };
  }

  it('is posssible', (done) => {
    const {container, selector} = makeTestContainer();

    const drivers = {
      DOM: restartable(makeDOMDriver(selector), {pauseSinksWhileReplaying: false})
    };

    let rerun = rerunner(run);
    rerun(main, drivers);

    setTimeout(() => {
      container.find('.add').click();
      container.find('.add').click();

      const timeToResetTo = new Date();

      setTimeout(() => {
        container.find('.add').click();

        assert.equal(container.find('.count').text(), 3);

        rerun(newMain, drivers, timeToResetTo);

        setTimeout(() => {
          assert.equal(container.find('.count').text(), 4);

          container.remove();
          done();
        });
      });
    });
  });
});
