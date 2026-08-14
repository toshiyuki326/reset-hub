import {initialEvents,initialMessages,initialTasks} from './mockData';import type {Event,LineMessage,Task} from '../types';
const key='reset-hub-fixture-v1';export type FixtureState={tasks:Task[];events:Event[];messages:LineMessage[]};
export function readFixtures():FixtureState{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):{tasks:initialTasks,events:initialEvents,messages:initialMessages}}catch{return {tasks:initialTasks,events:initialEvents,messages:initialMessages}}}
export function writeFixtures(value:FixtureState){localStorage.setItem(key,JSON.stringify(value))}
