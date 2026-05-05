/* ============================================================
   FormSense AI — p5.js Sketch
   Webcam capture, ml5 bodyPose, skeleton rendering
   ============================================================ */

let video;
let bodyPose;
let poses = [];
let engine;
let ui;
let canvasW = 640;
let canvasH = 480;

// Skeleton connection pairs for MoveNet
const SKELETON_CONNECTIONS = [
  [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER, KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW, KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  [KP.LEFT_SHOULDER, KP.LEFT_HIP],
  [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.LEFT_KNEE],
  [KP.LEFT_KNEE, KP.LEFT_ANKLE],
  [KP.RIGHT_HIP, KP.RIGHT_KNEE],
  [KP.RIGHT_KNEE, KP.RIGHT_ANKLE],
  [KP.LEFT_EAR, KP.LEFT_EYE],
  [KP.LEFT_EYE, KP.NOSE],
  [KP.NOSE, KP.RIGHT_EYE],
  [KP.RIGHT_EYE, KP.RIGHT_EAR]
];

let modelReady = false;

function preload() {
  // Intentionally empty — ml5 v1.3.1's preload integration with p5 is unreliable.
  // Model is loaded in setup() with an explicit callback instead.
}

function setup() {
  // Size canvas to fit wrapper
  const wrapper = document.getElementById('canvas-wrapper');
  if (wrapper) {
    canvasW = Math.min(wrapper.clientWidth - 20, 800);
    canvasH = Math.round(canvasW * 0.6);
  }

  const cnv = createCanvas(canvasW, canvasH);
  cnv.parent('canvas-wrapper');

  // Create video FIRST — it must exist before we pass it to detectStart
  video = createCapture(VIDEO, function() {
    console.log("📷 Webcam stream ready");
  });
  video.size(canvasW, canvasH);
  video.hide();

  // Initialize engine and UI
  engine = new PoseEngine();
  ui = new UIController(engine);

  // Load bodyPose model — the callback receives the actual model instance
  console.log("⏳ Loading MoveNet model...");
  ml5.bodyPose("MoveNet", { flipped: true }, modelLoaded);
}

function modelLoaded(model) {
  console.log("✅ MoveNet model loaded!");

  // The model is passed as the callback argument, NOT the return value of ml5.bodyPose()
  bodyPose = model;

  if (!bodyPose || typeof bodyPose.detectStart !== 'function') {
    console.error("❌ bodyPose.detectStart not available. Available methods:",
      Object.getOwnPropertyNames(Object.getPrototypeOf(bodyPose)));
    return;
  }

  // Now it's safe to start detection
  bodyPose.detectStart(video, gotPoses);
  modelReady = true;
  console.log("🎯 Pose detection started");

  // Signal model ready to UI
  ui.setModelReady();
}

function gotPoses(results) {
  poses = results;
}

function draw() {
  background(15, 15, 25);

  // Show loading state until model is ready
  if (!modelReady || !video) {
    fill(0, 240, 255);
    noStroke();
    textSize(16);
    textAlign(CENTER, CENTER);
    text('Loading MoveNet model...', canvasW / 2, canvasH / 2);
    return;
  }

  // Draw video feed flipped (mirrored) to match bodyPose flipped coordinates
  push();
  translate(canvasW, 0);
  scale(-1, 1);
  image(video, 0, 0, canvasW, canvasH);
  pop();

  if (poses.length > 0) {
    const pose = poses[0];
    const keypoints = pose.keypoints;

    // Run pose engine analysis
    engine.update(keypoints);

    // Draw skeleton
    drawSkeleton(keypoints);

    // Draw keypoints
    drawKeypoints(keypoints);

    // Draw angle arcs at key joints
    drawAngleArcs(keypoints);
  } else {
    // No pose detected
    engine.feedback = [{ text: 'Step into frame so I can see you!', type: 'warning', icon: '👤' }];
  }

  // Update UI every frame
  if (ui) ui.update();
}

function drawSkeleton(keypoints) {
  strokeWeight(3);
  for (let i = 0; i < SKELETON_CONNECTIONS.length; i++) {
    const [a, b] = SKELETON_CONNECTIONS[i];
    const pA = keypoints[a];
    const pB = keypoints[b];

    if (pA.confidence > 0.3 && pB.confidence > 0.3) {
      // Gradient color based on form quality
      const c1 = getKeypointColor(pA.confidence);
      const c2 = getKeypointColor(pB.confidence);

      stroke(
        (c1[0] + c2[0]) / 2,
        (c1[1] + c2[1]) / 2,
        (c1[2] + c2[2]) / 2,
        180
      );
      line(pA.x, pA.y, pB.x, pB.y);
    }
  }
}

function drawKeypoints(keypoints) {
  for (let i = 0; i < keypoints.length; i++) {
    const kp = keypoints[i];
    if (kp.confidence > 0.3) {
      // Determine color from form analysis
      const angleName = getAngleNameForKeypoint(i);
      let col;
      if (angleName && engine) {
        const jc = engine.getJointColor(angleName);
        col = [jc.r, jc.g, jc.b];
      } else {
        col = getKeypointColor(kp.confidence);
      }

      // Outer glow
      noStroke();
      fill(col[0], col[1], col[2], 40);
      ellipse(kp.x, kp.y, 20, 20);

      // Inner dot
      fill(col[0], col[1], col[2], 230);
      ellipse(kp.x, kp.y, 10, 10);

      // White center
      fill(255, 255, 255, 200);
      ellipse(kp.x, kp.y, 4, 4);
    }
  }
}

function getKeypointColor(confidence) {
  if (confidence > 0.7) return [0, 240, 255]; // cyan
  if (confidence > 0.5) return [0, 255, 136]; // green
  return [255, 159, 67]; // orange (low confidence)
}

function getAngleNameForKeypoint(idx) {
  switch (idx) {
    case KP.LEFT_KNEE: return 'leftKnee';
    case KP.RIGHT_KNEE: return 'rightKnee';
    case KP.LEFT_HIP: return 'leftHip';
    case KP.RIGHT_HIP: return 'rightHip';
    case KP.LEFT_ELBOW: return 'leftElbow';
    case KP.RIGHT_ELBOW: return 'rightElbow';
    case KP.LEFT_SHOULDER: return 'leftShoulder';
    case KP.RIGHT_SHOULDER: return 'rightShoulder';
    default: return null;
  }
}

function drawAngleArcs(keypoints) {
  const arcsToShow = getArcConfigs();

  arcsToShow.forEach(arc => {
    const pA = keypoints[arc.a];
    const pB = keypoints[arc.b];
    const pC = keypoints[arc.c];

    if (pA.confidence > 0.3 && pB.confidence > 0.3 && pC.confidence > 0.3) {
      const angle = engine.angles[arc.name];
      if (angle === undefined) return;

      // Draw arc at joint B
      const angleA = atan2(pA.y - pB.y, pA.x - pB.x);
      const angleC = atan2(pC.y - pB.y, pC.x - pB.x);

      const jc = engine.getJointColor(arc.name);
      noFill();
      stroke(jc.r, jc.g, jc.b, 150);
      strokeWeight(2);
      arc_shape(pB.x, pB.y, 30, angleC, angleA);

      // Angle text
      fill(255, 255, 255, 220);
      noStroke();
      textSize(11);
      textAlign(CENTER, CENTER);
      const labelX = pB.x + 22 * cos((angleA + angleC) / 2);
      const labelY = pB.y + 22 * sin((angleA + angleC) / 2);
      text(Math.round(angle) + '°', labelX, labelY);
    }
  });
}

function arc_shape(x, y, radius, startAngle, endAngle) {
  // Ensure we draw the shorter arc
  let sA = startAngle;
  let eA = endAngle;

  // Normalize
  while (eA < sA) eA += TWO_PI;
  if (eA - sA > PI) {
    // Swap to get shorter arc
    let temp = sA;
    sA = eA;
    eA = temp + TWO_PI;
  }

  beginShape();
  for (let a = sA; a <= eA; a += 0.05) {
    vertex(x + radius * cos(a), y + radius * sin(a));
  }
  endShape();
}

function getArcConfigs() {
  const ex = engine ? engine.currentExercise : 'squat';
  const base = [
    { name: 'leftKnee', a: KP.LEFT_HIP, b: KP.LEFT_KNEE, c: KP.LEFT_ANKLE },
    { name: 'rightKnee', a: KP.RIGHT_HIP, b: KP.RIGHT_KNEE, c: KP.RIGHT_ANKLE }
  ];

  switch (ex) {
    case 'squat':
    case 'lunge':
    case 'auto':
      return [
        ...base,
        { name: 'leftHip', a: KP.LEFT_SHOULDER, b: KP.LEFT_HIP, c: KP.LEFT_KNEE },
        { name: 'rightHip', a: KP.RIGHT_SHOULDER, b: KP.RIGHT_HIP, c: KP.RIGHT_KNEE }
      ];
    case 'pushup':
      return [
        { name: 'leftElbow', a: KP.LEFT_SHOULDER, b: KP.LEFT_ELBOW, c: KP.LEFT_WRIST },
        { name: 'rightElbow', a: KP.RIGHT_SHOULDER, b: KP.RIGHT_ELBOW, c: KP.RIGHT_WRIST },
        { name: 'leftBodyLine', a: KP.LEFT_SHOULDER, b: KP.LEFT_HIP, c: KP.LEFT_ANKLE },
        { name: 'rightBodyLine', a: KP.RIGHT_SHOULDER, b: KP.RIGHT_HIP, c: KP.RIGHT_ANKLE }
      ];
    case 'plank':
      return [
        { name: 'leftBodyLine', a: KP.LEFT_SHOULDER, b: KP.LEFT_HIP, c: KP.LEFT_ANKLE },
        { name: 'rightBodyLine', a: KP.RIGHT_SHOULDER, b: KP.RIGHT_HIP, c: KP.RIGHT_ANKLE }
      ];
    case 'yoga':
      return [
        ...base,
        { name: 'leftShoulder', a: KP.LEFT_ELBOW, b: KP.LEFT_SHOULDER, c: KP.LEFT_HIP },
        { name: 'rightShoulder', a: KP.RIGHT_ELBOW, b: KP.RIGHT_SHOULDER, c: KP.RIGHT_HIP }
      ];
    default:
      return base;
  }
}

function windowResized() {
  const wrapper = document.getElementById('canvas-wrapper');
  if (wrapper) {
    canvasW = Math.min(wrapper.clientWidth - 20, 800);
    canvasH = Math.round(canvasW * 0.6);
    resizeCanvas(canvasW, canvasH);
    if (video) video.size(canvasW, canvasH);
  }
}