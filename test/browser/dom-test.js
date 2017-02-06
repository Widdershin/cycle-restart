/* globals describe, it*/
import assert from 'assert';
import run from '@cycle/xstream-run';
import {makeDOMDriver, div, button} from '@cycle/dom';

import {rerunner, restartable} from '../../src/restart';
import xs from 'xstream';

import $ from 'jquery';

let testContainerCount = 0;

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
      .fold((total, change) => total + change, 0)

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
      .fold((total, change) => total + change, 0)

    return {
      DOM: count$.map(count =>
        div('.app', [
          div('.count', count.toString()),
          button('.add', '+')
        ])
      )
    };
  }

  it('is possible', (done) => {
    let {container, selector} = makeTestContainer();

    const driversFn = () => ({
      DOM: restartable(makeDOMDriver(selector), {pauseSinksWhileReplaying: false})
    });

    let rerun = rerunner(run, driversFn);
    rerun(main, () => {
      container = $(selector);
      assert.equal(container.find('.count').text(), 0);

      container.find('.add').click();
      container.find('.add').click();
      container.find('.add').click();

      assert.equal(container.find('.count').text(), 3);

      rerun(newMain, () => {
        container = $(selector);
        assert.equal(container.find('.count').text(), 6);

        container.remove();
        done();
      });
    });
  });

  it('handles multiple restarts', (done) => {
    let {container, selector} = makeTestContainer();

    const driversFn = () => ({
      DOM: restartable(makeDOMDriver(selector), {pauseSinksWhileReplaying: false})
    });

    let rerun = rerunner(run, driversFn);

    rerun(main, () => {
      assert.equal(container.find('.count').text(), 0);

      container = $(selector);

      container.find('.add').click();
      container.find('.add').click();
      container.find('.add').click();

      assert.equal(container.find('.count').text(), 3, 'first run');

      rerun(main, () => {
        container = $(selector);
        assert.equal(container.find('.count').text(), 3);

        container.find('.add').click();
        container.find('.add').click();
        container.find('.add').click();

        assert.equal(container.find('.count').text(), 6);

        rerun(main, () => {
          container = $(selector);

          assert.equal(container.find('.count').text(), 6);

          container.remove();
          done();
        });
      });
    });
  });
});

describe('restarting a cycle app with multiple streams', () => {
  it('works', (done) => {
    let {container, selector} = makeTestContainer();

    function main ({DOM}) {
      const add$ = DOM
        .select('.add')
        .events('click')
        .map(() => 1);

      const subtract$ = DOM
        .select('.subtract')
        .events('click')
        .map(() => -1);

      const count$ = xs
        .merge(add$, subtract$)
        .fold((total, change) => total + change, 0);

      return {
        DOM: count$.map(count =>
          div('.app', [
            div('.count', count.toString()),
            button('.add', '+'),
            button('.subtract', '+')
          ])
        )
      };
    }

    const driversFn = () => ({
      DOM: restartable(makeDOMDriver(selector), {pauseSinksWhileReplaying: false})
    });

    let rerun = rerunner(run, driversFn);
    rerun(main, () => {
      container = $(selector);

      container.find('.add').click();
      container.find('.add').click();
      container.find('.add').click();

      assert.equal(container.find('.count').text(), 3);

      container.find('.subtract').click();
      container.find('.subtract').click();

      assert.equal(container.find('.count').text(), 1);

      rerun(main, () => {
        container = $(selector);

        assert.equal(container.find('.count').text(), 1);

        container.remove();
        done();
      });
    });
  });
});
