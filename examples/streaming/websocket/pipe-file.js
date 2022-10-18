const querystring = require('querystring');
const ws = require('ws');
const { createReadStream } = require('fs');
const { Transform } = require('stream');

const { generateTracing } = require('../../utils');

const { API_TOKEN } = process.env; // see https://app.deeptranscript.com/account/members

if (!API_TOKEN) {
  throw new Error('API_TOKEN required');
}

const chunks = [];
const tracing = { apiEvents: [] };
const outputDir = '/tmp';
const sampleRate = 8000;
const dataFormat = 'wav'; // use s16le for raw audio
const fileName = `${__dirname}/../../_files/count.wav`;

// Split file in small parts and send them with the right delay to simulate live-streaming
const audioStream = createReadStream(fileName)
  .pipe(new Transform({
    transform(chunk, encoding, done) {
      'transform input stream into chunks of XXms';

      if (!this.chunkSize) {
        const frameDuration = 100;
        this.chunkSize = ((frameDuration * sampleRate) / 1000) * 2;
        this.buffer = Buffer.alloc(0); // local buffer
      }
      if (this.buffer.length) {
        chunk = Buffer.concat([this.buffer, chunk]);
        this.buffer = Buffer.alloc(0);
      }
      while (chunk.length >= this.chunkSize) {
        this.push(chunk.slice(0, this.chunkSize));
        chunk = chunk.slice(this.chunkSize);
      }
      if (chunk.length) {
        this.buffer = chunk.slice(0); // copy
      }
      done();
    },
  }))
  .pipe(new Transform({
    transform(chunk, encoding, callback) {
      'send chunks of XXms with the right delay to simulate live-streaming';

      setTimeout(
        () => {
          this.push(chunk);
          callback();
        },
        ((chunk.length * 1000) / (sampleRate * 2) - 1),
      );
    },
  }));

// This will be use as reference for tracing generation
const refTime = new Date().valueOf();

// Deeptranscript configuration
const qs = querystring.stringify({
  language: process.env.LANGUAGE || 'en',
  sampleRate, // WARN: must match file configuration
  dataFormat, // WARN: must match file configuration
  // expectedPhrases: ['Deeptranscript rocks!'],
});
const socket = new ws.WebSocket(`wss://:${API_TOKEN}@stream.deeptranscript.com/?${qs}`);
socket.once('open', () => {
  console.log('socket opened');
  // Raw data is sent as is, no preprocessing needed
  audioStream.on('data', (bytes) => {
    socket.send(bytes, { binary: true });
    chunks.push(bytes);
  });

  // IMPORTANT: send an empty buffer to tell DT to terminate
  // if you don't, transcription will stop automatically after 3s not receiving any data
  audioStream.on('end', () => {
    chunks.push(Buffer.alloc(0));
    socket.send(Buffer.from([]), { binary: true });
  });
});
socket.on('error', (err) => console.error(err));
socket.on('message', (data) => {
  const message = JSON.parse(data);
  tracing.apiEvents.push({ ...message, timestamp: new Date().valueOf() });
  console.log('message', message);
});
socket.on('close', () => {
  // This will create an audacity file with a timeline of events and data
  const audacityFname = generateTracing(
    refTime,
    outputDir,
    {
      path: fileName, sampleRate, channel: 0, format: dataFormat,
    },
    tracing,
  );
  console.log(`websocket close event received => transcription complete\nSee "$ audacity ${audacityFname}" for more info`);
  process.exit(0);
});

function graceFullShutdown() {
  console.log('waiting for final transcription…');
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', graceFullShutdown);
process.on('SIGINT', graceFullShutdown);
