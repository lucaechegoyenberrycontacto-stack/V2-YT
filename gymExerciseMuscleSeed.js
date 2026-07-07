// Static exercise -> muscle seed for the training module (gym.html). Hand-
// verified against the user's real ~1 year Lyfta history (59 exercises,
// 100% coverage) — do not regenerate or invent entries. Same role as
// gymMuscleEnum.js: pure data, no logic, loaded before gymPesasStore.js so
// the merged seed+override map is available synchronously.
//
// `discard`: exercise names with no usable data (reps=0/weight=0) —
// excluded entirely from import and manual entry.
// `exercises[name].primaryMuscle === null` (with isMobility:true) marks a
// mobility/stretch exercise — extracted from strength stats, not a "no
// muscle assigned" case (that's only for names absent from this map).
(function () {
  window.EXERCISE_MUSCLE_SEED = {
    discard: ['Run', 'Stationary Bike Run'],
    exercises: {
      'Barbell Curl': { primaryMuscle: 'Bíceps', secondaryMuscles: [] },
      'Barbell Standing Military Press': { primaryMuscle: 'Hombros', secondaryMuscles: ['Tríceps'] },
      'Behind Back Finger Curl': { primaryMuscle: 'Antebrazos', secondaryMuscles: [] },
      'Bench Press': { primaryMuscle: 'Pecho', secondaryMuscles: ['Tríceps', 'Hombros'] },
      'Bent Over Row': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Bíceps'] },
      'Biceps Curl': { primaryMuscle: 'Bíceps', secondaryMuscles: [] },
      'Cable High Row': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Bíceps'] },
      'Cable Kneeling High Low Anti Rotation Chop (male)': { primaryMuscle: 'Abdominales/Core', secondaryMuscles: [] },
      'Cable Lateral Pulldown with V-bar': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Bíceps'] },
      'Cable One Arm Lateral Raise': { primaryMuscle: 'Hombros', secondaryMuscles: [] },
      'Cable One Arm Wrist Curl': { primaryMuscle: 'Antebrazos', secondaryMuscles: [] },
      'Cable Seated One Arm Alternate Row': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Bíceps'] },
      'Cable Standing Face Pull (with rope)': { primaryMuscle: 'Hombros', secondaryMuscles: ['Espalda alta'] },
      'Cable Standing Fly': { primaryMuscle: 'Pecho', secondaryMuscles: [] },
      'Cable horizontal Pallof Press': { primaryMuscle: 'Abdominales/Core', secondaryMuscles: [] },
      'Chin-Up': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Bíceps'] },
      'Crunch Floor': { primaryMuscle: 'Abdominales/Core', secondaryMuscles: [] },
      'Deadlift': { primaryMuscle: 'Espalda baja', secondaryMuscles: ['Isquiotibiales', 'Glúteos'] },
      'Dumbbell Incline Bench Press': { primaryMuscle: 'Pecho', secondaryMuscles: ['Hombros', 'Tríceps'] },
      'Dumbbell Preacher Curl': { primaryMuscle: 'Bíceps', secondaryMuscles: [] },
      'Dumbbell Shrug': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Cuello'] },
      'Full Squat': { primaryMuscle: 'Cuádriceps', secondaryMuscles: ['Glúteos', 'Isquiotibiales'] },
      'Hack Calf Raise': { primaryMuscle: 'Gemelos', secondaryMuscles: [] },
      'Hammer Curl': { primaryMuscle: 'Bíceps', secondaryMuscles: ['Antebrazos'] },
      'Kettlebell Russian Twist': { primaryMuscle: 'Abdominales/Core', secondaryMuscles: [] },
      'Kneeling Hip Flexor Stretch': { primaryMuscle: null, secondaryMuscles: [], isMobility: true },
      'Landmine 180': { primaryMuscle: 'Abdominales/Core', secondaryMuscles: ['Hombros'] },
      'Lateral Raise': { primaryMuscle: 'Hombros', secondaryMuscles: [] },
      'Leg Raise Dragon Flag': { primaryMuscle: 'Abdominales/Core', secondaryMuscles: [] },
      'Lever Bent-over Row with V-bar': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Bíceps'] },
      'Lever Leg Extension': { primaryMuscle: 'Cuádriceps', secondaryMuscles: [] },
      'Lever Lying Leg Curl': { primaryMuscle: 'Isquiotibiales', secondaryMuscles: [] },
      'Lever Seated Row': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Bíceps'] },
      'Lever Seated Shoulder Press': { primaryMuscle: 'Hombros', secondaryMuscles: ['Tríceps'] },
      'Lying Neck Extension': { primaryMuscle: 'Cuello', secondaryMuscles: [] },
      'Lying Neck Flexion': { primaryMuscle: 'Cuello', secondaryMuscles: [] },
      'Medicine Ball Rotary Throw': { primaryMuscle: 'Abdominales/Core', secondaryMuscles: [] },
      'Neck Bridge Prone': { primaryMuscle: 'Cuello', secondaryMuscles: [] },
      'Neck Extensor And Rotational Stretch': { primaryMuscle: null, secondaryMuscles: [], isMobility: true },
      'Rear Fly': { primaryMuscle: 'Hombros', secondaryMuscles: ['Espalda alta'] },
      'Reverse Curl': { primaryMuscle: 'Antebrazos', secondaryMuscles: ['Bíceps'] },
      'Rowing': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Bíceps'] },
      'Seated Single Leg Hamstring Stretch': { primaryMuscle: null, secondaryMuscles: [], isMobility: true },
      'Shrug': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Cuello'] },
      'Sitting Rotational Hip Stretch': { primaryMuscle: null, secondaryMuscles: [], isMobility: true },
      'Sled Hack Squat': { primaryMuscle: 'Cuádriceps', secondaryMuscles: ['Glúteos'] },
      'Smith Calf Raise': { primaryMuscle: 'Gemelos', secondaryMuscles: [] },
      'Smith Incline Bench Press': { primaryMuscle: 'Pecho', secondaryMuscles: ['Hombros', 'Tríceps'] },
      'Smith Shrug': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Cuello'] },
      'Standing Bent Knee Hip Adductor Stretch': { primaryMuscle: null, secondaryMuscles: [], isMobility: true },
      'Standing Reach Down Hamstring Stretch': { primaryMuscle: null, secondaryMuscles: [], isMobility: true },
      'Straight Leg Deadlift': { primaryMuscle: 'Isquiotibiales', secondaryMuscles: ['Glúteos', 'Espalda baja'] },
      'Triceps Dip': { primaryMuscle: 'Tríceps', secondaryMuscles: ['Pecho'] },
      'Triceps Pushdown': { primaryMuscle: 'Tríceps', secondaryMuscles: [] },
      'Weighted Chin-Up': { primaryMuscle: 'Espalda alta', secondaryMuscles: ['Bíceps'] },
      'Weighted Side Lying Side Neck Raise': { primaryMuscle: 'Cuello', secondaryMuscles: [] },
      'Weighted Tricep Dips': { primaryMuscle: 'Tríceps', secondaryMuscles: ['Pecho'] },
      'Wheel Rollout': { primaryMuscle: 'Abdominales/Core', secondaryMuscles: [] },
      'full Zercher Squat': { primaryMuscle: 'Cuádriceps', secondaryMuscles: ['Espalda baja', 'Glúteos'] },
    },
  };
})();
