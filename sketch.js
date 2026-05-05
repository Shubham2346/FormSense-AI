let video;
let poseNet;
let poses = [];

function setup() {
  createCanvas(800, 500);

  video = createCapture(VIDEO);
  video.size(800, 500);
  video.hide();

  poseNet = ml5.poseNet(video, () => {
    console.log("Model loaded");
  });

  poseNet.on("pose", gotPoses);
}

function gotPoses(results) {
  poses = results;
}

function draw() {
  image(video, 0, 0, width, height);

  if (poses.length > 0) {
    let pose = poses[0].pose;
    let skeleton = poses[0].skeleton;

    // keypoints
    fill(255, 0, 0);
    noStroke();

    for (let i = 0; i < pose.keypoints.length; i++) {
      let kp = pose.keypoints[i];
      if (kp.score > 0.3) {
        ellipse(kp.position.x, kp.position.y, 10);
      }
    }

    // skeleton (AUTO WORKS HERE)
    stroke(0, 255, 0);
    strokeWeight(3);

    for (let i = 0; i < skeleton.length; i++) {
      let a = skeleton[i][0];
      let b = skeleton[i][1];
      line(a.position.x, a.position.y, b.position.x, b.position.y);
    }
  }
}