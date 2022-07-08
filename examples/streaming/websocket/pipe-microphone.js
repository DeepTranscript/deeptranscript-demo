const mic = require("mic"); // requires arecord or sox, see https://www.npmjs.com/package/mic
const querystring = require("querystring");
const ws = require("ws");
const API_TOKEN = process.env.API_TOKEN;  // see https://app.deeptranscript.com/account/members
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const sampleRate = 8000;
const micInstance = mic({
    rate: sampleRate.toString(),
    channels: '1',
    device: 'plughw:0,0',  // see $ arecord --list-devices
    debug: true,
});

const micStream = micInstance.getAudioStream();
micInstance.start();

const qs = querystring.stringify({
    language: process.env.LANGUAGE || 'en',
    sampleRate: sampleRate,  // WARN: must match mic configuration
    dataFormat: 's16le',   // WARN: must match mic configuration
    // expectedPhrases: ['Deeptranscript rocks!'],
})
const socket = new ws.WebSocket(`wss://:${API_TOKEN}@stream.deeptranscript.com/?${qs}`);
socket.once('open', () => {
    console.log('socket opened');
    // Raw data is sent as is, no preprocessing needed
    micStream.on('data', (bytes) => socket.send(bytes, { binary: true }));

    // IMPORTANT: send an empty buffer to tell DT to terminate
    // if you don't, transcription will stop automatically after 3s not receiving any data
    micStream.on('end', () => socket.send(Buffer.from([]), { binary: true }));
});
socket.on('error', (err) => console.error(err));
socket.on('message', (message) => {
    message = JSON.parse(message);
    console.log("message", message)
});
socket.on('close', () => {
    console.log('close event received => done');
    process.exit(0);
});

let start;
function stopMicrophone() {
    console.log("waiting for final transcription…")
    setTimeout(() => process.exit(1), 5000);
    micInstance.stop();
    readline.close();
    start = new Date().valueOf();  // start counting on mic end
}

readline.question('Microphone listening. Press enter or ctrl+C once you are done speaking…', () => stopMicrophone());
process.on('SIGTERM', stopMicrophone);
process.on('SIGINT', stopMicrophone);
