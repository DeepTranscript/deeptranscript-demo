const mic = require('mic'); // requires arecord or sox, see https://www.npmjs.com/package/mic
const querystring = require('querystring');
const ws = require('ws');

const { generateTracing } = require('../../utils');

const { API_TOKEN } = process.env; // see https://app.deeptranscript.com/account/members

if (!API_TOKEN) {
  throw new Error(`API_TOKEN required`);
}

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

const chunks = [];
const tracing = { apiEvents: [] };
const outputDir = '/tmp';
const sampleRate = 8000;
const micInstance = mic({
  rate: sampleRate.toString(),
  channels: '1',
  device: 'plughw:0,0', // see $ arecord --list-devices
  debug: true,
});
const micStream = micInstance.getAudioStream();

// This will be use as reference for tracing generation
const refTime = new Date().valueOf();

// Deeptranscript configuration
const qs = querystring.stringify({
  language: process.env.LANGUAGE || 'en',
  sampleRate, // WARN: must match mic configuration
  dataFormat: 's16le', // WARN: must match mic configuration
  // expectedPhrases: ['Deeptranscript rocks!'],
});
const socket = new ws.WebSocket(`wss://:${API_TOKEN}@stream.deeptranscript.com/?${qs}`);
// const socket = new ws.WebSocket(`ws://:${API_TOKEN}@localhost:4600/?${qs}`);
socket.once('open', () => {
  console.log('socket opened');
  micInstance.start();
  // Raw data is sent as is, no preprocessing needed
  micStream.on('data', (bytes) => {
    socket.send(bytes, { binary: true });
    chunks.push(bytes);
  });

  // IMPORTANT: send an empty buffer to tell DT to terminate
  // if you don't, transcription will stop automatically after 3s not receiving any data
  micStream.on('end', () => {
    chunks.push(Buffer.alloc(0));
    socket.send(Buffer.from([]), { binary: true });
  });
  console.log('microphone piped to websocket');
});

socket.on('error', (err) => console.error(err));
socket.on('message', (data) => {
  const message = JSON.parse(data);
  tracing.apiEvents.push({ ...message, timestamp: new Date().valueOf() });
  console.log('message', message);
});
socket.on('close', () => {
  const audacityFname = generateTracing(
    refTime,
    outputDir,
    { data: Buffer.concat(chunks), sampleRate, channel: 0 },
    tracing,
  );
  console.log(`websocket close event received => transcription complete\nSee "$ audacity ${audacityFname}" for more info`);
  process.exit(0);
});

function stopMicrophone() {
  console.log('waiting for final transcription…');
  setTimeout(() => process.exit(1), 5000);
  micInstance.stop();
  readline.close();
}

readline.question('Microphone listening. Press enter or ctrl+C once you are done speaking…', () => stopMicrophone());
process.on('SIGTERM', stopMicrophone);
process.on('SIGINT', stopMicrophone);
