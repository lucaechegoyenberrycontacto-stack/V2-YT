// Calendar arithmetic operates on local date labels, independent of the viewer's zone.
(() => {
  const zone = 'America/Argentina/Cordoba';
  const day = (instant = new Date()) => new Intl.DateTimeFormat('sv-SE', {timeZone:zone}).format(instant);
  const offset = (date, days) => new Date(Date.parse(date+'T00:00:00Z') + days*86400000).toISOString().slice(0,10);
  const monday = date => offset(date, -((new Date(date+'T00:00:00Z').getUTCDay()+6)%7));
  const lifts = [
    ['Bench Press','Press banca con barra'],['Full Squat','Sentadilla con barra'],
    ['Deadlift','Peso muerto convencional'],['Barbell Standing Military Press','Press militar con barra'],
    ['full Zercher Squat','Sentadilla Zercher'],['Barbell Curl','Curl con barra']
  ];
  const key = name => String(name || '').trim().replace(/\s+/g,' ').toLowerCase();
  const lyftaNames = {2:'Bench Press',6:'Barbell Curl',7:'Deadlift',18:'Full Squat',382:'full Zercher Squat'};
  const catalogue = new Map(Object.keys(globalThis.EXERCISE_MUSCLE_SEED?.exercises || {}).map(name=>[key(name),name]));
  function exerciseName(ex) {
    return catalogue.get(key(ex.name)) || ex.name || lyftaNames[ex.exerciseId] || '';
  }
  function performed(set) {
    return ('completed' in set ? set.completed === true : true) &&
      (set.reps > 0 || Number(set.duration)>0 || Number(set.distance)>0);
  }
  function streak(rows,today=day()) {
    const days = new Set(rows.map(w=>w.date));
    let cursor=days.has(today)?today:offset(today,-1), n=0;
    while(days.has(cursor)){ n++; cursor=offset(cursor,-1); }
    return n;
  }
  function records(rows) {
    return lifts.map(([name,label])=>{
      let best=null;
      for(const w of rows) for(const [ei,e] of w.exercises.entries()){
        if(key(exerciseName(e))!==key(name)) continue;
        e.sets.forEach((s,si)=>{
          const unit=s.unit || (['manual','lyfta'].includes(w.source)?'kg':null);
          const kg=unit==='kg'?Number(s.weight):unit==='lb'?s.weight*0.45359237:null;
          if(!performed(s)||!(s.reps>0 && kg>0)) return;
          const tie=[w.date,w.startedAt?new Date(w.startedAt).toISOString():'',w.id||'',String(ei).padStart(8,'0'),String(si).padStart(8,'0')].join('|');
          const reps=Number(s.reps);
          if(!best || kg>best.kg || (kg===best.kg && (reps>best.reps || (reps===best.reps && tie<best.tie))))
            best={kg,reps,w,ei,si,tie};
        });
      }
      return {label,best};
    });
  }
  globalThis.FitnessHistory={day,offset,monday,streak,performed,records,exerciseName};
})();
