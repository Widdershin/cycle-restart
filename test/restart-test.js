/* globals describe, it */
import assert from 'assert';
import {run} from '@cycle/core';
import {makeDOMDriver, div, button} from '@cycle/dom';
import restart from '../src/restart';

import {Observable} from 'rx';

import $ from 'jquery';

function makeTestContainer () {
  $(document.body).append($('<div class="test">'));
}

describe('restarting a cycle app', () => {
  it('is possible', (done) => {
    makeTestContainer();

    function main ({DOM}) {
      const count$ = DOM
        .select('.add')
        .events('click')
        .map(_ => 1)
        .scan((total, change) => total + change)
        .startWith(0);

      return {
        DOM: count$.map(count =>
          div('.app', [
            div('.count', count.toString()),
            button('.add', '+')
          ])
        )
      }
    }

    function newMain ({DOM}) {
      const count$ = DOM
        .select('.add')
        .events('click')
        .map(_ => 2)
        .scan((total, change) => total + change)
        .startWith(0);

      return {
        DOM: count$.map(count =>
          div('.app', [
            div('.count', count.toString()),
            button('.add', '+')
          ])
        )
      }
    }

    const drivers = {
      DOM: makeDOMDriver('.test')
    }

    const {sinks, sources} = run(main, drivers);

    setTimeout(() => {
      $('.add').click();
      $('.add').click();
      $('.add').click();

      assert.equal($('.count').text(), 3);

      restart(newMain, sources, drivers);

      setTimeout(() => {
        assert.equal($('.count').text(), 6);

        done();
      }, 100);
    }, 100);
  });
});
