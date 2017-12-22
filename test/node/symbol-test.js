/* globals describe, it*/
import assert from 'assert';
import {run} from '@cycle/run';
import {adapt} from '@cycle/run/lib/adapt';
import {makeDOMDriver} from '@cycle/dom';
import {rerunner, restartable} from '../../src/restart';
import xs from 'xstream';

describe('restartable', () => {
  const symbol = Symbol( 'test' );

  function driver( ) {
    return {
      [ symbol ]: 'example',
    };
  }

  it('should preserve symbols', () => {
    const sink = restartable( driver )();
    assert.equal( sink[ symbol ], 'example' );
  });
});
