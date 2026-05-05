/* ============================================================
   FormSense AI — Pose Engine
   Angle math, exercise classification, rep counting, form analysis
   ============================================================ */

// MoveNet keypoint indices
const KP = {
  NOSE: 0,
  LEFT_EYE: 1, RIGHT_EYE: 2,
  LEFT_EAR: 3, RIGHT_EAR: 4,
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
  LEFT_WRIST: 9, RIGHT_WRIST: 10,
  LEFT_HIP: 11, RIGHT_HIP: 12,
  LEFT_KNEE: 13, RIGHT_KNEE: 14,
  LEFT_ANKLE: 15, RIGHT_ANKLE: 16
};

// Exercise definitions
const EXERCISES = {
  squat: { label: 'Squat', icon: '🏋️', type: 'rep' },
  pushup: { label: 'Push-Up', icon: '💪', type: 'rep' },
  lunge: { label: 'Lunge', icon: '🦵', type: 'rep' },
  plank: { label: 'Plank', icon: '🧘', type: 'hold' },
  yoga: { label: 'Yoga', icon: '🙏', type: 'hold' },
  auto: { label: 'Auto', icon: '🤖', type: 'auto' }
};

class PoseEngine {
  constructor() {
    this.currentExercise = 'squat';
    this.reps = 0;
    this.state = 'IDLE'; // IDLE, UP, DOWN, HOLD
    this.formScore = 0;
    this.formScores = [];
    this.feedback = [];
    this.angles = {};
    this.holdStartTime = 0;
    this.holdDuration = 0;
    this.isHolding = false;
    this.totalReps = 0;
    this.avgScore = 0;
    this.scoreHistory = [];
    this.streak = 0;
    this.sessionStart = Date.now();
    this.confidenceThreshold = 0.3;
    this.lastStateChange = 0;
    this.debounceMs = 300;
  }

  // Core angle calculation: angle at point B formed by A-B-C
  getAngle(A, B, C) {
    const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs(radians * 180 / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  }

  // Get keypoint with confidence check
  kp(keypoints, idx) {
    const p = keypoints[idx];
    if (p && p.confidence > this.confidenceThreshold) {
      return { x: p.x, y: p.y, ok: true };
    }
    return { x: 0, y: 0, ok: false };
  }

  // Calculate all relevant angles from keypoints
  calcAngles(keypoints) {
    const angles = {};

    const ls = this.kp(keypoints, KP.LEFT_SHOULDER);
    const rs = this.kp(keypoints, KP.RIGHT_SHOULDER);
    const le = this.kp(keypoints, KP.LEFT_ELBOW);
    const re = this.kp(keypoints, KP.RIGHT_ELBOW);
    const lw = this.kp(keypoints, KP.LEFT_WRIST);
    const rw = this.kp(keypoints, KP.RIGHT_WRIST);
    const lh = this.kp(keypoints, KP.LEFT_HIP);
    const rh = this.kp(keypoints, KP.RIGHT_HIP);
    const lk = this.kp(keypoints, KP.LEFT_KNEE);
    const rk = this.kp(keypoints, KP.RIGHT_KNEE);
    const la = this.kp(keypoints, KP.LEFT_ANKLE);
    const ra = this.kp(keypoints, KP.RIGHT_ANKLE);

    if (lh.ok && lk.ok && la.ok) angles.leftKnee = this.getAngle(lh, lk, la);
    if (rh.ok && rk.ok && ra.ok) angles.rightKnee = this.getAngle(rh, rk, ra);
    if (ls.ok && lh.ok && lk.ok) angles.leftHip = this.getAngle(ls, lh, lk);
    if (rs.ok && rh.ok && rk.ok) angles.rightHip = this.getAngle(rs, rh, rk);
    if (ls.ok && le.ok && lw.ok) angles.leftElbow = this.getAngle(ls, le, lw);
    if (rs.ok && re.ok && rw.ok) angles.rightElbow = this.getAngle(rs, re, rw);
    if (le.ok && ls.ok && lh.ok) angles.leftShoulder = this.getAngle(le, ls, lh);
    if (re.ok && rs.ok && rh.ok) angles.rightShoulder = this.getAngle(re, rs, rh);

    // Body alignment: shoulder-hip-ankle
    if (ls.ok && lh.ok && la.ok) angles.leftBodyLine = this.getAngle(ls, lh, la);
    if (rs.ok && rh.ok && ra.ok) angles.rightBodyLine = this.getAngle(rs, rh, ra);

    this.angles = angles;
    return angles;
  }

  // Main update: called each frame with keypoints
  update(keypoints) {
    if (!keypoints || keypoints.length < 17) {
      this.feedback = [{ text: 'Step into frame so I can see you!', type: 'warning', icon: '👤' }];
      return;
    }

    const angles = this.calcAngles(keypoints);
    let exercise = this.currentExercise;

    if (exercise === 'auto') {
      exercise = this.autoDetect(angles, keypoints);
    }

    switch (exercise) {
      case 'squat': this.analyzeSquat(angles); break;
      case 'pushup': this.analyzePushup(angles); break;
      case 'lunge': this.analyzeLunge(angles); break;
      case 'plank': this.analyzePlank(angles); break;
      case 'yoga': this.analyzeYoga(angles, keypoints); break;
    }

    // Update running score
    if (this.formScores.length > 30) this.formScores.shift();
    this.formScores.push(this.formScore);
    this.formScore = Math.round(this.formScores.reduce((a, b) => a + b, 0) / this.formScores.length);

    // Update session avg
    if (this.scoreHistory.length > 0) {
      this.avgScore = Math.round(this.scoreHistory.reduce((a, b) => a + b, 0) / this.scoreHistory.length);
    }
  }

  // Rep counting with debounce
  countRep() {
    const now = Date.now();
    if (now - this.lastStateChange < this.debounceMs) return;
    this.reps++;
    this.totalReps++;
    this.streak++;
    this.scoreHistory.push(this.formScore);
    this.lastStateChange = now;
  }

  // Auto-detect exercise based on body position
  autoDetect(angles, keypoints) {
    const ls = this.kp(keypoints, KP.LEFT_SHOULDER);
    const lh = this.kp(keypoints, KP.LEFT_HIP);
    const la = this.kp(keypoints, KP.LEFT_ANKLE);

    // Check if person is horizontal (push-up/plank)
    if (ls.ok && lh.ok && la.ok) {
      const vertDiff = Math.abs(ls.y - la.y);
      const horizDiff = Math.abs(ls.x - la.x);
      if (horizDiff > vertDiff * 1.5) {
        // Horizontal — check elbows for pushup vs plank
        if (angles.leftElbow && angles.leftElbow < 130) return 'pushup';
        return 'plank';
      }
    }

    // Standing: check for squat/lunge
    if (angles.leftKnee !== undefined && angles.rightKnee !== undefined) {
      const kneeDiff = Math.abs(angles.leftKnee - angles.rightKnee);
      if (kneeDiff > 30) return 'lunge';
      if (angles.leftKnee < 140 || angles.rightKnee < 140) return 'squat';
    }

    // Check arms raised for yoga
    if (angles.leftShoulder && angles.leftShoulder > 120) return 'yoga';

    return 'squat'; // default
  }

  // ── SQUAT Analysis ──
  analyzeSquat(a) {
    const fb = [];
    let score = 100;
    const kneeL = a.leftKnee || 180;
    const kneeR = a.rightKnee || 180;
    const hipL = a.leftHip || 180;
    const hipR = a.rightHip || 180;
    const avgKnee = (kneeL + kneeR) / 2;
    const avgHip = (hipL + hipR) / 2;

    // State machine
    if (avgKnee < 100 && avgHip < 110) {
      if (this.state === 'UP' || this.state === 'IDLE') {
        this.state = 'DOWN';
        this.lastStateChange = Date.now();
      }
    } else if (avgKnee > 155 && avgHip > 155) {
      if (this.state === 'DOWN') {
        this.countRep();
        this.state = 'UP';
      } else if (this.state === 'IDLE') {
        this.state = 'UP';
      }
    }

    // Form checks
    if (avgKnee > 100 && avgKnee < 155 && this.state === 'DOWN') {
      fb.push({ text: 'Go deeper! Bend knees more', type: 'warning', icon: '⬇️' });
      score -= 15;
    }

    if (avgKnee < 100) {
      fb.push({ text: 'Great depth!', type: 'good', icon: '✅' });
    }

    // Knee symmetry
    if (Math.abs(kneeL - kneeR) > 15) {
      fb.push({ text: 'Keep knees even — balance both sides', type: 'warning', icon: '⚖️' });
      score -= 10;
    }

    // Back straight check (hip angle)
    if (avgHip < 80) {
      fb.push({ text: 'Keep your back straighter', type: 'bad', icon: '🔴' });
      score -= 20;
    } else if (avgHip > 90 && this.state !== 'IDLE') {
      fb.push({ text: 'Good back position', type: 'good', icon: '✅' });
    }

    if (fb.length === 0) fb.push({ text: 'Looking good! Keep going', type: 'good', icon: '💪' });
    this.feedback = fb;
    this.formScore = Math.max(0, Math.min(100, score));
  }

  // ── PUSH-UP Analysis ──
  analyzePushup(a) {
    const fb = [];
    let score = 100;
    const elbowL = a.leftElbow || 180;
    const elbowR = a.rightElbow || 180;
    const avgElbow = (elbowL + elbowR) / 2;
    const bodyLine = ((a.leftBodyLine || 180) + (a.rightBodyLine || 180)) / 2;

    if (avgElbow < 90) {
      if (this.state === 'UP' || this.state === 'IDLE') {
        this.state = 'DOWN';
        this.lastStateChange = Date.now();
      }
    } else if (avgElbow > 155) {
      if (this.state === 'DOWN') {
        this.countRep();
        this.state = 'UP';
      } else if (this.state === 'IDLE') {
        this.state = 'UP';
      }
    }

    if (avgElbow > 90 && avgElbow < 155 && this.state === 'DOWN') {
      fb.push({ text: 'Lower your chest more', type: 'warning', icon: '⬇️' });
      score -= 15;
    }

    if (bodyLine < 155) {
      fb.push({ text: 'Keep body straight — no sagging!', type: 'bad', icon: '📏' });
      score -= 25;
    } else if (bodyLine > 190) {
      fb.push({ text: 'Don\'t pike your hips up', type: 'warning', icon: '⚠️' });
      score -= 15;
    } else {
      fb.push({ text: 'Great body alignment', type: 'good', icon: '✅' });
    }

    if (Math.abs(elbowL - elbowR) > 20) {
      fb.push({ text: 'Keep elbows symmetrical', type: 'warning', icon: '⚖️' });
      score -= 10;
    }

    if (fb.length === 0) fb.push({ text: 'Strong form! Keep pushing', type: 'good', icon: '🔥' });
    this.feedback = fb;
    this.formScore = Math.max(0, Math.min(100, score));
  }

  // ── LUNGE Analysis ──
  analyzeLunge(a) {
    const fb = [];
    let score = 100;
    const kneeL = a.leftKnee || 180;
    const kneeR = a.rightKnee || 180;
    const frontKnee = Math.min(kneeL, kneeR);
    const backKnee = Math.max(kneeL, kneeR);

    if (frontKnee < 100 && backKnee < 130) {
      if (this.state === 'UP' || this.state === 'IDLE') {
        this.state = 'DOWN';
        this.lastStateChange = Date.now();
      }
    } else if (frontKnee > 150 && backKnee > 150) {
      if (this.state === 'DOWN') {
        this.countRep();
        this.state = 'UP';
      } else if (this.state === 'IDLE') {
        this.state = 'UP';
      }
    }

    if (frontKnee < 75) {
      fb.push({ text: 'Front knee too far forward!', type: 'bad', icon: '🔴' });
      score -= 25;
    } else if (frontKnee >= 80 && frontKnee <= 100) {
      fb.push({ text: 'Perfect front knee angle', type: 'good', icon: '✅' });
    }

    // Torso upright
    const hipAvg = ((a.leftHip || 180) + (a.rightHip || 180)) / 2;
    if (hipAvg < 140) {
      fb.push({ text: 'Keep torso more upright', type: 'warning', icon: '⬆️' });
      score -= 15;
    }

    if (fb.length === 0) fb.push({ text: 'Solid lunge form!', type: 'good', icon: '💪' });
    this.feedback = fb;
    this.formScore = Math.max(0, Math.min(100, score));
  }

  // ── PLANK Analysis ──
  analyzePlank(a) {
    const fb = [];
    let score = 100;
    const hipAvg = ((a.leftHip || 180) + (a.rightHip || 180)) / 2;
    const bodyLine = ((a.leftBodyLine || 180) + (a.rightBodyLine || 180)) / 2;

    const inPlank = hipAvg > 150 && bodyLine > 150 && bodyLine < 195;

    if (inPlank) {
      if (!this.isHolding) {
        this.isHolding = true;
        this.holdStartTime = Date.now();
      }
      this.holdDuration = Math.floor((Date.now() - this.holdStartTime) / 1000);
      this.state = 'HOLD';
    } else {
      if (this.isHolding && this.holdDuration > 2) {
        this.scoreHistory.push(this.formScore);
      }
      this.isHolding = false;
      this.holdDuration = 0;
      this.state = 'IDLE';
    }

    if (bodyLine < 155) {
      fb.push({ text: 'Hips are sagging — tighten core!', type: 'bad', icon: '📉' });
      score -= 30;
    } else if (bodyLine > 190) {
      fb.push({ text: 'Hips too high — lower them', type: 'warning', icon: '📈' });
      score -= 15;
    } else {
      fb.push({ text: 'Perfect plank alignment', type: 'good', icon: '✅' });
    }

    if (this.isHolding) {
      if (this.holdDuration >= 30) {
        fb.push({ text: 'Incredible hold! 30s+', type: 'good', icon: '🏆' });
      } else if (this.holdDuration >= 15) {
        fb.push({ text: 'Great endurance! Keep holding', type: 'good', icon: '🔥' });
      } else {
        fb.push({ text: 'Hold steady...', type: 'good', icon: '⏱️' });
      }
    }

    this.feedback = fb;
    this.formScore = Math.max(0, Math.min(100, score));
  }

  // ── YOGA Analysis ──
  analyzeYoga(a, keypoints) {
    const fb = [];
    let score = 100;
    const ls = this.kp(keypoints, KP.LEFT_SHOULDER);
    const rs = this.kp(keypoints, KP.RIGHT_SHOULDER);
    const lh = this.kp(keypoints, KP.LEFT_HIP);
    const rh = this.kp(keypoints, KP.RIGHT_HIP);
    const lk = this.kp(keypoints, KP.LEFT_KNEE);
    const rk = this.kp(keypoints, KP.RIGHT_KNEE);
    const la = this.kp(keypoints, KP.LEFT_ANKLE);
    const ra = this.kp(keypoints, KP.RIGHT_ANKLE);

    // Detect Warrior pose: one knee bent ~90°, other straight, arms wide
    const kneeL = a.leftKnee || 180;
    const kneeR = a.rightKnee || 180;
    const shoulderL = a.leftShoulder || 0;
    const shoulderR = a.rightShoulder || 0;

    let poseName = 'Yoga Pose';

    // Warrior: front knee ~90°, arms raised
    if ((kneeL < 120 && kneeR > 150) || (kneeR < 120 && kneeL > 150)) {
      poseName = 'Warrior';
      const frontKnee = Math.min(kneeL, kneeR);
      if (frontKnee > 100) {
        fb.push({ text: 'Bend front knee deeper', type: 'warning', icon: '⬇️' });
        score -= 15;
      } else {
        fb.push({ text: 'Great warrior stance!', type: 'good', icon: '⚔️' });
      }

      if (shoulderL > 120 || shoulderR > 120) {
        fb.push({ text: 'Arms well extended', type: 'good', icon: '✅' });
      } else {
        fb.push({ text: 'Raise your arms higher', type: 'warning', icon: '🙌' });
        score -= 10;
      }
    }
    // Tree: one leg lifted
    else if (la.ok && ra.ok && lk.ok && rk.ok) {
      const ankleHeightDiff = Math.abs(la.y - ra.y);
      if (ankleHeightDiff > 80) {
        poseName = 'Tree Pose';
        fb.push({ text: 'Hold balance — focus on a point', type: 'good', icon: '🌳' });
        if (shoulderL > 140 || shoulderR > 140) {
          fb.push({ text: 'Beautiful arm extension!', type: 'good', icon: '✅' });
        } else {
          fb.push({ text: 'Raise arms overhead', type: 'warning', icon: '🙌' });
          score -= 10;
        }
      }
    }

    // Hold timer
    const inPose = score >= 60;
    if (inPose) {
      if (!this.isHolding) {
        this.isHolding = true;
        this.holdStartTime = Date.now();
      }
      this.holdDuration = Math.floor((Date.now() - this.holdStartTime) / 1000);
      this.state = 'HOLD';
    } else {
      this.isHolding = false;
      this.holdDuration = 0;
      this.state = 'IDLE';
    }

    if (fb.length === 0) {
      fb.push({ text: 'Find your pose and hold it', type: 'warning', icon: '🧘' });
    }

    this.feedback = fb;
    this.formScore = Math.max(0, Math.min(100, score));
    this.currentYogaPose = poseName;
  }

  // Get angle color for skeleton rendering
  getJointColor(angleName) {
    const angle = this.angles[angleName];
    if (angle === undefined) return { r: 100, g: 100, b: 100 };

    // Different ideal ranges per exercise
    const ideals = this.getIdealAngles();
    const ideal = ideals[angleName];
    if (!ideal) return { r: 0, g: 240, b: 255 }; // cyan default

    const diff = Math.abs(angle - ideal.target);
    if (diff < ideal.good) return { r: 0, g: 255, b: 136 };   // green
    if (diff < ideal.ok) return { r: 255, g: 159, b: 67 };     // orange
    return { r: 255, g: 71, b: 87 };                            // red
  }

  getIdealAngles() {
    switch (this.currentExercise === 'auto' ? 'squat' : this.currentExercise) {
      case 'squat':
        return {
          leftKnee: { target: 90, good: 20, ok: 40 },
          rightKnee: { target: 90, good: 20, ok: 40 },
          leftHip: { target: 90, good: 20, ok: 40 },
          rightHip: { target: 90, good: 20, ok: 40 }
        };
      case 'pushup':
        return {
          leftElbow: { target: 90, good: 20, ok: 40 },
          rightElbow: { target: 90, good: 20, ok: 40 },
          leftBodyLine: { target: 175, good: 15, ok: 30 },
          rightBodyLine: { target: 175, good: 15, ok: 30 }
        };
      case 'lunge':
        return {
          leftKnee: { target: 90, good: 15, ok: 30 },
          rightKnee: { target: 90, good: 15, ok: 30 }
        };
      case 'plank':
        return {
          leftBodyLine: { target: 175, good: 10, ok: 25 },
          rightBodyLine: { target: 175, good: 10, ok: 25 }
        };
      default:
        return {};
    }
  }

  // Get display angles for current exercise
  getDisplayAngles() {
    const a = this.angles;
    const ex = this.currentExercise === 'auto' ? 'squat' : this.currentExercise;
    switch (ex) {
      case 'squat':
        return [
          { name: 'L Knee', value: a.leftKnee, max: 180 },
          { name: 'R Knee', value: a.rightKnee, max: 180 },
          { name: 'L Hip', value: a.leftHip, max: 180 },
          { name: 'R Hip', value: a.rightHip, max: 180 }
        ];
      case 'pushup':
        return [
          { name: 'L Elbow', value: a.leftElbow, max: 180 },
          { name: 'R Elbow', value: a.rightElbow, max: 180 },
          { name: 'L Body', value: a.leftBodyLine, max: 180 },
          { name: 'R Body', value: a.rightBodyLine, max: 180 }
        ];
      case 'lunge':
        return [
          { name: 'L Knee', value: a.leftKnee, max: 180 },
          { name: 'R Knee', value: a.rightKnee, max: 180 },
          { name: 'L Hip', value: a.leftHip, max: 180 },
          { name: 'R Hip', value: a.rightHip, max: 180 }
        ];
      case 'plank':
        return [
          { name: 'L Hip', value: a.leftHip, max: 180 },
          { name: 'R Hip', value: a.rightHip, max: 180 },
          { name: 'L Body', value: a.leftBodyLine, max: 180 },
          { name: 'R Body', value: a.rightBodyLine, max: 180 }
        ];
      case 'yoga':
        return [
          { name: 'L Knee', value: a.leftKnee, max: 180 },
          { name: 'R Knee', value: a.rightKnee, max: 180 },
          { name: 'L Shoulder', value: a.leftShoulder, max: 180 },
          { name: 'R Shoulder', value: a.rightShoulder, max: 180 }
        ];
      default:
        return [];
    }
  }

  setExercise(name) {
    this.currentExercise = name;
    this.reps = 0;
    this.state = 'IDLE';
    this.formScores = [];
    this.formScore = 0;
    this.feedback = [];
    this.isHolding = false;
    this.holdDuration = 0;
    this.streak = 0;
  }

  getSessionTime() {
    const elapsed = Math.floor((Date.now() - this.sessionStart) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  formatHold(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  getExerciseType() {
    const ex = this.currentExercise === 'auto' ? 'squat' : this.currentExercise;
    return EXERCISES[ex]?.type || 'rep';
  }
}
