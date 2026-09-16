import test from 'node:test';
import assert from 'node:assert/strict';
import {nextRouteSelection,routeEndpointHighlight,routeStoppingCoordinate,isMapBackground} from '../app/route-interaction.js';
const place = id => ({feature_type:'exhibit',geometry:{type:'Point',coordinates:[1,2]},properties:{route_fixture_id:id}});
test('clicks set A then B, repeat location does not create a zero-length route, third starts a new route',()=>{
 const a=place('a'),b=place('b'),c=place('c');
 assert.deepEqual(nextRouteSelection(null,null,a),[a,null]);
 assert.deepEqual(nextRouteSelection(a,null,b),[a,b]);
 assert.deepEqual(nextRouteSelection(a,null,place('a')),[a,null]);
 assert.deepEqual(nextRouteSelection(a,b,c),[c,null]);
});
test('first-click marker uses approved stopping coordinate rather than exhibit position',()=>{
 const a=place('a');
 const network={connections:new Map([['a',[{coordinates:[[3,4],[5,6]]}]]])};
 assert.deepEqual(routeStoppingCoordinate(network,a),[3,4]);
 assert.equal(routeStoppingCoordinate(network,place('unconnected')),null);
});
test('background clears selection but a floor exhibit is selectable',()=>{
 assert.equal(isMapBackground(null),true);
 for(const layer of ['unit','footprint','level','building','venue']) assert.equal(isMapBackground({properties:{viewer_layer:layer}}),true);
 assert.equal(isMapBackground({feature_type:'exhibit',properties:{exhibit_type:'floor'}}),false);
 assert.equal(isMapBackground({feature_type:'fixture'}),false);
});

test('route endpoint highlights follow the current map selection',()=>{
 const a=place('a'), b=place('b');
 assert.equal(routeEndpointHighlight('from',a,null),'current');
 assert.equal(routeEndpointHighlight('from',a,b),'previous');
 assert.equal(routeEndpointHighlight('to',a,b),'current');
 assert.equal(routeEndpointHighlight('to',a,null),null);
});
