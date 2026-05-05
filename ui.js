/* ============================================================
   FormSense AI — UI Controller
   DOM updates for dashboard: gauges, angles, feedback, stats
   ============================================================ */

class UIController {
  constructor(engine) {
    this.engine = engine;
    this.lastReps = 0;
    this.gaugeCircumference = 2 * Math.PI * 46; // radius=46
    this.init();
  }

  init() {
    // Exercise selector buttons
    document.querySelectorAll('.exercise-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ex = btn.dataset.exercise;
        this.engine.setExercise(ex);
        document.querySelectorAll('.exercise-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateExerciseLabel();
        this.updateHoldTimerVisibility();
      });
    });

    // Set default active
    const defaultBtn = document.querySelector('[data-exercise="squat"]');
    if (defaultBtn) defaultBtn.classList.add('active');

    this.updateExerciseLabel();
  }

  // Called every frame from draw()
  update() {
    this.updateRepCounter();
    this.updateFormGauge();
    this.updateAngleBars();
    this.updateFeedback();
    this.updateBottomStats();
    this.updateCanvasOverlays();
    this.updateHoldTimer();
  }

  updateExerciseLabel() {
    const ex = this.engine.currentExercise;
    const info = EXERCISES[ex];
    const el = document.getElementById('canvas-exercise-label');
    if (el && info) {
      el.textContent = `${info.icon} ${info.label}`;
    }
  }

  updateRepCounter() {
    const el = document.getElementById('rep-count');
    if (!el) return;

    const reps = this.engine.reps;
    el.textContent = reps;

    if (reps !== this.lastReps) {
      el.classList.remove('bump');
      void el.offsetWidth; // force reflow
      el.classList.add('bump');
      this.lastReps = reps;
    }
  }

  updateHoldTimerVisibility() {
    const holdContainer = document.getElementById('hold-timer-wrap');
    const repContainer = document.getElementById('rep-counter-wrap');
    if (!holdContainer || !repContainer) return;

    const type = this.engine.getExerciseType();
    if (type === 'hold') {
      holdContainer.classList.add('active');
      repContainer.style.display = 'none';
    } else {
      holdContainer.classList.remove('active');
      repContainer.style.display = 'block';
    }
  }

  updateHoldTimer() {
    const el = document.getElementById('hold-time');
    if (!el) return;

    const type = this.engine.getExerciseType();
    if (type === 'hold') {
      el.textContent = this.engine.formatHold(this.engine.holdDuration);
      const container = document.getElementById('hold-timer-wrap');
      if (container) container.classList.add('active');
      const repWrap = document.getElementById('rep-counter-wrap');
      if (repWrap) repWrap.style.display = 'none';
    } else {
      const container = document.getElementById('hold-timer-wrap');
      if (container) container.classList.remove('active');
      const repWrap = document.getElementById('rep-counter-wrap');
      if (repWrap) repWrap.style.display = 'block';
    }
  }

  updateFormGauge() {
    const score = this.engine.formScore;
    const fillEl = document.getElementById('gauge-fill');
    const textEl = document.getElementById('gauge-value');
    if (!fillEl || !textEl) return;

    const offset = this.gaugeCircumference - (score / 100) * this.gaugeCircumference;
    fillEl.style.strokeDashoffset = offset;

    // Color based on score
    if (score >= 75) {
      fillEl.style.stroke = '#00ff88';
    } else if (score >= 50) {
      fillEl.style.stroke = '#ff9f43';
    } else {
      fillEl.style.stroke = '#ff4757';
    }

    textEl.textContent = `${score}%`;
  }

  updateAngleBars() {
    const container = document.getElementById('angle-bars');
    if (!container) return;

    const displayAngles = this.engine.getDisplayAngles();
    const items = container.querySelectorAll('.angle-item');

    displayAngles.forEach((angle, i) => {
      if (i >= items.length) return;
      const item = items[i];
      const nameEl = item.querySelector('.angle-name');
      const fillEl = item.querySelector('.angle-bar-fill');
      const valEl = item.querySelector('.angle-value');

      if (nameEl) nameEl.textContent = angle.name;
      
      const val = angle.value !== undefined ? Math.round(angle.value) : 0;
      if (valEl) valEl.textContent = val > 0 ? `${val}°` : '—';
      
      if (fillEl) {
        const pct = Math.min(100, (val / angle.max) * 100);
        fillEl.style.width = `${pct}%`;
        
        // Color based on ideal range
        fillEl.className = 'angle-bar-fill';
        const ideals = this.engine.getIdealAngles();
        const ideal = ideals[Object.keys(this.engine.angles).find(k => {
          const da = this.engine.getDisplayAngles();
          return da[i] && da[i].value === this.engine.angles[k];
        })];
        
        if (ideal && val > 0) {
          const diff = Math.abs(val - ideal.target);
          if (diff > ideal.ok) fillEl.classList.add('bad');
          else if (diff > ideal.good) fillEl.classList.add('warning');
        }
      }
    });
  }

  updateFeedback() {
    const container = document.getElementById('feedback-list');
    if (!container) return;

    const fb = this.engine.feedback;
    
    // Only update if feedback changed
    const key = fb.map(f => f.text).join('|');
    if (this._lastFeedbackKey === key) return;
    this._lastFeedbackKey = key;

    container.innerHTML = '';
    fb.forEach(item => {
      const div = document.createElement('div');
      div.className = `feedback-item ${item.type}`;
      div.innerHTML = `<span class="fb-icon">${item.icon}</span><span>${item.text}</span>`;
      container.appendChild(div);
    });
  }

  updateBottomStats() {
    const timeEl = document.getElementById('session-time');
    const totalEl = document.getElementById('total-reps');
    const avgEl = document.getElementById('avg-score');
    const streakEl = document.getElementById('streak-count');

    if (timeEl) timeEl.textContent = this.engine.getSessionTime();
    if (totalEl) totalEl.textContent = this.engine.totalReps;
    if (avgEl) avgEl.textContent = `${this.engine.avgScore}%`;
    if (streakEl) streakEl.textContent = this.engine.streak;
  }

  updateCanvasOverlays() {
    const repEl = document.getElementById('canvas-rep-display');
    if (repEl) {
      const type = this.engine.getExerciseType();
      if (type === 'hold') {
        repEl.textContent = `⏱ ${this.engine.formatHold(this.engine.holdDuration)}`;
      } else {
        repEl.textContent = `× ${this.engine.reps}`;
      }
    }
  }

  setModelReady() {
    const dot = document.querySelector('.status-dot');
    const text = document.getElementById('status-text');
    const overlay = document.getElementById('loading-overlay');

    if (dot) dot.classList.add('ready');
    if (text) text.textContent = 'Model Ready';
    if (overlay) overlay.classList.add('hidden');
  }
}
