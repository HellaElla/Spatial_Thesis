let audioContext;
let audioElement;
let audioSource;
let listener;
let canvas;
let ctx;
let animationId;
let masterGain;
let isPlaying = false;
let isDragging = false;
let currentX = 0, currentZ = 0;
let speakerNodes = [];

const scaleFactor = 3.5; // Adjust this value to control the distance scaling

let audioQueue = [
    'MP3/Front_Left.mp3',
    'MP3/Center.mp3',
    'MP3/Front_Right.mp3',
    'MP3/Surround_Left.mp3',
    'MP3/Surround_Right.mp3',
    'MP3/Back_Left.mp3',
    'MP3/Back_Right.mp3'
];
let currentTrackIndex = 0;


const speakerConfigurations = {
    stereo: [
        { name: 'Left',  position: [-1, 0, 0] },
        { name: 'Right', position: [1, 0, 0] }
    ],
    surround7_1: [
        { name: 'Front Left',     position: [-1,  0, -1] },
        { name: 'Front Right',    position: [ 1,  0, -1] },
        { name: 'Center',         position: [ 0,  0, -1] },
        { name: 'LFE',            position: [ 0, -1,  0] },
        { name: 'Surround Left',  position: [-1,  0,  0] },
        { name: 'Surround Right', position: [ 1,  0,  0] },
        { name: 'Back Left',      position: [-1,  0,  1] },
        { name: 'Back Right',     position: [ 1,  0,  1] }
    ]
};


function createInstructions() {
    const instructions = document.createElement('p');
    instructions.id = 'instructions';
    instructions.innerHTML = `
        Participant instructions:<br><br>
        You will listen to two audio samples, including a musical excerpt and spoken word recordings. 
        These samples have been processed through a spatial audio application to create a 3D sound experience.
        <br><br>
        When you are ready to start listening, click the "Start Audio" button. 
        You can mute all audio by clicking the “Stop Audio” button.
        <br><br>
        NOTE: These are preliminary stimuli recordings...
    `;
    document.body.appendChild(instructions);
}

// Call this function after the page content has loaded
document.addEventListener('DOMContentLoaded', () => {
    createInstructions();
    // other initialization code...
});


function createAnalyser() {
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    return analyser;
}

let currentConfiguration = 'surround7_1';
let speakers = speakerConfigurations[currentConfiguration];

function initVisualization() {
    canvas = document.getElementById('audioSpace');
    ctx = canvas.getContext('2d');
    
    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('mousemove', drag);
    canvas.addEventListener('mouseup', endDrag);
    canvas.addEventListener('mouseleave', endDrag);
}

function createGainDisplay() {
    let gainDisplay = document.getElementById('gainDisplay');
    if (!gainDisplay) {
        gainDisplay = document.createElement('div');
        gainDisplay.id = 'gainDisplay';
        document.body.appendChild(gainDisplay);
    }
    return gainDisplay;
}

function changeSpeakerConfiguration(configName) {
    console.log('Changing speaker configuration:', configName);
    if (speakerConfigurations[configName]) {
        currentConfiguration = configName;
        speakers = speakerConfigurations[configName];
        
        if (audioContext) {
            audioContext.close().then(() => {
                audioContext = null;
                speakerNodes = [];
                audioSource = null;
                masterGain = null;
                initAudio();
                if (isPlaying) {
                    startAudio();
                }
                updateAudioPositions();
                
                // Remove existing waveform canvases and meter canvases
                const waveformContainer = document.getElementById('waveformContainer');
                if (waveformContainer) {
                    waveformContainer.remove();
                }
                const meterContainer = document.getElementById('speakerMeterContainer');
                if (meterContainer) {
                    meterContainer.remove();
                }
                
                // Create new waveform canvases and meter canvases
                createWaveformCanvases();
                drawSpeakerMeters();
            });
        }
        drawAudioSpace();
    }
}

function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    listener = audioContext.listener;
    listener.setPosition(0, 0, 0);

    audioElement = document.getElementById('audioElement');
    audioSource = audioContext.createMediaElementSource(audioElement);

    masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.5, audioContext.currentTime);

    speakerNodes = speakers.map(speaker => {
        const panner = audioContext.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 1;
        panner.setPosition(...speaker.position);
    
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(1 / speakers.length, audioContext.currentTime);
    
        const analyser = createAnalyser();
    
        audioSource.connect(gain);
        gain.connect(analyser);
        analyser.connect(panner);
        panner.connect(masterGain);
    
        return { panner, gain, analyser };
    });

    masterGain.connect(audioContext.destination);
}

function createWaveformCanvases() {
    const container = document.createElement('div');
    container.id = 'waveformContainer';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.justifyContent = 'center';

    speakers.forEach((speaker, index) => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 100;
        canvas.id = `waveform-${index}`;
        
        const label = document.createElement('div');
        label.textContent = speaker.name;
        
        const wrapper = document.createElement('div');
        wrapper.style.margin = '10px';
        wrapper.style.textAlign = 'center';
        wrapper.appendChild(canvas);
        wrapper.appendChild(label);
        
        container.appendChild(wrapper);
    });

    document.body.appendChild(container);
}

function drawWaveforms() {
    speakerNodes.forEach((node, index) => {
        const canvas = document.getElementById(`waveform-${index}`);
        const ctx = canvas.getContext('2d');
        const analyser = node.analyser;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);
        
        ctx.fillStyle = 'rgb(200, 200, 200)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgb(0, 0, 0)';
        ctx.beginPath();
        
        const sliceWidth = canvas.width * 1.0 / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    });
}

function drawSpeakerMeters() {
    let meterContainer = document.getElementById('speakerMeterContainer');
    if (!meterContainer) {
        meterContainer = document.createElement('div');
        meterContainer.id = 'speakerMeterContainer';
        meterContainer.style.display = 'flex';
        meterContainer.style.justifyContent = 'center';
        meterContainer.style.flexWrap = 'wrap';
        meterContainer.style.position = 'fixed'; 
        meterContainer.style.zIndex = '1000'; 
        meterContainer.style.top = '400px'; // Distance from the top of the page
        meterContainer.style.left = '680px'; // Distance from the left of the page
        document.body.appendChild(meterContainer);
    }

    speakerNodes.forEach((node, index) => {
        let meterCanvas = document.getElementById(`speakerMeter-${index}`);
        if (!meterCanvas) {
            meterCanvas = document.createElement('canvas');
            meterCanvas.id = `speakerMeter-${index}`;
            meterCanvas.width = 30;
            meterCanvas.height = 100;
            meterCanvas.style.margin = '0 5px';
            
            const wrapper = document.createElement('div');
            wrapper.style.textAlign = 'center';
            wrapper.style.margin = '0 5px';
            
            const label = document.createElement('div');
            label.textContent = speakers[index].name;
            label.style.fontSize = '12px';
            
            wrapper.appendChild(meterCanvas);
            wrapper.appendChild(label);
            
            meterContainer.appendChild(wrapper);
        }

        const ctx = meterCanvas.getContext('2d');
        const analyser = node.analyser;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
        const level = average / 256;
        
        ctx.clearRect(0, 0, meterCanvas.width, meterCanvas.height);
        
        ctx.fillStyle = 'rgb(200, 200, 200)';
        ctx.fillRect(0, 0, meterCanvas.width, meterCanvas.height);
        
        const gradient = ctx.createLinearGradient(0, meterCanvas.height, 0, 0);
        gradient.addColorStop(0, 'green');
        gradient.addColorStop(0.6, 'yellow');
        gradient.addColorStop(1, 'red');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, meterCanvas.height * (1 - level), meterCanvas.width, meterCanvas.height * level);
    });
}

function startAudio() {
    if (!audioContext) initAudio();
    if (!ctx) initVisualization();
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (audioQueue.length === 0) {
        console.error("No audio files in queue.");
        return;
    }
    playTrack(currentTrackIndex);
    audioElement.play();
    isPlaying = true;
}

function playTrack(index) {
    if (index >= audioQueue.length) {
        console.log("Finished playing all tracks.");
        stopAudio(); // Stop everything when the queue ends
        return;
    }

    console.log(`Playing track: ${audioQueue[index]}`);

    // Set new source
    audioElement.src = audioQueue[index];
    audioElement.load();
    audioElement.play();
    isPlaying = true;

    // Ensure the correct position is applied based on the audio track
    const speakerOrder = [
        "Front Left", "Center", "Front Right",
        "Surround Left", "Surround Right",
        "Back Left", "Back Right"
    ];

    const speakerIndex = speakers.findIndex(s => s.name === speakerOrder[index]);

    if (speakerIndex !== -1) {
        let [x, , z] = speakers[speakerIndex].position;
        
               // Scale the position
               currentX = x * scaleFactor;
               currentZ = z * scaleFactor;
       
               updateAudioPositions();
               drawAudioSpace();
           }

    // Event listener for when the track ends
    audioElement.onended = function () {
        currentTrackIndex++;
        playTrack(currentTrackIndex);
    };

    animateSound();
}

function stopAudio() {
    if (audioContext) {
        audioElement.pause();
        audioElement.currentTime = 0;
    }
    currentTrackIndex = 0; // Reset to first track
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    isPlaying = false;
    drawAudioSpace();
}

function updateAudioPositions() {
    if (!audioContext || !speakerNodes.length) return;

    let gainDisplay = createGainDisplay();
    let gainText = '<h3>Speaker Gains:</h3>';

    speakerNodes.forEach((node, index) => {
        const speaker = speakers[index];
        const dx = currentX - speaker.position[0];
        const dz = currentZ - speaker.position[2];
        const distance = Math.sqrt(dx*dx + dz*dz);
        
        const amplitude = 1 / (1 + distance * distance);
        
        node.gain.gain.setValueAtTime(amplitude, audioContext.currentTime);

        gainText += `${speaker.name}: ${amplitude.toFixed(4)}<br>`;
    });

    gainDisplay.innerHTML = gainText;
}

function animateSound() {
    if (!isPlaying) return;

    updateAudioPositions();
    drawAudioSpace();
    drawWaveforms();
    drawSpeakerMeters();

    animationId = requestAnimationFrame(animateSound);
}

function drawAudioSpace() {
    if (!ctx) {
        console.error('Canvas context not initialized');
        return;
    }
    
    try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        ctx.fillStyle = '#00F';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillText('Listener', centerX + 10, centerY);

        speakers.forEach((speaker, index) => {
            const [sx, sy, sz] = speaker.position;
            const speakerX = centerX + (sx * canvas.width / 4);
            const speakerY = centerY - (sz * canvas.height / 4);
            
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.arc(speakerX, speakerY, 8, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#000';
            ctx.font = '10px Arial';
            ctx.fillText(speaker.name, speakerX + 10, speakerY);
            
            ctx.strokeStyle = '#CCC';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(speakerX, speakerY);
            ctx.stroke();
        });

        if (isPlaying) {
            ctx.fillStyle = '#F00';
            const sourceX = centerX + (currentX * canvas.width / 20);
            const sourceY = centerY - (currentZ * canvas.height / 20);
            ctx.beginPath();
            ctx.arc(sourceX, sourceY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.fillText('Sound Source', sourceX + 10, sourceY);

            ctx.strokeStyle = '#0F0';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(sourceX, sourceY);
            ctx.stroke();
        }
    } catch (error) {
        console.error('Error drawing audio space:', error);
    }
}

function startDrag(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const sourceX = centerX + (currentX * canvas.width / 20);
    const sourceY = centerY - (currentZ * canvas.height / 20);
    
    const distance = Math.sqrt((x - sourceX)**2 + (y - sourceY)**2);
    
    if (distance <= 8) {
        isDragging = true;
    }
}

function drag(e) {
    if (!isDragging) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    currentX = (x - centerX) / (canvas.width / 20);
    currentZ = -(y - centerY) / (canvas.height / 20);
    
    updateAudioPositions();
    drawAudioSpace();
}

function endDrag() {
    isDragging = false;
}

document.addEventListener('DOMContentLoaded', () => {
    initVisualization();
    drawAudioSpace();
    updateAudioPositions(); // Add this line to show initial gain values
    createWaveformCanvases();

    document.getElementById('startButton').addEventListener('click', startAudio);
    document.getElementById('stopButton').addEventListener('click', stopAudio);

    document.getElementById('applyConfig').addEventListener('click', () => {
        const config = document.getElementById('configSelect').value;
        console.log('Changing configuration to:', config);
        changeSpeakerConfiguration(config);
    });
});