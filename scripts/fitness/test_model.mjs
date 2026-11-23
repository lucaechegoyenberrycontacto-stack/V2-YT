import assert from 'node:assert/strict';
import '../../fitnessHistory.js';
import '../../gymMuscleEnum.js';
import '../../gymExerciseMuscleSeed.js';
import '../../gymMuscleFatigue.js';

const H=FitnessHistory, day='2026-11-22', monday='2026-11-23';
assert.equal(H.day(new Date('2026-11-23T02:59:59Z')),day);
assert.equal(H.day(new Date('2026-11-23T03:00:00Z')),monday);
assert.equal(H.monday(day),'2026-11-16');
const bench={id:'a',date:day,source:'lyfta',startedAt:day+'T21:00:00-03:00',
  exercises:[{name:'Bench Press',sets:[{reps:5,weight:80,rir:0},{reps:1,weight:100,completed:false}]}]};
const box={id:'b',date:day,exercises:[],cardio:{duration:20,subtype:'boxeo'}};
assert.equal(H.streak([bench,box],monday),1);
assert.equal(H.streak([bench,box],'2026-11-24'),0);
const resolver=name=>({...EXERCISE_MUSCLE_SEED.exercises[name],inMap:!!EXERCISE_MUSCLE_SEED.exercises[name]});
const model=(sessions,now)=>computeMuscleFatigue(sessions,DEFAULT_MUSCLE_FATIGUE_CONFIG,new Date(now),{},resolver);
const result=model([bench],bench.startedAt);
assert.equal(result.muscles.Pecho.score,20);
assert.equal(result.muscles['Tríceps'].score,10);
assert.equal(result.muscles.Pecho.evidence[0].id,'a');
const later=model([bench],'2026-12-22');
assert.equal(later.muscles.Pecho.score,0);
assert.equal(later.muscles.Pecho.lastTrainedAt,day);
const exercises=['Full Squat','full Zercher Squat','Hack Squat','Sin asignar'].map((name,i)=>({name,sets:[{weight:100+i,reps:6}]}));
const history=[bench,box,{...bench,id:'z',exercises}];
assert.deepEqual(H.records(history).map(r=>r.best?.kg),[80,100,undefined,undefined,101,undefined]);
assert(model(history,bench.startedAt).unassigned.includes('Sin asignar'));
console.log('OK calendario argentino, racha, PR por variante, roles, evidencia y decaimiento.');
