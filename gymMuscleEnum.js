// Fixed muscle-group enum for the training module (gym.html). Single
// source of truth — exercise creation, the muscle map, and the fatigue
// config all reference this same list, never their own copy.
(function () {
  window.MUSCLE_GROUPS = [
    'Pecho', 'Espalda alta', 'Espalda baja', 'Hombros', 'Bíceps', 'Tríceps',
    'Antebrazos', 'Abdominales/Core', 'Cuádriceps', 'Isquiotibiales',
    'Glúteos', 'Gemelos', 'Cuello',
  ];
})();
