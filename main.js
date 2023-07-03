// MediaPipe Functions

import {
    GestureRecognizer,
    FilesetResolver,
    DrawingUtils
  } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
  
const demosSection = document.getElementById("demos");
let gestureRecognizer;
let runningMode = "IMAGE";
let enableWebcamButton;
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
        delegate: "GPU"
    },
    runningMode: runningMode
    });
    demosSection.classList.remove("invisible");
};
createGestureRecognizer();

/********************************************************************
 // Continuously grab image from webcam stream and detect it.
********************************************************************/

// Check if webcam access is supported.
function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// If webcam supported, add event listener to button for when user
// wants to activate it.
if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
}

// Enable the live webcam view and start detection.
function enableCam(event) {
    if (!gestureRecognizer) {
    alert("Please wait for gestureRecognizer to load");
    return;
    }

    if (webcamRunning === true) {
    webcamRunning = false;
    enableWebcamButton.innerText = "ENABLE PREDICTIONS";
    } else {
    webcamRunning = true;
    enableWebcamButton.innerText = "DISABLE PREDICTIONS";
    }

    // getUsermedia parameters.
    const constraints = {
    video: true
    };

    // Activate the webcam stream.
    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
    });
}

let lastVideoTime = -1;
let results = undefined;
async function predictWebcam() {
    const webcamElement = document.getElementById("webcam");
    // Now let's start detecting the stream.
    if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await gestureRecognizer.setOptions({ runningMode: "VIDEO" });
    }
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
    if (results.landmarks) {
        //console.log(results)
    for (const landmarks of results.landmarks) {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 5
        });
        drawLandmarks(canvasCtx, landmarks, { color: "#FF0000", lineWidth: 2 });
    }
    }
    canvasCtx.restore();
    if (results.gestures.length > 0) { 
        // parse information
        const categoryName = results.gestures[0][0].categoryName;
        const categoryScore = parseFloat(
            results.gestures[0][0].score * 100
        ).toFixed(2);

        // print the result to console
        console.log(categoryName, categoryScore);

        // parse information and generate midi
        generateMidi(categoryName, categoryScore);

        // change the html interface
        gestureOutput.style.display = "block";
        gestureOutput.style.width = videoWidth;
        gestureOutput.innerText = `GestureRecognizer: ${categoryName}\n Confidence: ${categoryScore} %`;
    } else {
        gestureOutput.style.display = "none";
    }
    // Call this function again to keep predicting when the browser is ready.
    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}
  
// MIDI Functions
function midiReady(midi) {
    // Also react to device changes.
    midi.addEventListener('statechange', (event) => initDevices(event.target));
    initDevices(midi); // see the next section!
}

function initDevices(midi) {
    // MIDI devices that you send data to.
    const outputs = midi.outputs.values();
    for (let output = outputs.next(); output && !output.done; output = outputs.next()) {
        midiOut.push(output.value);
    }
}

function sendMidiMessage(channel, pitch, velocity, duration) {
    const NOTE_ON = 0x90;
    const NOTE_OFF = 0x80;
    
    console.log(channel);
    const device = midiOut[channel];
    console.log(device);
    const msgOn = [NOTE_ON, pitch, velocity];
    const msgOff = [NOTE_ON, pitch, velocity];
    
    // First send the note on;
    device.send(msgOn); 
    
    // Then send the note off. You can send this separately if you want 
    // (i.e. when the button is released)
    device.send(msgOff, Date.now() + duration); 
}


// enable webcam and prediction model, siehe oben

// Midi Setup
let midiOut = [];

window.onload = function() {
    window.navigator.requestMIDIAccess()
    .then(
        (midi) => midiReady(midi),
        (err) => console.log('Something went wrong', err)
    );
}


// get results
function generateMidi(categoryName, categoryScore) {

    let getGestureAsInt = (categoryName) => {
        switch (categoryName) {
            case 'Closed_Fist':
                return 1
                break;
            case 'Open_Palm':
                return 2
                break;
            case 'Pointing_Up':
                return 3
                break;
            case 'Thumb_Down':
                return 4
                break;
            case 'Thumb_Up':
                return 5
                break;
            case 'Victory':
                return 6
                break;
            default:
                return 0
        }
    }

    // extract necessary categories and landmarks
    let channel = getGestureAsInt(categoryName); // welche geste
    let pitch = 30; // 
    let velocity = 100; // welche y coordinate
    let duration = 1; // mal sehen

    // generate and send midi
    sendMidiMessage(channel, pitch, velocity, duration)
}
