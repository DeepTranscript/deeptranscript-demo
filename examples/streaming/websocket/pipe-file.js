const querystring = require('querystring');
const ws = require('ws');
const { createReadStream } = require('fs');
const { Transform } = require('stream');
const path = require('path');
const { generateTracing, realtimeAudioStream } = require('../../utils');

const { API_TOKEN } = process.env; // see https://app.deeptranscript.com/account/members

const chunks = [];
const tracing = {
    apiEvents: [],
    clientBytesEvents: [],
};
const outputDir = '/tmp';
const sampleRate = 8000;
const dataFormat = 's16le';
const fileName = `${path.dirname(require.main.filename)}/../../_files/count.wav`;
// Split file in small parts
const fileChunkStream = createReadStream(fileName)
    .pipe(new realtimeAudioStream(120));

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

    // stream file content
    const dataStream = fileChunkStream.pipe(new Transform({
        transform(chunk, encoding, callback) {
            const start = new Date().valueOf();
            this.push(chunk);
            const took = new Date().valueOf() - start;
            setTimeout(
                callback,
                ((chunk.length * 1000) / (sampleRate * 2) - took),
            );
        },
    }));

    // Raw data is sent as is, no preprocessing needed
    dataStream.on('data', (bytes) => {
        const localStart = new Date().valueOf();
        socket.send(bytes, { binary: true });
        chunks.push(bytes);
        const took = new Date().valueOf() - localStart;
        tracing.clientBytesEvents.push({ start: localStart - refTime, end: localStart - refTime + took, message: 'send data' });
    });

    // IMPORTANT: send an empty buffer to tell DT to terminate
    // if you don't, transcription will stop automatically after 3s not receiving any data
    dataStream.on('end', () => {
        const localStart = new Date().valueOf();
        chunks.push(Buffer.alloc(0));
        socket.send(Buffer.from([]), { binary: true });
        const took = new Date().valueOf() - localStart;
        tracing.clientBytesEvents.push({ start: localStart - refTime, end: localStart - refTime + took, message: 'send end' });
    });
});
socket.on('error', (err) => console.error(err));
socket.on('message', (data) => {
    const message = JSON.parse(data);
    tracing.apiEvents.push({ ...message, timestamp: new Date().valueOf() });
    console.log('message', message);
});
socket.on('close', () => {
    console.log('close event received => done');

    if (process.env.NODE_DEBUG) {
        // This will create an audacity file with a timeline of events and data
        generateTracing(refTime, outputDir, { path: fileName, sampleRate, channel: 0, format: dataFormat }, tracing);
    }

    process.exit(0);
});

function graceFullShutdown() {
    console.log('waiting for final transcription…');
    setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', graceFullShutdown);
process.on('SIGINT', graceFullShutdown);
