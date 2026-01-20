// ============================================================================
// GYMROLL - MAIN JAVASCRIPT FILE
// ============================================================================
// This file handles workout generation, saving, and all user interactions
// ============================================================================

// Attach click event listener to the Generate button
// When clicked, it will call the getWorkout() function
document.getElementById("generateBtn").addEventListener("click", getWorkout);
let currentWorkoutData = null;  // Stores the currently generated workout data
let saveButtonListener = null;  // Reference to save button event listener (for cleanup)

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Picks k random items from an array without repetition
 * @param {Array} arr - The array to pick from
 * @param {Number} k - Number of items to pick
 * @returns {Array} Array of randomly selected items
 */
function pickRandomNoRepeat(arr, k) {
  const copy = arr.slice();  // Create a copy to avoid modifying original array
  const picked = [];
  // Pick k items randomly
  for (let i = 0; i < k && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);  // Remove picked item to avoid duplicates
  }
  return picked;
}

/**
 * Sanitizes HTML strings to prevent XSS (Cross-Site Scripting) attacks
 * Converts special characters to HTML entities
 * @param {String} str - String to sanitize
 * @returns {String} Sanitized HTML string
 */
function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;  // textContent automatically escapes HTML
  return div.innerHTML;   // Return escaped HTML
}

/**
 * Checks if localStorage is available in the browser
 * Some browsers disable it in private mode or it may not be supported
 * @returns {Boolean} True if localStorage is available, false otherwise
 */
function isLocalStorageAvailable() {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Normalizes text by trimming and converting to lowercase.
 * @param {String} str - Text to normalize
 * @returns {String} Normalized string
 */
function normalizeText(str) {
  return (str || '').toString().trim().toLowerCase();
}

const MATERIAL_LABELS = {
  bodyweight: 'Bodyweight',
  dumbbell: 'Dumbbells',
  kettlebell: 'Kettlebells',
  barbell: 'Barbell',
  band: 'Resistance Bands',
  machine: 'Machines / Smith',
  bench: 'Bench / Box',
  cable: 'Cables / Pulleys',
  ball: 'Med / Stability Balls',
  suspension: 'Suspension / TRX',
  other: 'Other Specialty Gear'
};

let selectedMaterials = new Set(['bodyweight']);

// Muscle selector state
const muscleSelection = {
  mode: 'macro', // 'macro' or 'specific'
  macro: 'Upper',
  specifics: new Set()
};

function getSelectedMuscleSummary() {
  if (muscleSelection.mode === 'macro') return muscleSelection.macro;
  if (!muscleSelection.specifics || muscleSelection.specifics.size === 0) return 'All specific';
  return Array.from(muscleSelection.specifics).join(', ');
}

function getSelectedMuscle() {
  // Returns either a macro string (Upper/Lower/Core/Full) or a Set of specific bodyparts
  if (muscleSelection.mode === 'macro') return muscleSelection.macro;
  return new Set(muscleSelection.specifics);
}

// Keyword lists used for intensity inference based on equipment type
const EASY_EQUIPMENT_KEYWORDS = ['body weight', 'bodyweight', 'no equipment', 'none', 'yoga', 'pilates', 'stretch', 'mobility', 'floor', 'mat'];
const HARD_EQUIPMENT_KEYWORDS = ['barbell', 'smith', 'lever', 'trap bar', 'weighted', 'sled', 'machine', 'plate', 'cable', 'rack'];
const MEDIUM_EQUIPMENT_KEYWORDS = ['dumbbell', 'kettlebell', 'medicine ball', 'band', 'resistance band', 'rope', 'roller', 'ball', 'chair', 'bench'];

/**
 * Determines whether an exercise only requires bodyweight (no equipment).
 * @param {String} equipment - Equipment description from dataset
 * @returns {Boolean} True if bodyweight-only, false otherwise
 */
function isBodyweightOnly(equipment) {
  const eq = normalizeText(equipment);
  if (!eq) return true;
  return eq.includes('body weight') || eq.includes('bodyweight') || eq.includes('no equipment') || eq === 'none';
}

/**
 * Infers an intensity label (Easy/Medium/Hard) based on equipment requirements.
 * The dataset does not include explicit intensity, so this provides a best-effort mapping.
 * @param {String} equipment - Equipment description from dataset
 * @returns {String} Intensity label
 */
function inferIntensityFromEquipment(equipment) {
  const eq = normalizeText(equipment);
  if (!eq) return 'Medium';
  if (EASY_EQUIPMENT_KEYWORDS.some(keyword => eq.includes(keyword))) return 'Easy';
  if (HARD_EQUIPMENT_KEYWORDS.some(keyword => eq.includes(keyword))) return 'Hard';
  if (MEDIUM_EQUIPMENT_KEYWORDS.some(keyword => eq.includes(keyword))) return 'Medium';
  return 'Medium';
}

function mapEquipmentToTag(equipment) {
  const eq = normalizeText(equipment);
  if (!eq || eq.includes('body weight') || eq.includes('bodyweight') || eq.includes('no equipment') || eq === 'none') {
    return 'bodyweight';
  }
  if (eq.includes('dumbbell') || eq.includes('db')) return 'dumbbell';
  if (eq.includes('kettlebell') || eq.includes('kb')) return 'kettlebell';
  if (eq.includes('barbell') || eq.includes('trap bar')) return 'barbell';
  if (eq.includes('band') || eq.includes('resistance')) return 'band';
  if (eq.includes('machine') || eq.includes('smith') || eq.includes('lever') || eq.includes('hammer strength') || eq.includes('sled')) return 'machine';
  if (eq.includes('bench') || eq.includes('box') || eq.includes('step') || eq.includes('chair')) return 'bench';
  if (eq.includes('cable') || eq.includes('pulley') || eq.includes('lat pull')) return 'cable';
  if (eq.includes('ball') || eq.includes('bosu') || eq.includes('medicine') || eq.includes('stability') || eq.includes('swiss')) return 'ball';
  if (eq.includes('trx') || eq.includes('suspension')) return 'suspension';
  return 'other';
}

function getSelectedMaterialsSummary() {
  if (!selectedMaterials || selectedMaterials.size === 0 || (selectedMaterials.size === 1 && selectedMaterials.has('bodyweight'))) {
    return 'Bodyweight only';
  }
  const readable = Array.from(selectedMaterials)
    .filter(tag => tag !== 'bodyweight')
    .map(tag => MATERIAL_LABELS[tag] || tag);
  return readable.join(', ');
}

function getSelectedMaterials() {
  if (!selectedMaterials || selectedMaterials.size === 0) {
    return new Set(['bodyweight']);
  }
  return new Set(selectedMaterials);
}

function initializeMaterialsSelector() {
  const toggleBtn = document.getElementById('materialsToggle');
  const card = document.getElementById('materialsCard');
  const closeBtn = document.getElementById('materialsClose');
  const applyBtn = document.getElementById('materialsApply');
  const summaryEl = document.getElementById('materialsSummary');
  // Limit inputs to those inside the materials card so muscle controls don't get mixed in
  const inputs = Array.from(document.querySelectorAll('#materialsCard .material-option input'));

  if (!toggleBtn || !card || !summaryEl || inputs.length === 0) return;

  const openCard = () => {
    card.classList.add('open');
    card.setAttribute('aria-hidden', 'false');
  };

  const closeCard = () => {
    card.classList.remove('open');
    card.setAttribute('aria-hidden', 'true');
  };

  toggleBtn.addEventListener('click', () => {
    if (card.classList.contains('open')) {
      closeCard();
    } else {
      openCard();
    }
  });

  [closeBtn, applyBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', closeCard);
  });

  document.addEventListener('click', event => {
    if (!card.contains(event.target) && !toggleBtn.contains(event.target) && card.classList.contains('open')) {
      closeCard();
    }
  });

  const updateSelectedMaterialsState = () => {
    const checkedValues = inputs.filter(input => input.checked).map(input => input.value);
    selectedMaterials = new Set(checkedValues);
    if (selectedMaterials.size === 0) {
      selectedMaterials.add('bodyweight');
    }
    summaryEl.textContent = getSelectedMaterialsSummary();
  };

  inputs.forEach(input => {
    if (input.checked) selectedMaterials.add(input.value);
    input.addEventListener('change', updateSelectedMaterialsState);
  });

  updateSelectedMaterialsState();
}

initializeMaterialsSelector();

function initializeMuscleSelector() {
  const toggleBtn = document.getElementById('muscleToggle');
  const card = document.getElementById('muscleCard');
  const closeBtn = document.getElementById('muscleClose');
  const applyBtn = document.getElementById('muscleApply');
  const summaryEl = document.getElementById('muscleSummary');
  const modeMacroBtn = document.getElementById('muscleModeMacro');
  const modeSpecificBtn = document.getElementById('muscleModeSpecific');
  const macroContainer = document.getElementById('muscleMacroOptions');
  const specificContainer = document.getElementById('muscleSpecificOptions');

  if (!toggleBtn || !card || !summaryEl) return;

  const openCard = () => { card.classList.add('open'); card.setAttribute('aria-hidden', 'false'); };
  const closeCard = () => { card.classList.remove('open'); card.setAttribute('aria-hidden', 'true'); };

  // Gather control inputs (radios and specific checkboxes) safely
  const radios = Array.from(document.querySelectorAll('input[name="muscleMacro"]'));
  const specInputs = Array.from(document.querySelectorAll('#muscleSpecificOptions input[type="checkbox"]'));

  // Initialize UI visibility based on current mode
  if (muscleSelection.mode === 'macro') {
    if (macroContainer) macroContainer.style.display = '';
    if (specificContainer) specificContainer.style.display = 'none';
  } else {
    if (macroContainer) macroContainer.style.display = 'none';
    if (specificContainer) specificContainer.style.display = '';
  }

  // Reflect current selection state in the controls
  radios.forEach(r => { r.checked = (r.value === muscleSelection.macro); });
  specInputs.forEach(cb => { cb.checked = muscleSelection.specifics.has(cb.value); });

  toggleBtn.addEventListener('click', () => { card.classList.contains('open') ? closeCard() : openCard(); });
  if (closeBtn) closeBtn.addEventListener('click', closeCard);

  if (applyBtn) applyBtn.addEventListener('click', () => { summaryEl.textContent = getSelectedMuscleSummary(); closeCard(); });

  document.addEventListener('click', event => {
    if (!card.contains(event.target) && !toggleBtn.contains(event.target) && card.classList.contains('open')) closeCard();
  });

  // Mode buttons: ensure switching enforces single macro OR multiple specifics
  if (modeMacroBtn) modeMacroBtn.addEventListener('click', () => {
    muscleSelection.mode = 'macro';
    if (macroContainer) macroContainer.style.display = '';
    if (specificContainer) specificContainer.style.display = 'none';
    // Clear specific selections
    specInputs.forEach(cb => { cb.checked = false; });
    muscleSelection.specifics.clear();
    // Ensure a radio is selected (keep existing macro or default)
    radios.forEach(r => r.checked = (r.value === muscleSelection.macro));
    modeMacroBtn.style.background = '';
    if (modeSpecificBtn) modeSpecificBtn.style.background = 'transparent';
  });

  if (modeSpecificBtn) modeSpecificBtn.addEventListener('click', () => {
    muscleSelection.mode = 'specific';
    if (macroContainer) macroContainer.style.display = 'none';
    if (specificContainer) specificContainer.style.display = '';
    // Start with no specifics selected (user can pick multiple)
    muscleSelection.specifics.clear();
    specInputs.forEach(cb => { cb.checked = false; });
    modeSpecificBtn.style.background = '';
    if (modeMacroBtn) modeMacroBtn.style.background = 'transparent';
  });

  // Macro radio change -> set single macro
  radios.forEach(r => r.addEventListener('change', (e) => { if (e.target.checked) muscleSelection.macro = e.target.value; }));

  // Specific checkboxes -> can select multiple
  specInputs.forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) muscleSelection.specifics.add(cb.value);
      else muscleSelection.specifics.delete(cb.value);

      // Update summary immediately for real-time feedback
      summaryEl.textContent = getSelectedMuscleSummary();
    });
  });

  // Initialize summary
  summaryEl.textContent = getSelectedMuscleSummary();
}

initializeMuscleSelector();

// ============================================================================
// BODY DIAGRAM SVG INTERACTION (CodePen-inspired)
// ============================================================================
// Connect SVG muscle groups with checkboxes using the CodePen approach

function initializeBodyDiagram() {
  const svg = document.getElementById('bodyDiagramSVG');

  if (!svg) return;

  // Prevent double initialization
  if (svg.hasAttribute('data-initialized')) return;
  svg.setAttribute('data-initialized', 'true');

  // SVG is now inline, so we can directly query it
  const muscleGroups = svg.querySelectorAll("g[id]");

  muscleGroups.forEach(function (group) {
    // Skip the container groups
    if (group.id === 'Back-Muscles' || group.id === 'Front-Muscles') return;

    // For the hover effect
    group.addEventListener('mouseover', function (el) {
      const id = group.id.toLowerCase();
      if (!id) return;

      // Find the corresponding label
      const label = document.querySelector("label[for=" + id + "]");
      if (label) {
        label.classList.add("hover");
      }
    });

    group.addEventListener('mouseout', function (el) {
      const id = group.id.toLowerCase();
      if (!id) return;

      // Find the corresponding label
      const label = document.querySelector("label[for=" + id + "]");
      if (label) {
        label.classList.remove("hover");
      }
    });

    // For the click - toggle checkbox
    group.addEventListener('click', function (el) {
      const id = group.id.toLowerCase();
      if (!id) return;

      // Find and toggle the checkbox
      const input = document.getElementById(id);
      if (input) {
        input.checked = !input.checked;
        // Trigger change event so the muscleSelection gets updated
        input.dispatchEvent(new Event('change'));

        // Update visual state of SVG
        updateSVGMuscleState(group, input.checked);
      }
    });
  });

  // Initialize visual states for any already-checked checkboxes
  const checkboxes = document.querySelectorAll('#muscleSpecificOptions input[type="checkbox"]');
  checkboxes.forEach(function (checkbox) {
    const muscleId = checkbox.id.charAt(0).toUpperCase() + checkbox.id.slice(1);
    const muscleGroup = svg.querySelector(`#${muscleId}`);
    if (muscleGroup && checkbox.checked) {
      updateSVGMuscleState(muscleGroup, true);
    }

    // Add change listener to update SVG when checkbox is clicked directly
    checkbox.addEventListener('change', function () {
      if (muscleGroup) {
        updateSVGMuscleState(muscleGroup, checkbox.checked);
      }
    });
  });
}

// Helper function to update SVG muscle visual state
function updateSVGMuscleState(svgGroup, isSelected) {
  if (isSelected) {
    svgGroup.classList.add('selected');
  } else {
    svgGroup.classList.remove('selected');
  }
}

// Initialize on load and when switching modes
document.addEventListener('DOMContentLoaded', () => {
  // Initialize body diagram when muscle selector mode changes to specific
  const modeSpecificBtn = document.getElementById('muscleModeSpecific');
  if (modeSpecificBtn) {
    modeSpecificBtn.addEventListener('click', () => {
      // Small delay to ensure SVG is in DOM/visible
      setTimeout(initializeBodyDiagram, 100);
    });
  }

  // Try to initialize immediately in case it's already visible
  setTimeout(initializeBodyDiagram, 500);
});

// ============================================================================
// WORKOUT SAVING FUNCTIONS
// ============================================================================

/**
 * Checks if a workout is already saved (duplicate detection)
 * Compares exercise lists to determine if workout already exists
 * @param {Object} workout - Workout object to check
 * @returns {Boolean} True if duplicate found, false otherwise
 */
function isDuplicateWorkout(workout) {
  if (!workout || !workout.exercises) return false;
  const saved = getSavedWorkouts();
  // Create a signature by sorting exercise titles
  const workoutSignature = JSON.stringify(workout.exercises.map(e => e.title).sort());

  // Check if any saved workout has the same signature
  return saved.some(savedWorkout => {
    const savedSignature = JSON.stringify(savedWorkout.exercises.map(e => e.title).sort());
    return savedSignature === workoutSignature;
  });
}

/**
 * Retrieves all saved workouts from localStorage
 * @returns {Array} Array of saved workout objects
 */
function getSavedWorkouts() {
  if (!isLocalStorageAvailable()) return [];
  try {
    // Parse JSON from localStorage, default to empty array if nothing exists
    return JSON.parse(localStorage.getItem('gymroll_saved_workouts') || '[]');
  } catch (e) {
    console.error('Error reading saved workouts:', e);
    return [];
  }
}

/**
 * Saves a workout to localStorage with error handling
 * @param {Object} workout - Workout object to save
 * @returns {Boolean} True if saved successfully, false otherwise
 */
function saveWorkoutToStorage(workout) {
  if (!isLocalStorageAvailable()) {
    showError('Local storage is not available. Please check your browser settings.');
    return false;
  }
  try {
    const savedWorkouts = getSavedWorkouts();
    savedWorkouts.push(workout);
    // Save updated array back to localStorage
    localStorage.setItem('gymroll_saved_workouts', JSON.stringify(savedWorkouts));
    return true;
  } catch (e) {
    // Handle specific error types
    if (e.name === 'QuotaExceededError') {
      showError('Storage limit reached. Please delete some saved workouts.');
    } else {
      showError('Failed to save workout: ' + e.message);
    }
    return false;
  }
}

/**
 * Displays an error message to the user
 * Message appears at top of screen and auto-dismisses after 5 seconds
 * @param {String} message - Error message to display
 */
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  // Inline styles for error message positioning and appearance
  errorDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #ff4444; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; max-width: 90%;';
  document.body.appendChild(errorDiv);
  // Auto-remove after 5 seconds
  setTimeout(() => errorDiv.remove(), 5000);
}

/**
 * Shows a custom modal dialog for naming the workout
 * Replaces browser's prompt() for better UX and mobile compatibility
 * @param {String} defaultName - Default name to pre-fill in input
 * @param {Function} callback - Function to call with the entered name
 */
function showNamePrompt(defaultName, callback) {
  // Create modal overlay (dark background)
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;';

  // Create modal content box
  const modalContent = document.createElement('div');
  modalContent.style.cssText = 'background: var(--gray); padding: 30px; border-radius: 12px; max-width: 90%; width: 400px;';

  // Modal title
  const title = document.createElement('h3');
  title.textContent = 'Save Workout';
  title.style.cssText = 'margin: 0 0 15px 0; color: var(--accent);';

  // Input field for workout name
  const input = document.createElement('input');
  input.type = 'text';
  input.value = defaultName;
  input.style.cssText = 'width: 100%; padding: 12px; margin-bottom: 15px; background: var(--bg); color: var(--text); border: 2px solid var(--accent); border-radius: 8px; font-size: 1rem; box-sizing: border-box;';
  input.select();  // Select all text for easy editing

  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding: 10px 20px; background: transparent; color: var(--text); border: 2px solid var(--gray); border-radius: 8px; cursor: pointer;';
  cancelBtn.onclick = () => modal.remove();  // Close modal on cancel

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'padding: 10px 20px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;';
  saveBtn.onclick = () => {
    const name = input.value.trim() || defaultName;  // Use default if empty
    modal.remove();
    callback(name);  // Call callback with entered name
  };

  // Keyboard shortcuts: Enter to save, Escape to cancel
  input.onkeydown = (e) => {
    if (e.key === 'Enter') saveBtn.click();
    if (e.key === 'Escape') cancelBtn.click();
  };

  // Assemble modal structure
  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);
  modalContent.appendChild(title);
  modalContent.appendChild(input);
  modalContent.appendChild(buttonContainer);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  input.focus();  // Focus input for immediate typing
}

// ============================================================================
// MAIN WORKOUT GENERATION FUNCTION
// ============================================================================

/**
 * Main async function that generates a random workout based on user preferences
 * Fetches exercise data from JSON, filters by criteria, and displays results
 */
async function getWorkout() {
  // Get user-selected preferences from form controls
  const length = document.getElementById('length').value;
  const intensity = document.getElementById('intensity').value;
  const muscleChoice = getSelectedMuscle(); // could be macro string or Set of specifics
  const selectedMaterialsSet = getSelectedMaterials();
  const materialsSummary = getSelectedMaterialsSummary();
  const muscleSummary = getSelectedMuscleSummary();

  // ------------------------------------------------------------------------
  // Show loading state
  // ------------------------------------------------------------------------
  const generateBtn = document.getElementById('generateBtn');
  const workoutResultEl = document.getElementById('workoutResult');
  const originalBtnContent = generateBtn.innerHTML;

  // Disable button and show loading
  generateBtn.disabled = true;
  generateBtn.style.opacity = '0.6';
  generateBtn.style.cursor = 'not-allowed';
  generateBtn.innerHTML = '<span class="text">Generating...</span>';

  // Show loading message
  workoutResultEl.innerHTML = '<p style="color: var(--accent); font-size: 1rem;">🔄 Generating your workout...</p>';

  // ------------------------------------------------------------------------
  // Load the local JSON dataset
  // ------------------------------------------------------------------------
  let dataset = [];
  try {
    const resp = await fetch('exercises_final.json');
    if (resp.ok) {
      dataset = await resp.json();
    } else {
      throw new Error(`Failed to load exercises: ${resp.status} ${resp.statusText}`);
    }
  } catch (e) {
    // Re-enable button
    generateBtn.disabled = false;
    generateBtn.style.opacity = '1';
    generateBtn.style.cursor = 'pointer';
    generateBtn.innerHTML = originalBtnContent;

    workoutResultEl.innerHTML = `<p style="color: #ff4444;">❌ Could not load exercises. Please check your internet connection and try again.</p>`;
    console.error('Error loading exercises:', e);
    return;
  }

  if (!Array.isArray(dataset) || dataset.length === 0) {
    // Re-enable button
    generateBtn.disabled = false;
    generateBtn.style.opacity = '1';
    generateBtn.style.cursor = 'pointer';
    generateBtn.innerHTML = originalBtnContent;

    workoutResultEl.innerText = "Could not load exercises JSON (check path or format).";
    return;
  }


  // Normalize dataset for easier filtering
  const normalizedExercises = dataset
    .filter(item => item && item.name && item.macro_group)
    .map(item => {
      const displayName = item.name || 'Exercise';
      const equipmentLabel = (item.equipment || 'Body weight').toString().trim();

      // Extract muscles array - this is now the primary muscle field
      const muscles = Array.isArray(item.muscles) ? item.muscles : [];
      const primaryMuscle = muscles.length > 0 ? muscles[0] : '';

      return {
        displayName,
        macroNormalized: normalizeText(item.macro_group),
        muscles: muscles.map(m => normalizeText(m)), // Array of normalized muscle names
        primaryMuscleNormalized: normalizeText(primaryMuscle),
        equipmentLabel,
        intensityLabel: inferIntensityFromEquipment(item.equipment),
        gif: item.gif || '',
        instructions: Array.isArray(item.instructions) ? item.instructions : []
      };
    });


  if (normalizedExercises.length === 0) {
    document.getElementById('workoutResult').innerText = "No exercises available in the dataset.";
    return;
  }

  // ------------------------------------------------------------------------
  // Filter by muscle group (supports macro or specific selections)
  // ------------------------------------------------------------------------
  let filtered = [];
  if (typeof muscleChoice === 'string') {
    const targetMus = normalizeText(muscleChoice);
    if (targetMus === 'full') {
      filtered = normalizedExercises;
    } else {
      filtered = normalizedExercises.filter(ex => ex.macroNormalized === targetMus);
    }
  } else if (muscleChoice instanceof Set) {
    // Validate that user selected at least one specific muscle
    if (muscleChoice.size === 0) {
      // Re-enable button
      generateBtn.disabled = false;
      generateBtn.style.opacity = '1';
      generateBtn.style.cursor = 'pointer';
      generateBtn.innerHTML = originalBtnContent;

      workoutResultEl.innerHTML = '<p style="color: #ff4444;">⚠️ Please select at least one specific muscle group from the menu.</p>';
      return;
    }

    const specifics = new Set(Array.from(muscleChoice).map(s => normalizeText(s)));
    // Filter exercises where at least one muscle in the muscles array matches the selected specifics
    filtered = normalizedExercises.filter(ex =>
      ex.muscles.some(muscle => specifics.has(muscle))
    );
  }

  if (!filtered || filtered.length === 0) {
    // Re-enable button
    generateBtn.disabled = false;
    generateBtn.style.opacity = '1';
    generateBtn.style.cursor = 'pointer';
    generateBtn.innerHTML = originalBtnContent;

    workoutResultEl.innerText = "No workouts found for that muscle group.";
    return;
  }


  // ------------------------------------------------------------------------
  // Filter by materials (equipment)
  // ------------------------------------------------------------------------
  filtered = filtered.filter(ex => {
    const tag = mapEquipmentToTag(ex.equipmentLabel);
    if (tag === 'bodyweight') return true;
    if (tag === 'other') return selectedMaterialsSet.has('other');
    return selectedMaterialsSet.has(tag);
  });

  if (filtered.length === 0) {
    // Re-enable button
    generateBtn.disabled = false;
    generateBtn.style.opacity = '1';
    generateBtn.style.cursor = 'pointer';
    generateBtn.innerHTML = originalBtnContent;

    workoutResultEl.innerText = "No workouts available for the selected materials option.";
    return;
  }


  // ------------------------------------------------------------------------
  // Group by inferred intensity
  // ------------------------------------------------------------------------
  const easy = filtered.filter(ex => ex.intensityLabel === 'Easy');
  const medium = filtered.filter(ex => ex.intensityLabel === 'Medium');
  const hard = filtered.filter(ex => ex.intensityLabel === 'Hard');

  // Determine number of exercises
  const ranges = { 'Short': [1, 2], 'Medium': [3, 4], 'Long': [5, 6] };
  const rng = ranges[length] || ranges['Medium'];
  const count = Math.floor(Math.random() * (rng[1] - rng[0] + 1)) + rng[0];

  const exerciseKey = ex => `${ex.displayName}|${ex.macroNormalized}|${ex.equipmentLabel}`;

  // Build workout plan based on user-selected intensity
  let plan = [];
  if (intensity === 'Hard') {
    const nHard = Math.round(count * 0.75);
    const nMedium = count - nHard;
    plan = pickRandomNoRepeat(hard, nHard).concat(pickRandomNoRepeat(medium, nMedium));
  } else if (intensity === 'Easy') {
    const nEasy = Math.round(count * 0.75);
    const nMedium = count - nEasy;
    plan = pickRandomNoRepeat(easy, nEasy).concat(pickRandomNoRepeat(medium, nMedium));
  } else {
    const nMedium = Math.round(count * 0.6);
    const rest = count - nMedium;
    const nEasy = Math.floor(rest / 2);
    const nHard = rest - nEasy;
    plan = pickRandomNoRepeat(medium, nMedium).concat(pickRandomNoRepeat(easy, nEasy)).concat(pickRandomNoRepeat(hard, nHard));
  }

  // Fill in any leftover slots with random exercises (without duplicates)
  if (plan.length < count) {
    const needed = count - plan.length;
    const already = new Set(plan.map(exerciseKey));
    const candidates = filtered.filter(ex => !already.has(exerciseKey(ex)));
    plan = plan.concat(pickRandomNoRepeat(candidates, needed));
  }

  // Shuffle final plan for variety
  plan = plan.sort(() => Math.random() - 0.5).slice(0, count);

  // Store workout data for saving functionality
  currentWorkoutData = {
    exercises: plan.map(r => ({
      title: r.displayName,
      intensity: r.intensityLabel,
      materials: r.equipmentLabel
    })),
    settings: {
      length,
      intensity,
      muscle: muscleSummary,
      materials: materialsSummary
    },
    date: new Date().toISOString()
  };

  // Render workout results
  const outEl = document.getElementById('workoutResult');
  const exercisesHtml = plan.map(r => {
    const metaParts = [];
    if (r.intensityLabel) metaParts.push(`${r.intensityLabel} Intensity`);
    if (r.equipmentLabel) metaParts.push(`Equipment: ${r.equipmentLabel}`);
    const metaText = metaParts.length ? metaParts.join(' • ') : 'Details coming soon';
    const dataInstructions = encodeURIComponent(JSON.stringify(r.instructions || []));
    const dataTarget = encodeURIComponent(r.macroNormalized || r.bodypartNormalized || '');
    const dataGif = encodeURIComponent(r.gif || '');
    const dataMuscles = encodeURIComponent(JSON.stringify(r.muscles || []));
    const safeName = sanitizeHTML(r.displayName);
    const infoSvg = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.75 15.5h-1.5V11h1.5v6.5zM12 8.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`;
    return `
      <div class="exercise-row" style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
        <div style="text-align:left; max-width:80%;">
          <strong>${safeName}</strong>
          <div style="color:#999;font-size:0.9rem">(${metaText})</div>
        </div>
        <button class="exercise-info" aria-label="Show details for ${safeName}" title="Details"
          data-name="${safeName}"
          data-instructions="${dataInstructions}"
          data-target="${r.macroNormalized || ''}"
          data-gif="${dataGif}"
          data-muscles="${dataMuscles}"
          type="button">
          ${infoSvg}
        </button>
      </div>`;
  }).join('');


  const isDup = isDuplicateWorkout(currentWorkoutData);

  outEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 1.3rem;">Your Workout</h2>
      <button id="saveWorkoutBtn" class="save-btn" title="${isDup ? 'This workout is already saved' : 'Save workout'}" ${isDup ? 'disabled' : ''}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
      </button>
    </div>
    ${exercisesHtml}
  `;

  const saveBtn = document.getElementById('saveWorkoutBtn');
  if (saveButtonListener) {
    saveBtn.removeEventListener('click', saveButtonListener);
  }

  if (!isDup) {
    saveButtonListener = handleSaveWorkout;
    saveBtn.addEventListener('click', saveButtonListener);
  }

  // Re-enable generate button after successful generation
  generateBtn.disabled = false;
  generateBtn.style.opacity = '1';
  generateBtn.style.cursor = 'pointer';
  generateBtn.innerHTML = originalBtnContent;

}

/**
 * Handles the save workout button click
 * Shows naming prompt and saves workout to localStorage
 */
function handleSaveWorkout() {
  if (!currentWorkoutData) return;

  // Generate default workout name based on settings
  const defaultName = `${currentWorkoutData.settings.length} ${currentWorkoutData.settings.intensity} intensity for ${currentWorkoutData.settings.muscle} Groups`;

  // Double-check for duplicates (in case user generated same workout again)
  if (isDuplicateWorkout(currentWorkoutData)) {
    showError('This workout is already saved!');
    return;
  }

  // Show custom naming modal
  showNamePrompt(defaultName, (workoutName) => {
    // Get existing saved workouts
    const savedWorkouts = getSavedWorkouts();

    // Create workout object with unique ID and sanitized name
    const workoutToSave = {
      id: Date.now().toString(),  // Use timestamp as unique ID
      name: sanitizeHTML(workoutName.trim() || defaultName),
      ...currentWorkoutData  // Spread all workout data
    };

    // Save to localStorage
    if (saveWorkoutToStorage(workoutToSave)) {
      // Show success notification
      const successDiv = document.createElement('div');
      successDiv.className = 'success-message';
      successDiv.textContent = `Workout "${workoutName}" saved successfully!`;
      successDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4CAF50; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; max-width: 90%;';
      document.body.appendChild(successDiv);
      setTimeout(() => successDiv.remove(), 3000);  // Auto-dismiss after 3 seconds

      // Update save button to show it's been saved
      const saveBtn = document.getElementById('saveWorkoutBtn');
      saveBtn.style.opacity = '0.6';
      saveBtn.style.cursor = 'not-allowed';
      saveBtn.disabled = true;
      saveBtn.title = 'Workout saved!';
    }
  });
}

/**
 * Deletes a saved workout from localStorage
 * Used by the saved workouts page
 * @param {String} id - Unique ID of workout to delete
 * @returns {Boolean} True if successful, false otherwise
 */
function deleteWorkout(id) {
  if (!isLocalStorageAvailable()) {
    showError('Local storage is not available.');
    return;
  }

  try {
    const savedWorkouts = getSavedWorkouts();
    // Filter out the workout with matching ID
    const filtered = savedWorkouts.filter(w => w.id !== id);
    // Save updated array back to localStorage
    localStorage.setItem('gymroll_saved_workouts', JSON.stringify(filtered));
    return true;
  } catch (e) {
    showError('Failed to delete workout: ' + e.message);
    return false;
  }
}

// ============================================================================
// GLOBAL EVENT LISTENER FOR EXERCISE INFO MODALS
// ============================================================================
// Delegate click for exercise info buttons to show a modal with details
// This is registered once at page load to avoid memory leaks
document.addEventListener('click', function (e) {
  const infoBtn = e.target.closest && e.target.closest('.exercise-info');
  if (!infoBtn) return;

  // Remove existing modal if present
  const existing = document.querySelector('.exercise-modal-overlay');
  if (existing) existing.remove();

  const name = infoBtn.getAttribute('data-name') || '';
  const instructionsJson = decodeURIComponent(infoBtn.getAttribute('data-instructions') || '%5B%5D');
  let instructions = [];
  try { instructions = JSON.parse(instructionsJson); } catch (err) { instructions = []; }
  const target = decodeURIComponent(infoBtn.getAttribute('data-target') || '');
  const gif = decodeURIComponent(infoBtn.getAttribute('data-gif') || '');
  const musclesJson = decodeURIComponent(infoBtn.getAttribute('data-muscles') || '%5B%5D');
  let muscles = [];
  try { muscles = JSON.parse(musclesJson); } catch (err) { muscles = []; }

  // Build modal elements
  const overlay = document.createElement('div');
  overlay.className = 'exercise-modal-overlay';

  const card = document.createElement('div');
  card.className = 'exercise-card';
  card.style.position = 'relative';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => {
    overlay.remove();
    if (fixedClose && fixedClose.parentNode) fixedClose.remove();
  };

  const title = document.createElement('h2');
  title.textContent = name; // Use textContent instead of innerHTML for better security

  const meta = document.createElement('div');
  meta.className = 'meta';
  const metas = [];
  if (target) metas.push(`Macro Group: ${sanitizeHTML(target)}`);
  if (muscles && muscles.length) {
    // Capitalize first letter of each muscle name for display
    const muscleNames = muscles.map(m => m.charAt(0).toUpperCase() + m.slice(1));
    metas.push(`Muscles: ${sanitizeHTML(muscleNames.join(', '))}`);
  }
  meta.textContent = metas.join(' • ');


  const instrDiv = document.createElement('div');
  instrDiv.className = 'instructions';
  if (Array.isArray(instructions) && instructions.length) {
    const ol = document.createElement('ol');
    instructions.forEach(step => {
      const li = document.createElement('li');
      li.textContent = (step || '').toString(); // Use textContent for security
      ol.appendChild(li);
    });
    instrDiv.appendChild(ol);
  } else {
    instrDiv.textContent = 'No instructions available.';
  }

  card.appendChild(closeBtn);
  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(instrDiv);

  if (gif) {
    const img = document.createElement('img');
    img.src = gif;
    img.alt = name + ' demonstration';
    card.appendChild(img);
  }

  overlay.appendChild(card);

  // Add a fixed close button so the user can always close the modal
  const fixedClose = document.createElement('button');
  fixedClose.className = 'exercise-modal-fixed-close';
  fixedClose.innerHTML = '&times;';
  fixedClose.setAttribute('aria-label', 'Close exercise details');
  fixedClose.onclick = () => {
    overlay.remove();
    fixedClose.remove();
  };
  document.body.appendChild(fixedClose);

  // Close modal when clicking outside
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) {
      overlay.remove();
      if (fixedClose && fixedClose.parentNode) fixedClose.remove();
    }
  });

  // Close modal with Escape key (accessibility improvement)
  const handleEscape = (ev) => {
    if (ev.key === 'Escape') {
      overlay.remove();
      if (fixedClose && fixedClose.parentNode) fixedClose.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(overlay);
});
