/********************************************************************
 // Gesture Detector
********************************************************************/

import {
  FilesetResolver,
  GestureRecognizer,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

let gestureRecognizer;
let webcamRunning = false;
const videoHeight = "360px";
const videoWidth = "480px";

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const gestureOutput = document.getElementById("gesture_output");

// Before we can use HandLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
const createGestureRecognizer = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
      delegate: "GPU",
    },
    runningMode: "video",
    numHands: 2,
  });
};

/********************************************************************
 // Webcam
********************************************************************/

// Enable the live webcam view and start detection.
function enableCam() {
  if (!gestureRecognizer) {
    alert("Please wait for gestureRecognizer to load");
    return;
  }

  webcamRunning = true;

  // getUsermedia parameters.
  const constraints = {
    video: true,
  };

  // Activate the webcam stream.
  navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
  });
  console.log("webcam enabled.");
}

let lastVideoTime = -1;
let results = undefined;
async function predictWebcam() {
  const webcamElement = document.getElementById("webcam");

  let nowInMs = Date.now();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    results = gestureRecognizer.recognizeForVideo(video, nowInMs); // analyse video and recognize gestures
  }

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  canvasElement.style.height = videoHeight;
  webcamElement.style.height = videoHeight;
  canvasElement.style.width = videoWidth;
  webcamElement.style.width = videoWidth;

  // Für alle Hände die Kamera Overlay zeichnen
  for (const landmarks of results.landmarks) {
    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
      color: "#00FF00",
      lineWidth: 5,
    });
    drawLandmarks(canvasCtx, landmarks, { color: "#FF0000", lineWidth: 2 });
  }

  canvasCtx.restore();

  // Wenn es eine Gesten gibt, diese einzeln behandeln und HTML Interface ändern
  if (results.handednesses.length > 0) {
    // Linke Hand finden
    const linkeHandIndex = 
        results.handednesses[0][0].categoryName == "Right" ? 0 
              : results.handednesses.length > 1 && results.handednesses[1][0].categoryName == "Right" ? 1 
                    : -1;

    // Linke hand ist da
    if(linkeHandIndex != -1){
        // parse information
        const gesture = results.gestures[linkeHandIndex][0];
        const handedness = results.handednesses[linkeHandIndex][0];
        const landmarks = results.landmarks[linkeHandIndex];
        
        const gestureName = gesture.categoryName;
        const gestureScore = parseFloat(gesture.score * 100).toFixed(2);
        const hand = handedness.displayName;
        const handScore = parseFloat(handedness.score * 100).toFixed(2);

        // calulate the position of the hand
        let landmarksX = landmarks.map((element) => element.x);
        let landmarksY = landmarks.map((element) => element.y);
        let landmarksXAvg = landmarksX.reduce((p, c) => p + c, 0) / landmarksX.length;
        let landmarksYAvg = landmarksY.reduce((p, c) => p + c, 0) / landmarksY.length;
        var handX = parseFloat(landmarksXAvg * 100).toFixed(2);
        var handY = parseFloat(landmarksYAvg * 100).toFixed(2);

        console.log(
          `${hand} Hand (X: ${handX}, Y: ${handY}, Score: ${handScore}), Geste: ${gestureName} (${gestureScore}%)`
        );

        generateMidi(gestureName, gestureScore);
    } else {
      // Linke Hand ist nicht da
      stopMidi();
    }
  } else{
    // Stoppen, wenn keine Hand erkannt
    stopMidi();
  }

  // Call this function again to keep predicting when the browser is ready.
  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam);
  }
}

/********************************************************************
 // Geste
********************************************************************/

// Behandelt die einzelnen Gesten
function handleGesture(gesture, handedness, landmarks) {
  /*console.log("Gesture: " + JSON.stringify(gesture));
  console.log("Handedness: " + JSON.stringify(handedness));
  console.log("Landmarks: " + JSON.stringify(landmarks));*/

  // parse information
  const gestureName = gesture.categoryName;
  const gestureScore = parseFloat(gesture.score * 100).toFixed(2);
  const hand = handedness.displayName;

  // calulate the position of the hand
  let landmarksX = landmarks.map((element) => element.x);
  let landmarksY = landmarks.map((element) => element.y);
  let landmarksXAvg = landmarksX.reduce((p, c) => p + c, 0) / landmarksX.length;
  let landmarksYAvg = landmarksY.reduce((p, c) => p + c, 0) / landmarksY.length;
  var handX = parseFloat(landmarksXAvg * 100).toFixed(2);
  var handY = parseFloat(landmarksYAvg * 100).toFixed(2);

  // print the result to console
  console.log(
    `${hand} Hand (X: ${handX}, Y: ${handY}), Geste: ${gestureName} (${gestureScore}%)`
  );

  // TODO: Hier könnte man filtern, ob die Geste bei einem zu niedrigen Score ignoriert wird

  // Midi generieren
  generateMidi(gestureName, gestureScore);
}

/********************************************************************
 // Midi
********************************************************************/

// ############ Zustand ############
const idleChannel = 0; // Channel ohne Ton
let currentChannel = idleChannel; // aktueller Channel/Gestes (am Anfang idleChannel)
let midiOut = []; // Midi Outputs (werden in initDevices gesetzt)

// ############ Funktionen ############

// Sende idle channel, falls aktuell nicht in idle
function stopMidi(){
  if(currentChannel != idleChannel){
    generateMidi("Closed_Fist", 0);
  }
}

function midiReady(midi) {
  // Also react to device changes.
  midi.addEventListener("statechange", (event) => initDevices(event.target));
  initDevices(midi); // see the next section!
}

function initDevices(midi) {
  // MIDI devices that you send data to.
  const outputs = midi.outputs.values();
  for (
    let output = outputs.next();
    output && !output.done;
    output = outputs.next()
  ) {
    midiOut.push(output.value);
  }
}

function sendMidiMessage(channel, pitch, velocity) {
  const noteOnMessage = [0x90, pitch, velocity];
  const noteOffMessage = [0x80, pitch, velocity];

  // Bei channel Wechsel / andere Geste
  if (channel != currentChannel) {
    // Wenn aktuell ein Ton spielt, diesen stoppen
    if (currentChannel != idleChannel) {
      const currentDevice = midiOut[currentChannel];
      currentDevice.send(noteOffMessage);
    }

    // Neuen Ton spielen
    const device = midiOut[channel];
    device.send(noteOnMessage);

    // Channel wechseln
    currentChannel = channel;
  }
}

// Übersetze Geste in Midi Channel und sende diese an sendMidiChannel
function generateMidi(gestureName, gestureConfidence) {
  const gestureToChannelMap = {
    Closed_Fist: idleChannel,
    Open_Palm: 1,
    Pointing_Up: 3,
    Thumb_Down: 4,
    Thumb_Up: 5,
    Victory: 6,
    ILoveYou: 7,
  };

  const channel = gestureToChannelMap[gestureName] || idleChannel; // Channel der Geste
  let pitch = 50; //
  let velocity = 100; // Später eventuell: y coordinate

  // send midi
  sendMidiMessage(channel, pitch, velocity);
}

/********************************************************************
 // Main
********************************************************************/

// Wird ausgefuehrt, wenn die Seite geladen ist
window.onload = function () {
  createGestureRecognizer();

  setTimeout(enableCam, 1000);

  window.navigator.requestMIDIAccess().then(
    (midi) => midiReady(midi),
    (err) => console.log("Something went wrong", err)
  );
};
